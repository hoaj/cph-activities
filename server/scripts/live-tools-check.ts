// Live check, not in CI: starts the server locally with a link and, over the MCP SDK client, runs plan_outing
// for the coming Saturday, then find_events and get_weather, printing counts, source statuses and timing.
// Calls the real sources (a few dozen requests). Usage: bun server/scripts/live-tools-check.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createToolDeps } from "../src/deps";
import { slidingLimiter } from "../src/limits";
import { parseLinks, sha256Hex } from "../src/links";
import { createLogger } from "../src/log";
import { startServer } from "../src/server";

const SECRET = "live-check-" + crypto.randomUUID();
const log = createLogger((l) => process.env.VERBOSE && console.log("  log", l));
const server = startServer({ port: 0, links: parseLinks(`live:${sha256Hex(SECRET)}`), limiter: slidingLimiter(), log, deps: createToolDeps(process.env, log) });
const client = new Client({ name: "live-check", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${server.port}/mcp/${SECRET}`)));

const saturday = (() => {
  const d = new Date(Date.now() + 86400_000);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

async function call(name: string, args: Record<string, unknown>) {
  const started = Date.now();
  const r = await client.callTool({ name, arguments: args });
  const ms = Date.now() - started;
  const data = r.structuredContent as any;
  console.log(`\n${name} ${JSON.stringify(args).slice(0, 120)}: ${ms} ms${r.isError ? " ERROR " + JSON.stringify(r.content) : ""}`);
  if (data?.sources) console.log("  sources: " + data.sources.map((s: any) => `${s.source}=${s.status}${s.kind ? `(${s.kind})` : ""}`).join(" "));
  if (data?.notes?.length) console.log("  notes: " + data.notes.join(" | "));
  return data;
}

const plan = await call("plan_outing", { brief: { people: [{ label: "mig", age: 31 }, { label: "lillebror", age: 17 }], date: saturday, mood: ["active", "gaming"], budgetPerPerson: 300 } });
if (plan?.status === "ok") {
  const all = [plan.best, ...plan.alternatives].filter(Boolean);
  console.log(`  weather: ${plan.weather ?? "(not mentioned)"}; candidates ${plan.stats.candidates}; ${all.length} suggestions`);
  for (const s of all) console.log(`   - [${s.kind}] ${s.title} (${s.items.length} item${s.items.length === 1 ? "" : "s"}): ${s.items[0].time}, ${s.items[0].price}`);
  console.log(`  next: ${plan.next.map((n: any) => n.label).join(" | ")}`);
  if (all[0]) {
    const d = await call("get_details", { id: all[0].items[0].ids[0] });
    console.log(`  details: ${d?.title}, ${d?.links?.length ?? 0} link(s)`);
  }
} else console.log("  status: " + plan?.status);

const ev = await call("find_events", { from: saturday, limit: 10 });
console.log(`  total ${ev?.total}, page ${ev?.events?.length}, facets bySource ${JSON.stringify(ev?.facets?.bySource)}, nextCursor ${ev?.nextCursor ? "yes" : "no"}`);
const wx = await call("get_weather", { date: saturday });
console.log(`  weather: ${wx?.available ? wx.line : "none"}`);

const again = Date.now();
await call("find_events", { from: saturday, limit: 10 });
console.log(`  (second find_events, from the cache: ${Date.now() - again} ms)`);
await client.close();
server.stop(true);
process.exit(0);
