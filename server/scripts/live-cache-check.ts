// Live check, not in CI: fetch two days from every source twice through the cache. The second run must
// make zero upstream requests. Usage: bun server/scripts/live-cache-check.ts
import { SOURCES } from "../../planner/types";
import { DayCache, createSourceCounter } from "../src/cache";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dates = [1, 2].map((n) => iso(new Date(Date.now() + n * 86400_000)));
const counter = createSourceCounter({ defaultCap: 1000 }); // high: this checks caching, not the cap
const cache = new DayCache({ counter, log: (e, x) => console.log("  log", e, JSON.stringify(x)) });
const total = () => SOURCES.reduce((n, s) => n + counter.used(s), 0);

for (const run of [1, 2]) {
  const before = total();
  const started = Date.now();
  const { statuses } = await cache.getDays(SOURCES, dates);
  console.log(`run ${run}: ${total() - before} upstream requests, ${Date.now() - started} ms`);
  console.log("  requests per source: " + SOURCES.map((s) => `${s}=${counter.used(s)}`).join(" "));
  console.log("  " + statuses.map((s) => `${s.source}/${s.date.slice(5)}=${s.status}${s.kind ? `(${s.kind})` : ""}`).join(" "));
}
