// get_details: one item, by an id another tool returned: every source's link, the description, every slot.
import { z } from "zod";
import { ToolInputError, compact, notesField, okWith, type ToolDeps } from "./common";
import { priceOf } from "./find-events";

export const getDetailsInput = {
  id: z.string().min(1, "id is required").max(300).describe("An id from plan_outing, find_events or find_activity_slots."),
};

export const getDetailsOutput = {
  id: z.string(), title: z.string(), alsoCalled: z.array(z.string()).optional(), kind: z.enum(["event", "show", "slots"]),
  date: z.string(), time: z.string().optional(), endTime: z.string().optional(), venue: z.string().optional(), address: z.string().optional(),
  price: z.string().optional(), priceMin: z.number().optional(), priceMax: z.number().optional(), free: z.boolean().optional(),
  ageFrom: z.number().optional(), audience: z.array(z.string()).optional(), categories: z.array(z.string()).optional(), indoor: z.boolean().optional(),
  description: z.string().optional().describe("The full stored description, up to 300 characters. Absent: no source gives one."),
  links: z.array(z.object({ source: z.string(), url: z.string(), title: z.string().optional() })).describe("One per source that lists it. The user books or buys there."),
  slots: z.array(z.string()).optional().describe("Every free court time, or every start time of the event."),
  perCourt: z.boolean().optional().describe("true when the price is per court, not per person."),
  notes: notesField,
};

export async function getDetails(deps: ToolDeps, a: { id: string }) {
  const hit = deps.index.get(a.id);
  if (!hit) throw new ToolInputError(`Unknown id "${a.id}". Ids come from plan_outing, find_events and find_activity_slots and are kept for about two hours: repeat the search that found it and use the id it returns.`);
  const { item: m, rows } = hit;
  const links = rows.filter((r) => r.url).map((r) => ({ source: r.source, url: r.url!, title: r.title !== m.title ? r.title : undefined }));
  return okWith(compact({
    id: a.id, title: m.title, alsoCalled: m.titles.filter((t) => t !== m.title), kind: m.kind, date: m.date, time: m.time ?? undefined, endTime: m.endTime ?? undefined,
    venue: m.venue ?? undefined, address: m.address ?? undefined, price: priceOf(m), priceMin: m.priceMin ?? undefined, priceMax: m.priceMax ?? undefined,
    free: m.free === true || m.priceMin === 0 ? true : undefined, ageFrom: m.ageFrom ?? undefined, audience: m.audience, categories: m.categories, indoor: m.indoor ?? undefined,
    description: m.extra.description || undefined, links, slots: m.times, perCourt: m.extra.perCourt || undefined,
  }), [], [...m.notes, ...(m.extra.description || m.kind === "slots" ? [] : ["No description is stored for this event: say you do not know what it is; do not guess from the title. Point the user to the link."]), ...(m.timeMayDiffer ? ["The time shown is from another date: check the page."] : [])]);
}
