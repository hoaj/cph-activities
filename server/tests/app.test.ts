import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { INSTRUCTIONS, PLAN_A_DAY_GUIDE } from "../src/instructions";
import { DATE, fakeDeps, forecast, item } from "./helpers";
import { createFeedback } from "../src/feedback";
import { slidingLimiter } from "../src/limits";
import { createLogger } from "../src/log";
import { parseLinks, sha256Hex } from "../src/links";
import { startServer } from "../src/server";

const SECRET = "TESTSECRET-abc_123";
const REVOKED = "REVOKEDSECRET-xyz";
const logs: string[] = [];
const deps = fakeDeps({
  items: [
    item({ id: "k:1", source: "kultunaut", title: "Jazzkoncert", time: "20:00", categories: ["Jazz"], priceMin: 100, priceText: "100 kr.", venue: "Huset" }),
    item({ id: "w:1", source: "wannasport", kind: "slots", title: "padel – Bane 1", venue: "DGI", indoor: true, times: ["10:00", "12:00"], priceMin: 200, priceMax: 200, categories: ["padel"], extra: { sport: "padel", courtName: "Bane 1" } }),
  ],
  weather: forecast("dry"),
});
const filed: { title: string; body: string; labels: string[] }[] = [];
const feedback = createFeedback({
  github: {
    listCandidates: async () => [],
    createIssue: async (i) => (filed.push(i), { number: 7, url: "https://github.test/7" }),
    comment: async () => ({ url: "https://github.test/7#c" }),
  },
  version: "1.2.3",
});
let server: ReturnType<typeof startServer>;
let base: string;

beforeAll(() => {
  server = startServer({
    port: 0,
    links: parseLinks(`anna:${sha256Hex(SECRET)}`),
    limiter: slidingLimiter({ perHour: 200, perDay: 1000 }),
    log: createLogger((l) => logs.push(l)),
    deps,
    feedback,
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
const optionsBody = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_options", arguments: {} } };

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
      const r = await rpc(optionsBody, url, from);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("");
    }
    const get = await fetch(`${base}/mcp/${REVOKED}`, { headers: from });
    expect(get.status).toBe(404);
    const bad = await rpc(optionsBody, `${base}/mcp`, { ...from, authorization: `Bearer ${REVOKED}` });
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
  test("a real client connects, reads the instructions and the prompt, and calls every tool", async () => {
    const client = await connect(`${base}/mcp/${SECRET}`);
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["find_activity_slots", "find_events", "get_details", "get_weather", "list_options", "plan_outing", "send_feedback"]);
    for (const t of tools.filter((t) => t.name !== "send_feedback")) expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    expect(tools.find((t) => t.name === "send_feedback")!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
    const prompt = await client.getPrompt({ name: "plan_a_day", arguments: { request: "Hvad skal vi lave?" } });
    expect(JSON.stringify(prompt.messages)).toContain("Hvad skal vi lave?");

    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError).toBeFalsy();
      expect(JSON.parse((r.content as { text: string }[])[0]!.text)).toEqual(r.structuredContent);
      return r.structuredContent as any;
    };
    const ask = await call("plan_outing", { brief: { people: [{ age: 31 }, {}] } });
    expect(ask.status).toBe("needs_input");
    const plan = await call("plan_outing", { brief: { people: [{ age: 31 }], date: DATE, mood: ["culture"] } });
    expect(plan.status).toBe("ok");
    expect(plan.best.items[0].title).toBe("Jazzkoncert");
    const events = await call("find_events", { from: DATE });
    expect(events.events.map((e: any) => e.title)).toEqual(["Jazzkoncert"]);
    const slots = await call("find_activity_slots", { sport: "padel", date: DATE });
    expect(slots.courts[0].times).toEqual(["10:00", "12:00"]);
    const weather = await call("get_weather", { date: DATE });
    expect(weather.verdict.outdoor).toBe("dry");
    const details = await call("get_details", { id: events.events[0].id });
    expect(details.title).toBe("Jazzkoncert");
    const options = await call("list_options");
    expect(options.sports).toContain("padel");
    const sent = await call("send_feedback", { kind: "idea", title: "Show cinema listings", what_happened: "There is no source for cinema showings.", approved: true });
    expect(sent).toEqual({ action: "created", issueUrl: "https://github.test/7", number: 7 });
    expect(filed).toHaveLength(1);
    expect(filed[0]!.title).toBe("feedback: Show cinema listings");
    expect(JSON.stringify(filed)).not.toContain("anna");
    expect(JSON.stringify(filed)).not.toContain(SECRET);
    await client.close();
  });

  test("bad input over the wire is a tool error result, not a protocol error", async () => {
    const client = await connect(`${base}/mcp/${SECRET}`);
    const r = await client.callTool({ name: "find_events", arguments: { from: "tomorrow" } });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain("YYYY-MM-DD");
    await client.close();
  });

  test("the bearer header works on /mcp", async () => {
    const client = await connect(`${base}/mcp`, { authorization: `Bearer ${SECRET}` });
    const res = await client.callTool({ name: "list_options", arguments: {} });
    expect(res.isError).toBeFalsy();
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
      deps: fakeDeps(),
    });
    try {
      const url = `http://localhost:${s.port}/mcp/p`;
      for (let i = 0; i < 2; i++) expect((await (await rpc(optionsBody, url)).json()).result.isError).toBeFalsy();
      const r = await rpc(optionsBody, url);
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
    await rpc(optionsBody, `${base}/mcp/${SECRET}`);
    const c = await connect(`${base}/mcp/${SECRET}`);
    await c.callTool({ name: "get_details", arguments: { id: "no-such" } });
    await c.close();
    await rpc(optionsBody, `${base}/mcp`, { authorization: `Bearer ${SECRET}` });
    await fetch(`${base}/mcp/${REVOKED}`, { headers: { "x-forwarded-for": "7.7.7.7" } });
    expect(logs.length).toBeGreaterThan(0);
    const all = logs.join("\n");
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(REVOKED);
    expect(all).not.toMatch(/\/mcp\/[^<]/);
    expect(all).toContain("anna");
  });
});

describe("instructions", () => {
  test("under 4,096 characters, and the first 512 stand alone", () => {
    expect(INSTRUCTIONS.length).toBeLessThan(4096);
    const head = INSTRUCTIONS.slice(0, 512);
    for (const word of ["plan_outing", "needs_input", "weather", "Nothing is booked"]) expect(head).toContain(word);
    expect(INSTRUCTIONS.split("\n\n")[0]!.length).toBeLessThanOrEqual(512); // a whole paragraph
  });
  test("tells the four steps and the weather rule", () => {
    for (const step of ["1. Brief", "2. Fetch", "3. Shortlist", "4. Answer"]) expect(INSTRUCTIONS).toContain(step);
    expect(INSTRUCTIONS).toContain("Mention it only when it matters");
    expect(PLAN_A_DAY_GUIDE.length).toBeGreaterThan(INSTRUCTIONS.length);
  });
});
