import type { EventSource, Item } from "./types";
import { norm, samePlace, tmin, uniq } from "./text";

/** An item after merging: the lead row's fields plus everything the sources said. */
export interface Merged extends Item {
  sources: EventSource[];
  /** Every merged row's id, for `excludeIds`. */
  ids: string[];
  titles: string[];
  urls: string[];
  notes: string[];
  mergedFrom: number;
  timeMayDiffer?: boolean;
  /** Court times inside the brief's window (kind "slots"). */
  timesIn?: string[];
  freeGuess?: boolean;
}

/** Who leads when sources disagree: Billetto sells the tickets, so it is usually the most current; kglteater is the theatre's own programme. */
const PRIORITY: Record<string, number> = { kglteater: -1, billetto: 0, teaterbilletter: 1, kulturkbh: 2, absalon: 3, kultunaut: 4, brugbyen: 5 };

/** Same title once normalised, or one contains the other (at least five characters). */
export function titleSame(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 5 && l.includes(s);
}

/**
 * The guide skill's merge rules: same date, start times within 30 minutes (or one has none), same title;
 * or different titles with the same exact time and place and an agreeing price ("probably the same").
 * Court slots are never merged.
 */
export function mergeItems(items: Item[]): Merged[] {
  const ev = items.filter((i) => i.kind !== "slots");
  const parent = ev.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const byDate = new Map<string, number[]>();
  ev.forEach((it, i) => byDate.set(it.date, [...(byDate.get(it.date) ?? []), i]));
  const notesOf = new Map<number, string[]>();
  for (const idx of byDate.values()) {
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        const x = ev[idx[a]!]!;
        const y = ev[idx[b]!]!;
        if (x.source === y.source) continue;
        const tx = tmin(x.time);
        const ty = tmin(y.time);
        const closeTime = tx == null || ty == null || Math.abs(tx - ty) <= 30;
        let same = closeTime && titleSame(x.title, y.title);
        let probable = false;
        if (!same && tx != null && tx === ty && samePlace(x.venue, y.venue)) {
          if (x.priceMin == null || y.priceMin == null || x.priceMin === y.priceMin) {
            same = true;
            probable = true;
          }
        }
        if (!same) continue;
        parent[find(idx[a]!)] = find(idx[b]!);
        if (probable) {
          notesOf.set(idx[a]!, [
            ...(notesOf.get(idx[a]!) ?? []),
            `${x.source} kalder det "${x.title}", ${y.source} "${y.title}": samme tid og sted`,
          ]);
        }
      }
    }
  }
  const groups = new Map<number, number[]>();
  ev.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));

  const out: Merged[] = [];
  for (const g of groups.values()) {
    const rows = g.map((i) => ev[i]!).sort((a, b) => (PRIORITY[a.source] ?? 9) - (PRIORITY[b.source] ?? 9));
    const lead = rows[0]!;
    const m: Merged = {
      ...lead,
      sources: uniq(rows.map((r) => r.source)),
      ids: rows.map((r) => r.id),
      titles: uniq(rows.map((r) => r.title)),
      urls: uniq(rows.map((r) => r.url)),
      notes: g.flatMap((i) => notesOf.get(i) ?? []),
      audience: uniq(rows.flatMap((r) => r.audience ?? [])),
      categories: uniq(rows.flatMap((r) => r.categories ?? [])),
      mergedFrom: rows.length,
    };
    m.time = lead.time || rows.find((r) => r.time)?.time || null;
    m.endTime = lead.endTime || rows.find((r) => r.endTime)?.endTime || null;
    const priced = rows.find((r) => r.priceMin != null);
    if (priced) {
      m.priceMin = priced.priceMin;
      m.priceMax = priced.priceMax;
      m.priceText = priced.priceText;
    }
    if (rows.some((r) => r.free === true)) {
      m.free = true;
      m.priceMin = 0;
    }
    const aged = rows.find((r) => r.ageFrom != null);
    if (aged) m.ageFrom = aged.ageFrom;
    const addressed = rows.find((r) => /\d{4}/.test(r.address ?? ""));
    if (addressed) {
      m.address = addressed.address;
      if (!m.venue) m.venue = addressed.venue;
    }
    const longest = rows.map((r) => r.extra?.description ?? "").sort((a, b) => b.length - a.length)[0];
    m.extra = { ...lead.extra, description: longest };
    if (rows.some((r) => r.extra?.timeMayDiffer) && !rows.some((r) => r.source !== "brugbyen" && r.time)) m.timeMayDiffer = true;
    if (uniq(rows.map((r) => r.time)).length > 1) {
      m.notes.push("tider afviger: " + rows.filter((r) => r.time).map((r) => `${r.source} ${r.time}`).join(", "));
    }
    out.push(m);
  }
  for (const s of items.filter((i) => i.kind === "slots")) {
    out.push({ ...s, sources: [s.source], ids: [s.id], titles: [s.title], urls: uniq([s.url]), notes: [], mergedFrom: 1 });
  }
  return out;
}
