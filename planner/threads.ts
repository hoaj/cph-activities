import type { EventSource } from "./types";
import { norm, uniq } from "./text";

export const STOP = new Set(
  "og i på til for med af en et den det de der som kl fra om at er var vil kan bliver ved over under efter før hos mod ind ud fra alle vores jeres dig mig os jer din dit dine min mit mine kom prøv få lav lær mød the and of in with your our all".split(" "),
);
const GENERIC = new Set(
  "koncert workshop børn familie jul julen julemarked foredrag udstilling åbent åben film teater musik kultur gratis dag dagen aften lørdag søndag onsdag nov november weekend event arrangement billetter spillet legestue kursus aften nyt ny fest festival marked quiz bingo yoga".split(" "),
);

export interface ThreadInput {
  kind: string;
  title: string;
  titles: string[];
  sources: EventSource[];
}
export interface Thread {
  key: string;
  /** Indexes into the input list. */
  members: number[];
  sources: EventSource[];
}

/**
 * Festivals, themes and venues that several sources point to on one day. A key is one long word (needs 3
 * items) or a pair of words (needs 2), across at least two sources; the strongest keys claim items first.
 */
export function findThreads(cands: ThreadInput[]): Thread[] {
  const toks = (t: string) => norm(t).split(" ").filter(Boolean);
  const map = new Map<string, Set<number>>();
  cands.forEach((c, i) => {
    if (c.kind === "slots") return;
    const keys = new Set<string>();
    for (const title of c.titles?.length ? c.titles : [c.title]) {
      const w = toks(title);
      for (let k = 0; k < w.length; k++) {
        const a = w[k]!;
        const b = w[k + 1];
        if (!STOP.has(a) && !GENERIC.has(a) && a.length >= 7 && !/^\d+$/.test(a)) keys.add(a);
        if (
          b !== undefined &&
          !STOP.has(a) &&
          !STOP.has(b) &&
          !(GENERIC.has(a) && GENERIC.has(b)) &&
          a.length >= 2 &&
          b.length >= 2 &&
          !/^\d+$/.test(a) &&
          !/^\d+$/.test(b)
        ) {
          keys.add(a + " " + b);
        }
      }
    }
    for (const k of keys) {
      if (!map.has(k)) map.set(k, new Set());
      map.get(k)!.add(i);
    }
  });

  const found: { key: string; mem: number[]; strength: number }[] = [];
  for (const [key, set] of map) {
    const mem = [...set];
    if (mem.length < (key.includes(" ") ? 2 : 3) || mem.length > 14) continue;
    const srcs = uniq(mem.flatMap((i) => cands[i]!.sources));
    if (srcs.length < 2) continue;
    // a title-prefix or quoted theme is stronger than an incidental word pair
    const strong = mem.filter((i) => (cands[i]!.titles?.length ? cands[i]!.titles : [cands[i]!.title]).some((t) => norm(t).startsWith(key))).length;
    found.push({ key, mem, strength: srcs.length * 3 + mem.length + strong * 2 + (key.includes(" ") ? 2 : 0) });
  }
  found.sort((a, b) => b.strength - a.strength);

  const used = new Set<number>();
  const threads: Thread[] = [];
  for (const t of found) {
    const free = t.mem.filter((i) => !used.has(i));
    const sources = uniq(free.flatMap((i) => cands[i]!.sources));
    if (free.length < 2 || sources.length < 2) continue;
    free.forEach((i) => used.add(i));
    threads.push({ key: t.key, members: free, sources });
  }
  return threads;
}
