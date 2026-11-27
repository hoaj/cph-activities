import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Chat } from "../src/chat";
import { createSigner } from "../src/keys";
import { slidingLimiter } from "../src/limits";
import { createLogger } from "../src/log";
import { parseLinks } from "../src/links";
import { startServer } from "../src/server";
import { createSite } from "../src/site";
import { fakeDeps } from "./helpers";

const signer = createSigner("s".repeat(40));
const logs: string[] = [];
const asked: number[] = [];
const chat: Chat = { enabled: true, reply: async (h) => (asked.push(h.length), { reply: `svar på ${h.at(-1)!.content}`, toolCalls: 0 }) };
let server: ReturnType<typeof startServer>;
let base: string;

beforeAll(() => {
  const log = createLogger((l) => logs.push(l));
  server = startServer({
    port: 0,
    links: parseLinks(""),
    signer,
    site: createSite({ signer, chat, publicUrl: "https://cph.example.com", log, limits: { keysPerIpDay: 2, chatPerUserHour: 2, chatPerUserDay: 10, chatPerIpDay: 3, chatPerDay: 100 } }),
    limiter: slidingLimiter({ perHour: 100, perDay: 100 }),
    log,
    deps: fakeDeps(),
    trustProxy: true,
  });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("the page is served at / with a content security policy", async () => {
  const r = await fetch(base + "/");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("text/html");
  expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
  expect(await r.text()).toContain("Hvad sker der i København");
  expect((await fetch(base + "/", { method: "POST" })).status).toBe(405);
});

test("a personal address works on /mcp, a changed one is a 404, and an address may make only so many", async () => {
  const ip = { "x-forwarded-for": "10.0.0.1" };
  const r = await post("/api/keys", {}, ip);
  expect(r.status).toBe(200);
  const { url } = (await r.json()) as { url: string };
  expect(url).toMatch(/^https:\/\/cph\.example\.com\/mcp\/[0-9a-f]{64}$/);
  const path = new URL(url).pathname;
  const rpc = (p: string) =>
    fetch(base + p, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
  const listed = await rpc(path);
  expect(listed.status).toBe(200);
  expect(JSON.stringify(await listed.json())).toContain("plan_outing");
  expect((await rpc(path.slice(0, -1) + (path.endsWith("0") ? "1" : "0"))).status).toBe(404);

  expect((await post("/api/keys", {}, ip)).status).toBe(200);
  const third = await post("/api/keys", {}, ip);
  expect(third.status).toBe(429);
  expect(((await third.json()) as { error: string }).error).toContain("mange adresser");
  expect((await post("/api/keys", {}, { "x-forwarded-for": "10.0.0.2" })).status).toBe(200);
  expect(logs.some((l) => l.includes(path.slice(5)))).toBe(false);
});

test("keys need JSON, so a plain cross-site form cannot make one", async () => {
  const r = await fetch(base + "/api/keys", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "a=1" });
  expect(r.status).toBe(415);
});

test("the chat sets a browser cookie and limits each browser and each address", async () => {
  const ip = { "x-forwarded-for": "10.0.1.1" };
  const first = await post("/api/chat", { messages: [{ role: "user", content: "hej" }] }, ip);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ reply: "svar på hej" });
  const cookie = first.headers.get("set-cookie")!;
  expect(cookie).toMatch(/^cph_uid=[0-9a-f]{64}; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
  const jar = { ...ip, cookie: cookie.split(";")[0]! };

  const second = await post("/api/chat", { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }] }, jar);
  expect(second.status).toBe(200);
  expect(second.headers.get("set-cookie")).toBeNull();
  const third = await post("/api/chat", { messages: [{ role: "user", content: "igen" }] }, jar);
  expect(third.status).toBe(429);
  expect(((await third.json()) as { error: string }).error).toContain("Du har brugt dine 2 beskeder for denne time");

  // A new browser on the same address: the address ceiling (3 a day) is reached first.
  const other = await post("/api/chat", { messages: [{ role: "user", content: "hej" }] }, ip);
  expect(other.status).toBe(429);
  expect(((await other.json()) as { error: string }).error).toContain("fra din forbindelse");
});

test("the chat refuses an empty conversation and one that ends with the assistant", async () => {
  const ip = { "x-forwarded-for": "10.0.2.1" };
  expect((await post("/api/chat", { messages: [] }, ip)).status).toBe(400);
  expect((await post("/api/chat", { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }, ip)).status).toBe(400);
  expect((await post("/api/chat", { nope: 1 }, ip)).status).toBe(400);
});

test("history is trimmed to the last twelve turns, starting with the user", async () => {
  asked.length = 0;
  const messages = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const r = await post("/api/chat", { messages }, { "x-forwarded-for": "10.0.3.1" });
  expect(r.status).toBe(200);
  expect(asked).toEqual([11]);
});

test("without an LLM or KEY_SECRET the chat and keys say they are not set up", async () => {
  const site = createSite({ chat: { enabled: false, reply: async () => ({ reply: "", toolCalls: 0 }) }, log: () => {} });
  const req = (p: string) => new Request("http://x" + p, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect((await site(req("/api/chat"), "/api/chat", "1.2.3.4"))!.status).toBe(503);
  expect((await site(req("/api/keys"), "/api/keys", "1.2.3.4"))!.status).toBe(503);
  expect(await site(req("/other"), "/other", "1.2.3.4")).toBeNull();
});
