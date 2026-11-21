import { fetchDay } from "./fetch-day";
import type { DayFetch, FetchDayOptions } from "./fetch-day";
import { SOURCES } from "./types";
import type { PlannerDays, Source } from "./types";

/**
 * Fetches every source (or `sources`) for each date and assembles what planOuting reads. Uncached: the
 * server wraps `fetchDay` with its own cache instead and builds the same shape from cached DayFetches.
 */
export async function loadDays(dates: string[], opts: FetchDayOptions & { sources?: readonly Source[] } = {}): Promise<{ days: PlannerDays; fetches: DayFetch[] }> {
  const fetches = await Promise.all(dates.flatMap((d) => (opts.sources ?? SOURCES).map((s) => fetchDay(s, d, opts))));
  return { days: assemble(dates, fetches), fetches };
}

/** DayFetch results of any sources and dates -> PlannerDays. */
export function assemble(dates: string[], fetches: DayFetch[]): PlannerDays {
  const weather: PlannerDays["weather"] = {};
  for (const f of fetches) if (f.weather) weather[f.date] = f.weather;
  return { days: dates, weather, items: fetches.flatMap((f) => f.items) };
}
