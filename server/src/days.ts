// loadDaysFor: the tools' one way to get days. It asks the cache for sources and dates and returns what
// the planner reads (`days`) plus one status per source, so a tool can say which source is missing or stale.
import { SOURCES } from "../../planner/types";
import type { Audience, PlannerDays, Source } from "../../planner/types";
import type { DayStatus, StatusKind } from "./cache";
import type { DayCache } from "./cache";

/** What the tools need of the cache: tests hand in a fake. */
export type DayLoader = Pick<DayCache, "getDays">;

export type SourceState = "fresh" | "stale" | "capped" | "missing";
export interface SourceStatus {
  source: string;
  status: SourceState;
  /** Why the data is not fresh (drift, network, timeout, input, bug, session, capped). */
  kind?: StatusKind;
  /** Age of the oldest data served, in minutes. */
  ageMinutes?: number;
}

const RANK: Record<SourceState, number> = { fresh: 0, stale: 1, capped: 2, missing: 3 };

/** One status per source: the worst of its days. */
export function summarise(statuses: DayStatus[]): SourceStatus[] {
  const by = new Map<string, DayStatus>();
  for (const s of statuses) {
    const prev = by.get(s.source);
    if (!prev || RANK[s.status] > RANK[prev.status] || (RANK[s.status] === RANK[prev.status] && (s.ageSeconds ?? 0) > (prev.ageSeconds ?? 0))) by.set(s.source, s);
  }
  return [...by.values()].map((s) => ({
    source: s.source,
    status: s.status,
    ...(s.kind ? { kind: s.kind } : {}),
    ...(s.ageSeconds != null && s.status !== "fresh" ? { ageMinutes: Math.round(s.ageSeconds / 60) } : {}),
  }));
}

/** A sentence per source the model should tell the user about; fresh sources need none. */
export function statusNotes(sources: SourceStatus[]): string[] {
  const out: string[] = [];
  for (const s of sources) {
    const why = s.kind ? ` (${s.kind})` : "";
    if (s.status === "missing") out.push(`${s.source} is missing${why}: nothing from it is in this answer.`);
    else if (s.status === "capped") out.push(`${s.source} is capped${why}: its upstream limit is used up, so the data is ${s.ageMinutes ?? "?"} min old.`);
    else if (s.status === "stale" && s.kind) out.push(`${s.source} is stale${why}: the last refresh failed, the data is ${s.ageMinutes ?? "?"} min old.`);
  }
  return out;
}

export interface LoadedDays {
  days: PlannerDays;
  sources: SourceStatus[];
  notes: string[];
}

/** Days for `dates` (default sources: all of them), through the cache. `audience` only changes brugbyen. */
export async function loadDaysFor(cache: DayLoader, dates: string[], sources: readonly Source[] = SOURCES, audience?: Audience): Promise<LoadedDays> {
  const { days, statuses } = await cache.getDays(sources, dates, audience ? { audience } : {});
  const summary = summarise(statuses);
  return { days, sources: summary, notes: statusNotes(summary) };
}
