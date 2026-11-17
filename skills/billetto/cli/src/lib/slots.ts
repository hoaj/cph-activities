// Billetto sells some events as many short slots, each a separate hit (11:00, 11:30, 12:00 …): one row per event.
export type Slot = { title: string; venue: string | null; startsAt: string | null; endsAt: string | null };

/** Lower case, punctuation removed, whitespace collapsed. */
export const normaliseTitle = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * Hits with the same normalised title, the same venue (or both none) and the same local date (`startsAt` is
 * local `YYYY-MM-DDTHH:MM`) become one event: the first hit's fields, `startsAt` the earliest, `endsAt` the
 * latest, `times` the local HH:MM of every slot sorted, `slots` their count. Order follows the first hit.
 */
export function groupSlots<T extends Slot>(hits: T[]): Array<T & { times: string[]; slots: number }> {
  const groups = new Map<string, { first: T; starts: string[]; ends: string[]; slots: number }>();
  for (const h of hits) {
    const key = JSON.stringify([normaliseTitle(h.title), h.venue, h.startsAt?.slice(0, 10) ?? null]);
    const g = groups.get(key);
    if (g) {
      g.slots++;
      if (h.startsAt) g.starts.push(h.startsAt);
      if (h.endsAt) g.ends.push(h.endsAt);
    } else {
      groups.set(key, { first: h, starts: h.startsAt ? [h.startsAt] : [], ends: h.endsAt ? [h.endsAt] : [], slots: 1 });
    }
  }
  return [...groups.values()].map((g) => {
    const starts = [...g.starts].sort();
    const ends = [...g.ends].sort();
    return {
      ...g.first,
      startsAt: starts[0] ?? g.first.startsAt,
      endsAt: ends[ends.length - 1] ?? g.first.endsAt,
      times: starts.map((s) => s.slice(11, 16)),
      slots: g.slots,
    };
  });
}
