#!/usr/bin/env bun
/**
 * Live smoke test, not part of `bun test` and not run in CI: runs fetchDay for every source for one day
 * against the real sites and prints the counts.
 *
 *   bun planner/smoke.ts [YYYY-MM-DD]     (default: the next Saturday)
 *
 * Exit 0 when every source answered (and the event sources returned something); 1 otherwise.
 * Billetto needs Chrome (SITE_CLI_CHROME or the usual install path).
 */
import { fetchDay } from "./fetch-day";
import { SOURCES } from "./types";
import { assemble } from "./days";
import { planOuting } from "./plan";

function nextSaturday(): string {
  const d = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

const date = process.argv[2] ?? nextSaturday();
console.log(`fetchDay for ${date}, all sources in parallel`);
const t0 = performance.now();
const results = await Promise.all(
  SOURCES.map(async (s) => {
    const t = performance.now();
    return { r: await fetchDay(s, date), ms: Math.round(performance.now() - t) };
  }),
);

let failed = 0;
for (const { r, ms } of results) {
  const what = r.source === "dmi" ? `weather ${r.weather?.day ? "ok" : "missing"}${r.weather?.evening ? " + evening" : ""}` : `${r.items.length} items (${r.rawCount} rows)`;
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.source.padEnd(16)} ${what.padEnd(34)} ${String(r.calls).padStart(2)} calls ${ms} ms`);
  for (const e of r.errors) console.log(`       ${e.kind} (${e.command}): ${e.message}${e.fingerprint ? ` [${e.fingerprint}]` : ""}`);
  if (!r.ok) failed++;
  else if (r.source !== "dmi" && r.items.length === 0) {
    console.log("       no items: unexpected for a normal day");
    failed++;
  }
}
console.log(`done in ${Math.round(performance.now() - t0)} ms`);

const days = assemble([date], results.map((x) => x.r));
const plan = planOuting({ people: [{ age: 30 }, { age: 30 }], date, mood: ["culture"] }, days);
console.log(plan.status === "ok" ? `planOuting: best = ${plan.best?.title ?? "none"}; ${plan.alternatives.length} alternatives; weather: ${plan.weather ?? "not mentioned"}` : `planOuting: ${plan.status}`);
process.exit(failed ? 1 : 0);
