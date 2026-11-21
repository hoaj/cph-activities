import type { DayFetch, SourceError } from "../../../planner/fetch-day";
import type { DayCacheOptions } from "../../src/cache";
import type { DriftReport, IssueFiler } from "../../src/cache";

export const H = 3600_000;
export const clock = (start = 1_800_000_000_000) => {
  const c = { t: start, now: () => c.t, advance: (ms: number) => (c.t += ms) };
  return c;
};

export const day = (source: string, date: string, titles: string[] = ["a"]): DayFetch =>
  ({ source, date, ok: true, items: titles.map((t) => ({ id: `${source}-${t}`, source, title: t, date }) as any), errors: [], rawCount: titles.length, calls: 1 }) as DayFetch;

export const failure = (source: string, date: string, ...errors: Partial<SourceError>[]): DayFetch =>
  ({ source, date, ok: false, items: [], rawCount: 0, calls: 1, errors: errors.map((e) => ({ kind: "bug", code: 1, command: "event list", message: "x", ...e })) }) as DayFetch;

/** A fetchDay whose answers a test scripts: a queue of results (or a function), and a call log. */
export function fakeFetchDay(answer: (n: number, source: string, date: string) => DayFetch | Promise<DayFetch>) {
  const calls: { source: string; date: string; deps: any }[] = [];
  const fn: NonNullable<DayCacheOptions["fetchDay"]> = async (source, date, opts) => {
    calls.push({ source, date, deps: opts.deps });
    return answer(calls.length, source, date);
  };
  return { fn, calls };
}

export function fakeFiler() {
  const filed: DriftReport[] = [];
  const filer: IssueFiler = { async file(r) { filed.push(r); return "created"; } };
  return { filer, filed };
}
