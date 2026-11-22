// get_details: one item, by an id another tool returned: every source's link, the description, every slot.
import { z } from "zod";
import { ToolInputError, compact, notesField, okWith, type ToolDeps } from "./common";
import { priceOf } from "./find-events";
import type { SourceCounter } from "./cache";
import { runSkill } from "../../planner/fetch-day";
import type { Item } from "../../planner/types";

// brugbyen's lists carry no text and a page per event for a whole day would hammer the site, so the description
// is read on demand, for the one event get_details is asked about: `brugbyen event show` runs in this process
// through the per-source counting fetch (the hourly cap applies). A text is kept 24 hours by row id, a failure or an
// empty page 10 minutes, so a broken page is not retried at once; calls for one id share one request.
export type DescriptionResult = { ok: true; description: string | null } | { ok: false; capped: boolean };
export type DescriptionLoader = (id: string, path: string) => Promise<DescriptionResult>;

const HOUR = 3600_000;

export function createDescriptionLoader(o: { counter?: SourceCounter; stateRoot?: string; ttlMs?: number; negativeMs?: number; max?: number; now?: () => number; run?: typeof runSkill } = {}): DescriptionLoader {
  const now = o.now ?? Date.now;
  const run = o.run ?? runSkill;
  const kept = new Map<string, { until: number; result: DescriptionResult }>();
  const inflight = new Map<string, Promise<DescriptionResult>>();

  const load = async (path: string): Promise<DescriptionResult> => {
    const trips = o.counter?.trips("brugbyen") ?? 0;
    const deps = { ...(o.counter ? { fetch: o.counter.fetchFor("brugbyen") } : {}), ...(o.stateRoot ? { stateRoot: o.stateRoot } : {}) };
    try {
      const r = await run("brugbyen", ["event", "show", "--url", path], deps);
      if (r.ok) {
        const d = r.output?.description;
        return { ok: true, description: typeof d === "string" && d.trim() ? d.trim() : null };
      }
      return { ok: false, capped: (o.counter?.trips("brugbyen") ?? 0) > trips };
    } catch {
      return { ok: false, capped: false };
    }
  };

  return async (id, path) => {
    const t = now();
    const hit = kept.get(id);
    if (hit && hit.until > t) return hit.result;
    let p = inflight.get(id);
    if (!p) {
      p = load(path).then((result) => {
        kept.delete(id);
        kept.set(id, { until: now() + (result.ok && result.description ? (o.ttlMs ?? 24 * HOUR) : (o.negativeMs ?? 10 * 60_000)), result });
        while (kept.size > (o.max ?? 2000)) kept.delete(kept.keys().next().value!);
        return result;
      }).finally(() => inflight.delete(id));
      inflight.set(id, p);
    }
    return p;
  };
}

/** The brugbyen row to ask for a description: the first with a page, none when another source gives a description. */
function brugbyenRow(item: { extra: { description?: string } }, rows: Item[]): Item | undefined {
  if (item.extra.description) return undefined;
  return rows.find((r) => r.source === "brugbyen" && r.url);
}

export const getDetailsInput = {
  id: z.string().min(1, "id is required").max(300).describe("An id from plan_outing, find_events or find_activity_slots."),
};

export const getDetailsOutput = {
  id: z.string(), title: z.string(), alsoCalled: z.array(z.string()).optional(), kind: z.enum(["event", "show", "slots"]),
  date: z.string(), time: z.string().optional(), endTime: z.string().optional(), venue: z.string().optional(), address: z.string().optional(),
  price: z.string().optional(), priceMin: z.number().optional(), priceMax: z.number().optional(), free: z.boolean().optional(),
  ageFrom: z.number().optional(), audience: z.array(z.string()).optional(), categories: z.array(z.string()).optional(), indoor: z.boolean().optional(),
  description: z.string().optional().describe("The full description, up to 300 characters (brugbyen: up to 500, read from the event's page). Absent: no source gives one."),
  links: z.array(z.object({ source: z.string(), url: z.string(), title: z.string().optional() })).describe("One per source that lists it. The user books or buys there."),
  slots: z.array(z.string()).optional().describe("Every free court time, or every start time of the event."),
  perCourt: z.boolean().optional().describe("true when the price is per court, not per person."),
  notes: notesField,
};

export async function getDetails(deps: ToolDeps, a: { id: string }) {
  const hit = deps.index.get(a.id);
  if (!hit) throw new ToolInputError(`Unknown id "${a.id}". Ids come from plan_outing, find_events and find_activity_slots and are kept for about two hours: repeat the search that found it and use the id it returns.`);
  const { item: m, rows } = hit;
  let description = m.extra.description || undefined;
  const fetchNotes: string[] = [];
  const row = deps.descriptions ? brugbyenRow(m, rows) : undefined;
  if (row) {
    let path: string | null = null;
    try {
      path = new URL(row.url!).pathname;
    } catch {}
    const r = path ? await deps.descriptions!(row.id, path) : ({ ok: false, capped: false } as DescriptionResult);
    if (r.ok) description = r.description ?? undefined;
    else fetchNotes.push("brugbyen's page could not be read: no description.");
  }
  const links = rows.filter((r) => r.url).map((r) => ({ source: r.source, url: r.url!, title: r.title !== m.title ? r.title : undefined }));
  return okWith(compact({
    id: a.id, title: m.title, alsoCalled: m.titles.filter((t) => t !== m.title), kind: m.kind, date: m.date, time: m.time ?? undefined, endTime: m.endTime ?? undefined,
    venue: m.venue ?? undefined, address: m.address ?? undefined, price: priceOf(m), priceMin: m.priceMin ?? undefined, priceMax: m.priceMax ?? undefined,
    free: m.free === true || m.priceMin === 0 ? true : undefined, ageFrom: m.ageFrom ?? undefined, audience: m.audience, categories: m.categories, indoor: m.indoor ?? undefined,
    description, links, slots: m.times, perCourt: m.extra.perCourt || undefined,
  }), [], [...m.notes, ...fetchNotes, ...(description || m.kind === "slots" ? [] : ["No description is stored for this event: say you do not know what it is; do not guess from the title. Point the user to the link."]), ...(m.timeMayDiffer ? ["The time shown is from another date: check the page."] : [])]);
}
