import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { INSTRUCTIONS } from "../src/instructions";
import { slidingLimiter } from "../src/limits";
import { createLogger } from "../src/log";
import { parseLinks, sha256Hex } from "../src/links";
import { startServer } from "../src/server";

const SECRET = "TESTSECRET-abc_123";
const REVOKED = "REVOKEDSECRET-xyz";
const logs: string[] = [];
let server: ReturnType<typeof startServer>;
let base: string;

beforeAll(() => {
  server = startServer({
    port: 0,
    links: parseLinks(`anna:${sha256Hex(SECRET)}`),
    limiter: slidingLimiter({ perHour: 3, perDay: 10 }),
    log: createLogger((l) => logs.push(l)),
    missLimit: 5,
    trustProxy: true,
  });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

const rpc = (body: unknown, url: string, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
const pingBody = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ping", arguments: {} } };

async function connect(url: string, headers?: Record<string, string>) {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), headers ? { requestInit: { headers } } : undefined));
  return client;
}

describe("healthz", () => {
  test("answers 200 ok outside the links", async () => {
    const r = await fetch(`${base}/healthz`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });
});

describe("links", () => {
  test("unknown, revoked and missing secrets get a bare 404", async () => {
    const from = { "x-forwarded-for": "1.1.1.1" };
    for (const url of [`${base}/mcp/${REVOKED}`, `${base}/mcp/`, `${base}/mcp`, `${base}/elsewhere`, `${base}/`]) {
      const r = await rpc(pingBody, url, from);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("");
    }
    const get = await fetch(`${base}/mcp/${REVOKED}`, { headers: from });
    expect(get.status).toBe(404);
    const bad = await rpc(pingBody, `${base}/mcp`, { ...from, authorization: `Bearer ${REVOKED}` });
    expect(bad.status).toBe(404);
  });

  test("GET and DELETE on a good link answer 405", async () => {
    for (const method of ["GET", "DELETE"]) {
      const r = await fetch(`${base}/mcp/${SECRET}`, { method });
      expect(r.status).toBe(405);
      expect(r.headers.get("allow")).toBe("POST");
    }
  });

  test("repeated misses from one address are throttled with 429; a good link still works", async () => {
    const from = { "x-forwarded-for": "9.9.9.9" };
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await fetch(`${base}/mcp/nope${i}`, { headers: from })).status);
    expect(statuses).toEqual([404, 404, 404, 404, 404, 429, 429, 429]);
    expect((await fetch(`${base}/mcp/nope`, { headers: from })).headers.get("retry-after")).toBeTruthy();
    const ok = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, `${base}/mcp/${SECRET}`, from);
    expect(ok.status).toBe(200);
    // Another address is not throttled.
    expect((await fetch(`${base}/mcp/nope`, { headers: { "x-forwarded-for": "8.8.8.8" } })).status).toBe(404);
  });
});

describe("MCP over a link", () => {
  test("a real client connects, reads the instructions and calls ping", async () => {
    const client = await connect(`${base}/mcp/${SECRET}`);
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name)).toEqual(["ping"]);
    expect(tools[0]!.annotations?.readOnlyHint).toBe(true);
    const res = await client.callTool({ name: "ping", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.stringify(res.content)).toContain("pong");
    await client.close();
  });

  test("the bearer header works on /mcp", async () => {
    const client = await connect(`${base}/mcp`, { authorization: `Bearer ${SECRET}` });
    const res = await client.callTool({ name: "ping", arguments: {} });
    expect(JSON.stringify(res.content)).toContain("pong");
    await client.close();
  });
});

describe("limits and logs", () => {
  test("over the limit, a tool call gets an error result with the reset time, not a 429", async () => {
    // A second server so the counts of the tests above do not matter.
    const s = startServer({
      port: 0,
      links: parseLinks(`peter:${sha256Hex("p")}`),
      limiter: slidingLimiter({ perHour: 2, perDay: 10 }),
      log: () => {},
    });
    try {
      const url = `http://localhost:${s.port}/mcp/p`;
      for (let i = 0; i < 2; i++) expect((await (await rpc(pingBody, url)).json()).result.isError).toBeFalsy();
      const r = await rpc(pingBody, url);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/2 tool calls per hour.*resets at \d{4}-\d\d-\d\dT[\d:]+Z/s);
      // Listing tools is not a tool call.
      expect((await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, url)).status).toBe(200);
    } finally {
      s.stop(true);
    }
  });

  test("no log line holds the secret, the path of a link or a bearer token", async () => {
    await rpc(pingBody, `${base}/mcp/${SECRET}`);
    await rpc(pingBody, `${base}/mcp`, { authorization: `Bearer ${SECRET}` });
    await fetch(`${base}/mcp/${REVOKED}`, { headers: { "x-forwarded-for": "7.7.7.7" } });
    expect(logs.length).toBeGreaterThan(0);
    const all = logs.join("\n");
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(REVOKED);
    expect(all).not.toMatch(/\/mcp\/[^<]/);
    expect(all).toContain("anna");
  });
});

test("instructions: the first 512 characters stand alone, the whole is under 4,096", () => {
  expect(INSTRUCTIONS.length).toBeGreaterThan(512);
  expect(INSTRUCTIONS.length).toBeLessThan(4096);
  const head = INSTRUCTIONS.slice(0, 512).toLowerCase();
  for (const word of ["copenhagen", "brief", "shortlist", "3"]) expect(head).toContain(word);
  expect(INSTRUCTIONS).toMatch(/books and buys nothing/i);
});
