// Per-link limits: 60 tool calls an hour and 300 a day, in memory, as sliding windows. Behind the
// Limiter interface so the cache can add per-source caps later without touching the callers.

export type LimitResult = { ok: true } | { ok: false; window: "hour" | "day"; limit: number; resetsAt: number };

export interface Limiter {
  /** Counts one tool call for a link, or says it is over the limit (and then counts nothing). */
  take(link: string): LimitResult;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function slidingLimiter(o: { perHour?: number; perDay?: number; now?: () => number } = {}): Limiter {
  const perHour = o.perHour ?? 60;
  const perDay = o.perDay ?? 300;
  const now = o.now ?? Date.now;
  const calls = new Map<string, number[]>(); // ascending timestamps within the last day
  return {
    take(link) {
      const t = now();
      // Public keys and browser ids make the names unbounded: drop those with no call in the last day.
      if (calls.size > 10_000) for (const [k, v] of calls) if (!v.length || v[v.length - 1]! <= t - DAY) calls.delete(k);
      const all = (calls.get(link) ?? []).filter((c) => c > t - DAY);
      const hour = all.filter((c) => c > t - HOUR);
      // With n calls in a window of limit L, call n-L+1 (from the oldest) must leave before the next fits.
      const reset = (list: number[], limit: number, span: number) => list[list.length - limit]! + span;
      const blocked: LimitResult[] = [];
      if (hour.length >= perHour) blocked.push({ ok: false, window: "hour", limit: perHour, resetsAt: reset(hour, perHour, HOUR) });
      if (all.length >= perDay) blocked.push({ ok: false, window: "day", limit: perDay, resetsAt: reset(all, perDay, DAY) });
      calls.set(link, all);
      if (blocked.length) return blocked.reduce((a, b) => (a.ok || b.ok ? a : b.resetsAt > a.resetsAt ? b : a));
      all.push(t);
      return { ok: true };
    },
  };
}
