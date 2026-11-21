/**
 * Raw command output of each skill -> Item[]. Pure: no I/O, so the shapes the skills return are tested
 * against recorded outputs. The skills' outputs are read loosely (`any`): a shape that changed is a
 * Drift the skill's own Contract reports before it reaches here.
 */
import type { Forecast, Item, WeatherDay } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const cut = (s: unknown, n = 200): string => (typeof s === "string" ? (s.length > n ? s.slice(0, n - 1) + "…" : s) : "");
const num = (x: unknown): number | null => (typeof x === "number" ? x : null);
const hhmm = (s: unknown): string | null => (typeof s === "string" && /^\d\d:\d\d/.test(s) ? s.slice(0, 5) : null);

/** "20-120 kr." -> {min:20, max:120}; text without a kr. or dkk unit gives nothing (a pointer, not a price). */
export function parsePrice(text: string | null | undefined): { min: number | null; max: number | null } {
  if (!text || !/kr|dkk/i.test(text)) return { min: null, max: null };
  const ns = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1]!.replace(",", ".")));
  return ns.length ? { min: Math.min(...ns), max: Math.max(...ns) } : { min: null, max: null };
}

const base = (o: Partial<Item> & Pick<Item, "id" | "source" | "title" | "date">): Item => ({
  kind: "event", time: null, endTime: null, venue: null, address: null, area: "cph", priceText: null, priceMin: null,
  priceMax: null, free: null, ageFrom: null, audience: [], categories: [], indoor: null, url: null, extra: {}, ...o,
});

/** A stable id from what identifies a row when the source gives none (no list position: it shifts). */
const rowId = (source: string, date: string, time: string | null, title: string, venue?: string | null) =>
  `${source}:${date}:${time ?? "-"}:${title}${venue ? ":" + venue : ""}`;

export function kulturkbh(raw: Raw, date: string): Item[] {
  return (raw?.events ?? []).map((e: Raw) => {
    const p = parsePrice(e.price);
    const d = e.date ?? date;
    return base({
      id: rowId("kulturkbh", d, hhmm(e.time), e.title, e.venue), source: "kulturkbh", title: e.title, date: d, time: hhmm(e.time),
      venue: e.venue?.split(",")[0] ?? null, address: e.venue ?? null, area: e.area ?? "cph", priceText: e.price ?? null,
      priceMin: e.free ? 0 : p.min, priceMax: e.free ? 0 : p.max, free: e.free ?? null, categories: [e.type].filter(Boolean),
      indoor: ["film", "teater", "udstilling", "foredrag", "litteratur"].includes(e.type) ? true : null,
      url: e.url ?? null, extra: { description: cut(e.description), alsoAt: e.alsoAt ?? [] },
    });
  });
}

export function billetto(raw: Raw, date: string): Item[] {
  return (raw?.events ?? [])
    .filter((e: Raw) => !e.ongoing)
    .map((e: Raw) => {
      const startDate = (e.startsAt ?? date).slice(0, 10);
      return base({
        id: `billetto:${e.id}`, source: "billetto", title: e.title, date: startDate, time: hhmm(e.startsAt?.slice(11)),
        endTime: e.endsAt && e.endsAt.slice(0, 10) === startDate ? hhmm(e.endsAt.slice(11)) : null,
        venue: e.venue ?? null, address: e.address ?? null, priceText: e.priceRange ?? null, priceMin: e.free ? 0 : num(e.price),
        priceMax: e.free ? 0 : (parsePrice(e.priceRange).max ?? num(e.price)), free: e.free ?? null,
        categories: [e.category, e.subcategory].filter(Boolean), url: e.url ?? null, times: e.times ?? undefined,
        extra: { description: cut(e.description), onSale: e.onSale, slots: e.slots },
      });
    });
}

export function kultunaut(raw: Raw, date: string, tag = "all"): Item[] {
  return (raw?.events ?? [])
    .filter((e: Raw) => !e.ongoing)
    .map((e: Raw) => {
      const genres = String(e.genre ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return base({
        id: `kultunaut:${e.id}`, source: "kultunaut", title: e.title, date: e.date ?? date, time: hhmm(e.time), endTime: hhmm(e.endTime),
        venue: e.venue ?? null, area: e.area ?? "cph", categories: genres, audience: genres.some((g) => /børn/i.test(g)) ? ["børn"] : [],
        indoor: genres.some((g) => /biograf|film|teater|udstilling|foredrag/i.test(g)) ? true : null,
        url: e.url ?? null, extra: { description: cut(e.description), fetch: tag },
      });
    });
}

export function brugbyen(raw: Raw, date: string, group: string): Item[] {
  return (raw?.events ?? []).map((e: Raw) =>
    base({
      id: `brugbyen:${e.id}`, source: "brugbyen", title: e.title, date: e.date ?? date, time: hhmm(e.time), endTime: hhmm(e.endTime),
      venue: e.venue ?? null, area: e.area ?? "cph", audience: [group], url: e.url ?? null,
      extra: { timeMayDiffer: !!e.timeMayDiffer, recurring: !!e.recurring, group },
    }),
  );
}

export function teaterbilletter(raw: Raw, date: string): Item[] {
  return (raw?.shows ?? [])
    .filter((e: Raw) => e.date === date)
    .map((e: Raw) =>
      base({
        id: rowId("teaterbilletter", e.date, hhmm(e.time), e.title, e.venue), source: "teaterbilletter", kind: "show", title: e.title,
        date: e.date, time: hhmm(e.time), venue: e.venue ?? null, address: e.address ?? null, area: e.area ?? "cph",
        priceText: e.priceMinDKK != null ? `${e.priceMinDKK}–${e.priceMaxDKK} kr.` : null, priceMin: num(e.priceMinDKK),
        priceMax: num(e.priceMaxDKK), free: e.priceMaxDKK === 0, ageFrom: num(e.ageFrom),
        audience: (e.ageFrom != null && e.ageFrom <= 12) || /børn/i.test(e.subCategory ?? "") ? ["børn"] : [],
        categories: [e.category, e.subCategory].filter(Boolean), indoor: true, url: e.bookingUrl ?? e.url ?? null,
        extra: { premiere: !!e.premiere },
      }),
    );
}

export function absalon(raw: Raw, date: string): Item[] {
  return (raw?.events ?? [])
    .filter((e: Raw) => e.date === date)
    .map((e: Raw) => {
      const cats: string[] = e.categories ?? [];
      const p = parsePrice(e.price);
      return base({
        id: rowId("absalon", e.date, hhmm(e.time), e.title), source: "absalon", title: e.title, date: e.date, time: hhmm(e.time),
        endTime: hhmm(e.endTime), venue: e.venue ?? null, address: e.address ?? null, priceText: e.price ?? null, free: e.free ?? null,
        priceMin: e.free ? 0 : p.min, priceMax: e.free ? 0 : p.max,
        audience: cats.some((c) => /børn/i.test(c)) ? ["børn", "familie"] : [], categories: cats,
        indoor: cats.some((c) => /ude-af-huset/i.test(c)) ? false : null, url: e.url ?? null, extra: { description: cut(e.description) },
      });
    });
}

export function wannasport(raw: Raw, date: string, sport: string): Item[] {
  const out: Item[] = [];
  for (const v of raw?.venues ?? []) {
    for (const c of v.courts ?? []) {
      const indoor = /inde/i.test(c.name) && !/udend|ude\b/i.test(c.name) ? true : /udend|\bude\b/i.test(c.name) ? false : null;
      out.push(
        base({
          id: `wannasport:${date}:${sport}:${v.venue}:${c.name}`, source: "wannasport", kind: "slots", title: `${raw.sport ?? sport} – ${c.name}`,
          date, venue: v.venue, area: v.area ?? "cph",
          priceText: c.priceMinDKK != null ? `${c.priceMinDKK}–${c.priceMaxDKK} kr. pr. bane` : null, priceMin: num(c.priceMinDKK),
          priceMax: num(c.priceMaxDKK), free: false, categories: [sport], indoor, times: c.times ?? [], url: c.url ?? null,
          extra: { sport, perCourt: true, courtName: c.name },
        }),
      );
    }
  }
  return out;
}

/** The same row fetched twice (kultunaut's two calls, brugbyen's three audiences): one item, audiences joined. */
export function dedupe(items: Item[]): Item[] {
  const seen = new Map<string, Item>();
  const out: Item[] = [];
  for (const it of items) {
    const k = it.id + "|" + it.date;
    const prev = seen.get(k);
    if (prev) {
      prev.audience = [...new Set([...prev.audience, ...it.audience])];
      continue;
    }
    seen.set(k, it);
    out.push(it);
  }
  return out;
}

export function forecast(raw: Raw): Forecast | null {
  if (!raw?.verdict) return null;
  return {
    verdict: raw.verdict, day: raw.day, text: raw.text ?? null, warnings: raw.warnings?.texts ?? [],
    hours: (raw.hours ?? []).map((h: Raw) => ({ time: h.time, temp: h.temp, description: h.description, precipMm: h.precipMm })),
  };
}

export const weatherDay = (day: Raw, evening: Raw): WeatherDay => ({ day: forecast(day), evening: forecast(evening) });
