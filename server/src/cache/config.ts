// Cache settings from the environment. See server/README.md.
import { SOURCES } from "../../../planner/types";
import type { Source } from "../../../planner/types";
import type { DayCacheOptions } from "./day-cache";
import { createSourceCounter } from "./counting-fetch";

/** Hourly upstream caps per source; a source not listed gets SOURCE_CAP_PER_HOUR (default 30). */
export const DEFAULT_CAPS: Partial<Record<Source, number>> = { kultunaut: 150, wannasport: 60 };

const num = (env: Record<string, string | undefined>, name: string): number | undefined => {
  const v = env[name]?.trim();
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${v}"`);
  return n;
};

export function cacheOptionsFromEnv(env: Record<string, string | undefined>, now?: () => number): Pick<DayCacheOptions, "ttlMs" | "maxAgeMs" | "maxEntries" | "counter"> {
  const events = num(env, "CACHE_TTL_EVENTS_S");
  const slots = num(env, "CACHE_TTL_SLOTS_S");
  const weather = num(env, "CACHE_TTL_WEATHER_S");
  const ttlMs: Partial<Record<Source, number>> = {};
  for (const s of SOURCES) {
    const sec = s === "dmi" ? weather : s === "wannasport" ? slots : events;
    if (sec) ttlMs[s] = sec * 1000;
  }
  const caps: Partial<Record<Source, number>> = { ...DEFAULT_CAPS };
  for (const s of SOURCES) {
    const c = num(env, `SOURCE_CAP_PER_HOUR_${s.toUpperCase()}`);
    if (c) caps[s] = c;
  }
  const maxAge = num(env, "CACHE_MAX_AGE_S");
  const maxEntries = num(env, "CACHE_MAX_ENTRIES");
  return {
    ttlMs,
    ...(maxAge && { maxAgeMs: maxAge * 1000 }),
    ...(maxEntries && { maxEntries }),
    counter: createSourceCounter({ defaultCap: num(env, "SOURCE_CAP_PER_HOUR") ?? 30, caps, ...(now && { now }) }),
  };
}
