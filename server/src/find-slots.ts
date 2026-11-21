// find_activity_slots: wannasport courts with free start times, price per court and per person.
import { z } from "zod";
import { tmin } from "../../planner/text";
import { SPORTS } from "../../planner/types";
import { ToolInputError, clock, compact, copenhagenToday, isoDate, limitField, notPast, notesField, ok, sourcesField, type ToolDeps } from "./common";
import { loadDaysFor } from "./days";
import type { Merged } from "../../planner/merge";

export const findSlotsInput = {
  sport: z.enum(SPORTS).describe("A sport with bookable courts. list_options has the valid values."),
  date: isoDate("date").describe("The day, YYYY-MM-DD."),
  from: clock("from").optional().describe("Earliest start time, HH:MM."),
  to: clock("to").optional().describe("Latest start time, HH:MM."),
  players: z.number().int().min(1).max(12).default(2).describe("Players sharing a court, for the price per person (default 2)."),
  limit: limitField,
};
const Args = z.object(findSlotsInput);
export type FindSlotsArgs = z.infer<typeof Args>;

export const findSlotsOutput = {
  total: z.number().describe("Courts with a free time in the window, over all that were found."),
  players: z.number(),
  courts: z.array(z.object({
    id: z.string().describe("Pass to get_details for every time."),
    venue: z.string().optional(), court: z.string().optional(), indoor: z.boolean().optional(),
    times: z.array(z.string()).describe("Free start times, HH:MM."),
    pricePerCourt: z.string().optional().describe("DKK per court per booking, e.g. 150-300."),
    pricePerPerson: z.string().optional().describe("The court price split by players."),
    url: z.string().optional().describe("Booking page: the user books there."),
  })),
  sources: sourcesField,
  notes: notesField,
};

const range = (a: number | null, b: number | null): string | undefined => (a == null ? undefined : a === (b ?? a) ? `${a}` : `${a}-${b}`);

export async function findSlots(deps: ToolDeps, a: FindSlotsArgs) {
  const today = (deps.today ?? copenhagenToday)();
  notPast(a.date, today, "date");
  if (a.from && a.to && a.to < a.from) throw new ToolInputError(`to (${a.to}) is before from (${a.from}).`);
  const loaded = await loadDaysFor(deps.cache, [a.date], ["wannasport"]);
  const from = tmin(a.from) ?? 0;
  const to = tmin(a.to) ?? 24 * 60;
  const found = loaded.days.items.filter((i) => i.kind === "slots" && i.extra.sport === a.sport);
  const courts = found
    .map((c) => ({ c, times: (c.times ?? []).filter((t) => tmin(t)! >= from && tmin(t)! <= to) }))
    .filter((x) => x.times.length)
    .sort((x, y) => (x.c.venue ?? "").localeCompare(y.c.venue ?? "", "da") || (x.c.priceMin ?? 0) - (y.c.priceMin ?? 0));
  const page = courts.slice(0, a.limit);
  deps.index.remember(page.map(({ c, times }) => ({ ...c, sources: [c.source], ids: [c.id], titles: [c.title], urls: c.url ? [c.url] : [], notes: [], mergedFrom: 1, timesIn: times }) as Merged), found);
  const notes = [...loaded.notes];
  if (!found.length && loaded.sources.every((s) => s.status !== "missing")) notes.push(`No ${a.sport} courts were listed for ${a.date}.`);
  else if (found.length && !courts.length) notes.push(`${found.length} courts exist but none has a free start time between ${a.from ?? "00:00"} and ${a.to ?? "24:00"}.`);
  return ok({
    total: courts.length,
    players: a.players,
    courts: page.map(({ c, times }) =>
      compact({
        id: c.id, venue: c.venue ?? undefined, court: c.extra.courtName ?? undefined, indoor: c.indoor ?? undefined, times,
        pricePerCourt: range(c.priceMin, c.priceMax), pricePerPerson: range(c.priceMin == null ? null : Math.round(c.priceMin / a.players), c.priceMax == null ? null : Math.round(c.priceMax / a.players)),
        url: c.url ?? undefined,
      }),
    ),
    sources: loaded.sources,
    notes,
  });
}
