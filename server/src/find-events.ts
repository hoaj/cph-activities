// find_events: merged, deduplicated events across the event sources, filtered here (the cache holds
// whole days), with facets and a cursor. Rows are compact; get_details has the rest.
import { z } from "zod";
import { annotate } from "../../planner/features";
import { mergeItems } from "../../planner/merge";
import type { Merged } from "../../planner/merge";
import { norm, tmin, uniq } from "../../planner/text";
import { EVENT_SOURCES } from "../../planner/types";
import type { Audience, Item } from "../../planner/types";
import { ToolInputError, addDays, clock, compact, copenhagenToday, isoDate, limitField, notPast, notesField, ok, sourcesField, type ToolDeps } from "./common";
import { loadDaysFor } from "./days";

export const MAX_DAYS = 7;
/** Event sources: every source but the court slots (find_activity_slots) and the weather. */
export const EVENT_ONLY = EVENT_SOURCES.filter((s) => s !== "wannasport");

export const findEventsInput = {
  from: isoDate("from").describe("First day, YYYY-MM-DD."),
  to: isoDate("to").optional().describe(`Last day, YYYY-MM-DD. Default: the same day as from. At most ${MAX_DAYS} days in all.`),
  query: z.string().max(100).optional().describe("Words the title, category or description must all contain, e.g. 'jazz' or 'standup'."),
  categories: z.array(z.string().max(60)).max(10).optional().describe("Keep events in any of these categories (case-insensitive, matches part of a category name). Valid names: list_options."),
  free: z.boolean().optional().describe("true: only free events."),
  maxPricePerPerson: z.number().min(0).optional().describe("Highest cheapest-ticket price in DKK. Events with no price listed are kept and counted in notes."),
  fromTime: clock("fromTime").optional().describe("Earliest start, HH:MM; a Christmas market counts while it is open. Events with no start time are left out when this or toTime is set."),
  toTime: clock("toTime").optional().describe("Latest start, HH:MM."),
  audienceAge: z.number().int().min(0).max(120).optional().describe("Age of the youngest guest: drops 18+ events for under 18, children's events for teenagers, and keeps only child-made events for under 10."),
  excludeKids: z.boolean().optional().describe("true: drop children's events."),
  limit: limitField,
  cursor: z.string().max(200).optional().describe("The nextCursor of the previous call, for the next page of the same search."),
};
const Args = z.object(findEventsInput);
export type FindEventsArgs = z.infer<typeof Args>;

const row = z.object({
  id: z.string().describe("Pass to get_details."),
  title: z.string(), date: z.string(), time: z.string().optional(), endTime: z.string().optional(),
  description: z.string().nullable().describe("What the event is, up to 300 characters. null: no source gives one: say you do not know what it is, never guess from the title."),
  categories: z.array(z.string()).describe("Genre or category names; [] when none."),
  audience: z.array(z.string()).describe("Who it is for (børn, unge, voksne, familie); [] when not said."),
  ageFrom: z.number().nullable().describe("Minimum age; null when none is stated."),
  venue: z.string().nullable(),
  price: z.string().nullable().describe("Price as text, e.g. '150 kr.', 'gratis'; null when not listed."),
  free: z.boolean().nullable().describe("true: free; false: costs money; null: unknown."),
  sources: z.array(z.string()), url: z.string().optional(),
});
const counts = z.record(z.string(), z.number());
export const findEventsOutput = {
  total: z.number().describe("Events matching, over all pages."),
  events: z.array(row),
  nextCursor: z.string().optional().describe("Present when there are more: pass as cursor."),
  facets: z.object({ bySource: counts, byCategory: counts, byTimeOfDay: counts, byPriceBand: counts }).describe("Counts over all matching events, to suggest a narrower search."),
  sources: sourcesField,
  notes: notesField,
};

const kidsAge = (age: number): Audience => (age < 13 ? "børn" : age < 18 ? "unge" : "voksne");

/** The filters, in server code. Returns the matching merged items in date and time order, and notes. */
export function filterEvents(merged: Merged[], a: Pick<FindEventsArgs, "query" | "categories" | "free" | "maxPricePerPerson" | "fromTime" | "toTime" | "audienceAge" | "excludeKids">): { kept: Merged[]; notes: string[] } {
  const notes: string[] = [];
  const words = norm(a.query ?? "").split(" ").filter(Boolean);
  const cats = (a.categories ?? []).map((c) => norm(c)).filter(Boolean);
  const from = tmin(a.fromTime);
  const to = tmin(a.toTime);
  const age = a.audienceAge;
  let unpriced = 0;
  let untimed = 0;
  const kept = merged.filter((it) => {
    const f = annotate(it);
    if (words.length && !words.every((w) => f.text.includes(w))) return false;
    if (cats.length && !cats.some((c) => it.categories.some((x) => norm(x).includes(c)))) return false;
    if (a.free && !(it.free === true || it.priceMin === 0)) return false;
    if (a.excludeKids && f.kids) return false;
    if (age != null) {
      if (age < 18 && f.adult) return false;
      if (age >= 13 && (f.kids || (it.ageFrom != null && it.ageFrom <= age - 8 && f.audKids))) return false;
      if (age < 10 && !(f.kids || f.audKids)) return false;
      if (f.minAge != null && f.minAge > age && age < 13) return false;
    }
    if (from != null || to != null) {
      const t = tmin(it.time);
      if (t == null) { untimed++; return false; }
      // a market is open for hours: it matches when those hours overlap the window
      const closes = it.source === "visitorservice" ? tmin(it.endTime) : null;
      if (closes != null ? (from != null && closes <= from) || (to != null && t > to) : (from != null && t < from) || (to != null && t > to)) return false;
    }
    if (a.maxPricePerPerson != null) {
      if (it.priceMin == null) unpriced++;
      else if (it.priceMin > a.maxPricePerPerson) return false;
    }
    return true;
  });
  if (unpriced) notes.push(`${unpriced} events have no price listed and are kept; their price is unknown, not zero.`);
  if (untimed) notes.push(`${untimed} events without a start time were left out because of the time window.`);
  kept.sort((x, y) => x.date.localeCompare(y.date) || (tmin(x.time) ?? 24 * 60) - (tmin(y.time) ?? 24 * 60) || x.title.localeCompare(y.title, "da"));
  return { kept, notes };
}

const bump = (r: Record<string, number>, k: string) => void (r[k] = (r[k] ?? 0) + 1);

export function facetsOf(items: Merged[]) {
  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byTimeOfDay: Record<string, number> = {};
  const byPriceBand: Record<string, number> = {};
  for (const it of items) {
    for (const s of it.sources) bump(bySource, s);
    for (const c of uniq(it.categories.map((x) => norm(x)))) bump(byCategory, c);
    const t = tmin(it.time);
    bump(byTimeOfDay, t == null ? "unknown" : t < 12 * 60 ? "morning" : t < 17 * 60 ? "afternoon" : t < 22 * 60 ? "evening" : "night");
    const p = it.priceMin;
    bump(byPriceBand, it.free === true || p === 0 ? "free" : p == null ? "unknown" : p <= 100 ? "1-100" : p <= 300 ? "101-300" : "300+");
  }
  const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return { bySource, byCategory: Object.fromEntries(top), byTimeOfDay, byPriceBand };
}

export const priceOf = (it: Item): string | undefined => (it.free === true || it.priceMin === 0 ? "gratis" : (it.priceText ?? (it.priceMin != null ? `fra ${it.priceMin} kr.` : undefined)) || undefined);

export function eventRow(it: Merged) {
  const free = it.free === true || it.priceMin === 0 ? true : it.free;
  return {
    ...compact({
      id: it.ids[0]!, title: it.title, date: it.date, time: it.time ?? undefined, endTime: it.endTime ?? undefined, sources: it.sources, url: it.urls[0] || it.url || undefined,
    }),
    description: it.extra.description || null, categories: it.categories.slice(0, 5), audience: it.audience, ageFrom: it.ageFrom ?? null,
    venue: it.venue ?? null, price: priceOf(it) ?? null, free,
  };
}

/** Rows at or above this many without a description get a note (one or two are not worth the words). */
const NO_DESCRIPTION_NOTE_AT = 3;

const fingerprint = (a: FindEventsArgs) => Bun.hash(JSON.stringify([a.from, a.to, a.query, a.categories, a.free, a.maxPricePerPerson, a.fromTime, a.toTime, a.audienceAge, a.excludeKids])).toString(36);
const encodeCursor = (offset: number, fp: string) => Buffer.from(JSON.stringify({ o: offset, f: fp })).toString("base64url");
function decodeCursor(c: string, fp: string): number {
  try {
    const { o, f } = JSON.parse(Buffer.from(c, "base64url").toString());
    if (f !== fp) throw new ToolInputError("cursor belongs to a different search: call again without cursor, or repeat the same filters.");
    if (!Number.isInteger(o) || o < 0) throw new Error();
    return o;
  } catch (e) {
    if (e instanceof ToolInputError) throw e;
    throw new ToolInputError("cursor is not valid: use the nextCursor of the previous find_events call unchanged, or leave cursor out.");
  }
}

export async function findEvents(deps: ToolDeps, a: FindEventsArgs) {
  const today = (deps.today ?? copenhagenToday)();
  const to = a.to ?? a.from;
  if (to < a.from) throw new ToolInputError(`to (${to}) is before from (${a.from}).`);
  notPast(a.from, today, "from");
  const dates: string[] = [];
  for (let d = a.from; d <= to; d = addDays(d, 1)) {
    dates.push(d);
    if (dates.length > MAX_DAYS) throw new ToolInputError(`The range is longer than ${MAX_DAYS} days. Ask for at most ${MAX_DAYS} days at a time.`);
  }
  if (a.fromTime && a.toTime && a.toTime < a.fromTime) throw new ToolInputError(`toTime (${a.toTime}) is before fromTime (${a.fromTime}).`);
  const fp = fingerprint(a);
  const offset = a.cursor ? decodeCursor(a.cursor, fp) : 0;

  const loaded = await loadDaysFor(deps.cache, dates, EVENT_ONLY, a.audienceAge != null ? kidsAge(a.audienceAge) : undefined);
  const events = loaded.days.items.filter((i) => i.kind !== "slots");
  const { kept, notes } = filterEvents(mergeItems(events), a);
  const page = kept.slice(offset, offset + a.limit);
  deps.index.remember(page, events);
  const next = offset + page.length;
  const rows = page.map(eventRow);
  const blank = rows.filter((r) => r.description === null).length;
  if (blank >= NO_DESCRIPTION_NOTE_AT) notes.push(`${blank} of these have no description: use get_details or say you do not know what it is.`);
  return ok({
    total: kept.length,
    events: rows,
    ...(next < kept.length ? { nextCursor: encodeCursor(next, fp) } : {}),
    facets: facetsOf(kept),
    sources: loaded.sources,
    notes: [...loaded.notes, ...notes],
  });
}
