// Counts every upstream request per source in a sliding hour, and refuses to make one over the cap.
// The planner's fetchDay takes it as `deps.fetch`, so the skills' own requests (retries included) are counted.
import type { Source } from "../../../planner/types";

const HOUR = 3600_000;

/** Thrown by a counting fetch over the cap. fetchDay turns it into an error entry; the cache reads `trips()`. */
export class CapExceeded extends Error {
  constructor(public readonly source: string) {
    super(`the upstream cap for ${source} is used up`);
  }
}

export interface SourceCounter {
  /** Upstream requests the source made in the last hour. */
  used(source: Source): number;
  cap(source: Source): number;
  /** Counts one request (a billetto Chrome bootstrap is counted this way: it is no `deps.fetch` request). */
  record(source: Source): void;
  /** How many requests were refused over the cap, ever. A fetch that sees this grow was cut short. */
  trips(source: Source): number;
  /** When the oldest counted request leaves the hour (ms since epoch), or null when none counts. */
  resetsAt(source: Source): number | null;
  /** A `fetch` for one source: counts, and throws CapExceeded over the cap instead of fetching. */
  fetchFor(source: Source, base?: typeof fetch): typeof fetch;
}

export function createSourceCounter(o: { defaultCap?: number; caps?: Partial<Record<Source, number>>; now?: () => number } = {}): SourceCounter {
  const now = o.now ?? Date.now;
  const stamps = new Map<Source, number[]>();
  const trips = new Map<Source, number>();
  const cap = (s: Source) => o.caps?.[s] ?? o.defaultCap ?? 30;
  const live = (s: Source) => {
    const t = now();
    const list = (stamps.get(s) ?? []).filter((x) => x > t - HOUR);
    stamps.set(s, list);
    return list;
  };
  const self: SourceCounter = {
    used: (s) => live(s).length,
    cap,
    record(s) {
      live(s).push(now());
    },
    trips: (s) => trips.get(s) ?? 0,
    resetsAt(s) {
      const first = live(s)[0];
      return first === undefined ? null : first + HOUR;
    },
    fetchFor(s, base = fetch) {
      const counted = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (self.used(s) >= cap(s)) {
          trips.set(s, (trips.get(s) ?? 0) + 1);
          return Promise.reject(new CapExceeded(s));
        }
        self.record(s);
        return base(input, init);
      };
      return counted as typeof fetch;
    },
  };
  return self;
}
