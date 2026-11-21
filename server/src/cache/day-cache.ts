// The server's read-through cache around the planner's fetchDay: one entry per source per day (brugbyen:
// per audience), in memory. Stale-while-revalidate, one in-flight fetch per key, least-recently-used
// eviction, a per-source upstream cap, and a graceful answer when a source drifts or fails.
import { readFileSync } from "node:fs";
import { assemble } from "../../../planner/days";
import { cacheKey, fetchDay as plannerFetchDay } from "../../../planner/fetch-day";
import type { DayFetch, FetchDayDeps, FetchDayOptions, SourceErrorKind } from "../../../planner/fetch-day";
import type { Audience, PlannerDays, Source } from "../../../planner/types";
import type { Log } from "../log";
import { createSourceCounter, type SourceCounter } from "./counting-fetch";
import { loggingFiler, type IssueFiler } from "./issues";

export type DayState = "fresh" | "stale" | "capped" | "missing";
/** The failure kinds of the envelope, plus `capped`. */
export type StatusKind = SourceErrorKind | "capped";

export interface DayStatus {
  source: Source;
  date: string;
  /**
   * fresh: within its TTL. stale: past its TTL (a refresh is under way or has failed: `kind` then says why).
   * capped: past its TTL and the source's hourly upstream cap is used up. missing: no data at all.
   */
  status: DayState;
  /** Age of the data served; null when there is none. */
  ageSeconds: number | null;
  /** Why the data is not fresh or missing (the last failure). Absent for fresh data and for a plain expiry. */
  kind?: StatusKind;
  /** true for stale and capped. */
  stale: boolean;
  /** ISO time the first refresh failed after the data was last good. */
  staleSince?: string;
  /** `capped` when the cap is why. */
  note?: string;
}

export interface DayResult {
  fetch: DayFetch;
  status: DayStatus;
}

export interface DayCacheOptions {
  /** Default: the planner's fetchDay. */
  fetchDay?: (source: Source, date: string, opts: FetchDayOptions) => Promise<DayFetch>;
  /** Deps for fetchDay, without `fetch` (the cache supplies the counting one). */
  fetchDeps?: Omit<FetchDayDeps, "fetch">;
  /** Default: 1 h for events and weather, 10 min for court slots (wannasport). */
  ttlMs?: Partial<Record<Source, number>>;
  /** Nothing older is ever served. Default 24 h. */
  maxAgeMs?: number;
  /** Entries kept; the least recently used go first. Default 500. */
  maxEntries?: number;
  /** After a failed refresh, wait this long before trying the source and day again. Default 60 s. */
  retryBackoffMs?: number;
  counter?: SourceCounter;
  /** The real upstream fetch the counting one wraps. Default: the global fetch. */
  fetch?: typeof fetch;
  /** Default: logs the issue it would file. */
  filer?: IssueFiler;
  /** Same Drift Fingerprint is handed to the filer at most this often. Default 1 h. */
  reportEveryMs?: number;
  /** Version of a source's skill, for the issue text. Default: read from skills/<source>/cli/package.json. */
  skillVersion?: (source: Source) => string;
  log?: Log;
  now?: () => number;
}

const HOUR = 3600_000;
export const DEFAULT_TTL_MS: Record<Source, number> = {
  kulturkbh: HOUR, billetto: HOUR, kultunaut: HOUR, brugbyen: HOUR, teaterbilletter: HOUR, kglteater: HOUR, absalon: HOUR,
  wannasport: 10 * 60_000,
  dmi: HOUR,
};

interface Entry {
  day: DayFetch;
  fetchedAt: number;
  /** Set by the first failed refresh; cleared by a good one. */
  failedAt?: number;
  kind?: StatusKind;
  retryAfter?: number;
}

type Outcome = { ok: true } | { ok: false; capped: boolean; kind: StatusKind; result?: DayFetch };

const KIND_ORDER: SourceErrorKind[] = ["drift", "bug", "input", "session", "timeout", "network"];

const versionFromDisk = (source: Source): string => {
  try {
    return JSON.parse(readFileSync(new URL(`../../../skills/${source}/cli/package.json`, import.meta.url), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
};

export class DayCache {
  private entries = new Map<string, Entry>(); // insertion order = least recently used first
  private misses = new Map<string, { result: DayFetch; kind: StatusKind; until: number }>();
  private flights = new Map<string, Promise<Outcome>>();
  private background = new Set<Promise<unknown>>();
  private streaks = new Map<Source, number>();
  private reported = new Map<string, number>();
  readonly counter: SourceCounter;
  private o: Required<Pick<DayCacheOptions, "maxAgeMs" | "maxEntries" | "retryBackoffMs" | "reportEveryMs">> & DayCacheOptions;
  private now: () => number;
  private log: Log;
  private filer: IssueFiler;

  constructor(o: DayCacheOptions = {}) {
    this.o = { maxAgeMs: 24 * HOUR, maxEntries: 500, retryBackoffMs: 60_000, reportEveryMs: HOUR, ...o };
    this.now = o.now ?? Date.now;
    this.log = o.log ?? (() => {});
    this.counter = o.counter ?? createSourceCounter({ now: this.now });
    this.filer = o.filer ?? loggingFiler(this.log);
  }

  /** Resolves when every background refresh and issue filing started so far has finished. For tests and shutdown. */
  async idle(): Promise<void> {
    while (this.background.size) await Promise.allSettled([...this.background]);
  }

  /** Consecutive failed fetches per source (network and timeout), reset by a good one. */
  failureStreaks(): Record<string, number> {
    return Object.fromEntries(this.streaks);
  }

  get size(): number {
    return this.entries.size;
  }

  private ttl(source: Source) {
    return this.o.ttlMs?.[source] ?? DEFAULT_TTL_MS[source];
  }

  async getDay(source: Source, date: string, opts: { audience?: Audience } = {}): Promise<DayResult> {
    const key = cacheKey(source, date, opts);
    const t = this.now();
    let e = this.entries.get(key);
    if (e) {
      if (t - e.fetchedAt > this.o.maxAgeMs) {
        this.entries.delete(key);
        e = undefined;
      } else {
        this.entries.delete(key); // re-insert: most recently used
        this.entries.set(key, e);
      }
    }

    if (e) {
      if (!e.failedAt && t - e.fetchedAt <= this.ttl(source)) return this.served(e, source, date, "fresh");
      // Expired or failed: serve what we have at once, refresh in the background.
      if (this.capped(source)) {
        e.failedAt ??= t;
        e.kind = "capped";
        return this.served(e, source, date, "capped");
      }
      if (!e.retryAfter || t >= e.retryAfter) this.refreshInBackground(key, source, date, opts);
      return this.served(e, source, date, "stale");
    }

    const miss = this.misses.get(key);
    if (miss && t < miss.until) return this.missing(source, date, miss.result, miss.kind);
    const out = await this.refresh(key, source, date, opts);
    const after = this.entries.get(key);
    if (out.ok && after) return this.served(after, source, date, "fresh");
    const bad = out.ok ? { capped: false, kind: "bug" as StatusKind, result: undefined } : out;
    return this.missing(source, date, bad.result, bad.kind);
  }

  /** Days for sources and dates, in the shape the planner's `assemble` makes, plus one status per source and day. */
  async getDays(sources: readonly Source[], dates: string[], opts: { audience?: Audience } = {}): Promise<{ days: PlannerDays; fetches: DayFetch[]; statuses: DayStatus[] }> {
    const results = await Promise.all(dates.flatMap((d) => sources.map((s) => this.getDay(s, d, opts))));
    return { days: assemble(dates, results.map((r) => r.fetch)), fetches: results.map((r) => r.fetch), statuses: results.map((r) => r.status) };
  }

  private capped(source: Source) {
    return this.counter.used(source) >= this.counter.cap(source);
  }

  private served(e: Entry, source: Source, date: string, state: DayState): DayResult {
    const status: DayStatus = {
      source, date, status: state, ageSeconds: Math.round((this.now() - e.fetchedAt) / 1000),
      stale: state !== "fresh",
      ...(e.kind && state !== "fresh" ? { kind: e.kind } : {}),
      ...(e.failedAt ? { staleSince: new Date(e.failedAt).toISOString() } : {}),
      ...(state === "capped" ? { note: "capped" } : {}),
    };
    return { fetch: e.day, status };
  }

  private missing(source: Source, date: string, result: DayFetch | undefined, kind: StatusKind): DayResult {
    const fetch = result ?? { source, date, ok: false, items: [], errors: [], rawCount: 0, calls: 0 };
    return { fetch, status: { source, date, status: "missing", ageSeconds: null, kind, stale: false, ...(kind === "capped" ? { note: "capped" } : {}) } };
  }

  private refreshInBackground(key: string, source: Source, date: string, opts: { audience?: Audience }) {
    const p = this.refresh(key, source, date, opts).catch(() => {});
    this.background.add(p);
    void p.finally(() => this.background.delete(p));
  }

  /** Single flight: callers of the same key share one fetch. */
  private refresh(key: string, source: Source, date: string, opts: { audience?: Audience }): Promise<Outcome> {
    let p = this.flights.get(key);
    if (!p) {
      p = this.fetchOnce(key, source, date, opts).finally(() => this.flights.delete(key));
      this.flights.set(key, p);
    }
    return p;
  }

  private async fetchOnce(key: string, source: Source, date: string, opts: { audience?: Audience }): Promise<Outcome> {
    if (this.capped(source)) return this.failed(key, source, { capped: true, kind: "capped" });
    // A billetto day may start Chrome to learn the site's key. That is no deps.fetch request, so count one per day fetch.
    if (source === "billetto") this.counter.record(source);
    const trips = this.counter.trips(source);
    let r: DayFetch;
    try {
      r = await (this.o.fetchDay ?? plannerFetchDay)(source, date, {
        ...(opts.audience ? { audience: opts.audience } : {}),
        deps: { ...this.o.fetchDeps, fetch: this.counter.fetchFor(source, this.o.fetch) },
      });
    } catch (e) {
      r = { source, date, ok: false, items: [], rawCount: 0, calls: 0, errors: [{ kind: "bug", code: 1, command: "fetchDay", message: (e as Error).message }] };
    }
    if (r.ok) {
      this.streaks.set(source, 0);
      this.misses.delete(key);
      this.entries.delete(key);
      this.entries.set(key, { day: r, fetchedAt: this.now() });
      while (this.entries.size > this.o.maxEntries) this.entries.delete(this.entries.keys().next().value!);
      return { ok: true };
    }
    if (this.counter.trips(source) > trips) return this.failed(key, source, { capped: true, kind: "capped", result: r });

    const kinds = new Set(r.errors.map((x) => x.kind));
    const kind = KIND_ORDER.find((k) => kinds.has(k)) ?? "bug";
    if (kind === "network" || kind === "timeout") {
      const n = (this.streaks.get(source) ?? 0) + 1;
      this.streaks.set(source, n);
      this.log("source_failure", { source, date, kind, streak: n });
    } else if (kind === "drift") {
      this.log("source_drift", { source, date });
    } else {
      for (const x of r.errors) this.log("source_alert", { source, date, kind: x.kind, code: x.code, command: x.command, message: x.message.slice(0, 200) });
    }
    for (const fp of new Set(r.errors.flatMap((x) => (x.kind === "drift" && x.fingerprint ? [x.fingerprint] : [])))) this.reportDrift(source, fp);
    return this.failed(key, source, { capped: false, kind, result: r });
  }

  private failed(key: string, source: Source, o: { capped: boolean; kind: StatusKind; result?: DayFetch }): Outcome {
    const t = this.now();
    const e = this.entries.get(key);
    if (e) {
      e.failedAt ??= t;
      e.kind = o.kind;
      if (!o.capped) e.retryAfter = t + this.o.retryBackoffMs;
    } else if (!o.capped && o.result) {
      this.misses.set(key, { result: o.result, kind: o.kind, until: t + this.o.retryBackoffMs });
      if (this.misses.size > this.o.maxEntries) this.misses.delete(this.misses.keys().next().value!);
    }
    return { ok: false, ...o };
  }

  private reportDrift(source: Source, fingerprint: string) {
    const t = this.now();
    const last = this.reported.get(fingerprint);
    if (last !== undefined && t - last < this.o.reportEveryMs) return;
    this.reported.set(fingerprint, t);
    const p = this.filer
      .file({ fingerprint, source, skillVersion: (this.o.skillVersion ?? versionFromDisk)(source), at: new Date(t).toISOString() })
      .catch((e) => this.log("drift_issue_failed", { title: fingerprint, message: (e as Error).message }));
    this.background.add(p);
    void p.finally(() => this.background.delete(p));
  }
}
