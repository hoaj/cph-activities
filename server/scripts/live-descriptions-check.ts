// Live check, not in CI: find_events through the server code for a Saturday with every event source, then
// how many rows have a description, per source (the rows each source gives) and over the merged rows the tool returns.
// Calls the real sources (a few dozen requests). Usage: bun server/scripts/live-descriptions-check.ts [YYYY-MM-DD]
import { EVENT_ONLY, findEvents } from "../src/find-events";
import { createToolDeps } from "../src/deps";
import { createLogger } from "../src/log";

const saturday =
  process.argv[2] ??
  (() => {
    const d = new Date(Date.now() + 86400_000);
    while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
const log = createLogger((l) => process.env.VERBOSE && console.log("  log", l));
const deps = createToolDeps(process.env, log);

const raw = await deps.cache.getDays(EVENT_ONLY, [saturday]);
console.log(`${saturday}: rows each source gives (before merging)`);
for (const s of EVENT_ONLY) {
  const rows = raw.days.items.filter((i) => i.source === s && i.kind !== "slots");
  const withD = rows.filter((i) => i.extra.description).length;
  const lens = rows.map((i) => i.extra.description?.length ?? 0);
  console.log(`  ${s.padEnd(16)} ${String(withD).padStart(4)} / ${String(rows.length).padEnd(4)} with a description, longest ${Math.max(0, ...lens)}`);
}

const rows: any[] = [];
let notes: string[] = [];
let cursor: string | undefined;
do {
  const r = (await findEvents(deps, { from: saturday, limit: 50, ...(cursor ? { cursor } : {}) })).structuredContent as any;
  rows.push(...r.events);
  notes = r.notes;
  cursor = r.nextCursor;
} while (cursor);
const withD = rows.filter((r) => r.description).length;
console.log(`find_events rows (merged): ${withD} / ${rows.length} with a description (${rows.length ? Math.round((100 * withD) / rows.length) : 0}%)`);
console.log(`  categories: ${rows.filter((r) => r.categories.length).length}, audience: ${rows.filter((r) => r.audience.length).length}, ageFrom: ${rows.filter((r) => r.ageFrom != null).length}, venue: ${rows.filter((r) => r.venue).length}, price: ${rows.filter((r) => r.price).length}, free known: ${rows.filter((r) => r.free != null).length}`);
console.log("  last page notes: " + JSON.stringify(notes));
const per: Record<string, [number, number]> = {};
for (const r of rows) for (const s of r.sources) (per[s] ??= [0, 0])[r.description ? 0 : 1]++;
console.log("  merged rows listing each source, with / without: " + Object.entries(per).map(([s, [a, b]]) => `${s}=${a}/${b}`).join(" "));
const longest = Math.max(0, ...rows.map((r) => r.description?.length ?? 0));
console.log(`  longest description: ${longest} characters`);
process.exit(0);
