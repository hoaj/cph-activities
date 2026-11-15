// Finds the first page of a start-time-ordered list that can hold an event starting at or after a time,
// by galloping then binary search, so a late evening is reached in a few requests instead of paging from the morning.
// KultuNaut's list is several time-ordered runs (timed rows, then untimed ones, then a second timed run, then
// multi-day rows), not one: a probed page whose last time is below the last time of a page already known to be
// too early belongs to a later run, so it counts as "at or after" and the search lands in the first run. The
// caller pages forward from the page returned and so still reads the later runs.

export type PageProbe = { times: Array<string | null>; full: boolean };

const lastTime = (p: PageProbe): string | null => [...p.times].reverse().find((t) => t !== null) ?? null;

export async function firstPageAtOrAfter<T extends PageProbe>(
  fetchPage: (page: number) => Promise<T>,
  fromTime: string,
  maxProbes = 14,
): Promise<{ page: number; probes: number; cache: Map<number, T> }> {
  const cache = new Map<number, T>();
  let probes = 0;
  const get = async (p: number): Promise<T> => {
    let hit = cache.get(p);
    if (!hit) {
      hit = await fetchPage(p);
      cache.set(p, hit);
      probes++;
    }
    return hit;
  };
  // true when no event after this page can be earlier than fromTime: its last time is >= fromTime, it has none, or the list ends here.
  let loLast = "";
  const atOrAfter = (p: PageProbe) => {
    const last = lastTime(p);
    return last === null || last >= fromTime || !p.full || last < loLast;
  };

  if (atOrAfter(await get(0))) return { page: 0, probes, cache };
  let lo = 0;
  let hi = -1;
  loLast = lastTime(cache.get(0)!) ?? "";
  for (let p = 1; probes < maxProbes; p = p * 2) {
    if (atOrAfter(await get(p))) {
      hi = p;
      break;
    }
    lo = p;
    loLast = lastTime(cache.get(p)!) ?? "";
  }
  if (hi < 0) return { page: lo + 1, probes, cache }; // out of probes: the earliest page not known to be too early
  while (hi - lo > 1 && probes < maxProbes) {
    const mid = Math.floor((lo + hi) / 2);
    if (atOrAfter(await get(mid))) hi = mid;
    else {
      lo = mid;
      loLast = lastTime(cache.get(mid)!) ?? "";
    }
  }
  return { page: hi - lo > 1 ? lo + 1 : hi, probes, cache };
}
