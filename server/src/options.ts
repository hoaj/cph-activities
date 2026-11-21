// list_options' data: the filter lists of two skills (brugbyen `filter list`, kultunaut `genre list`), run
// in this process through the cache's counting fetch and kept for six hours. The sports are the six the
// planner fetches. A failed list is left out and retried after a minute.
import { runSkill } from "../../planner/fetch-day";
import { AUDIENCES, MOODS, SPORTS } from "../../planner/types";
import type { SourceStatus } from "./days";
import type { SourceCounter } from "./cache";

export interface OptionsData {
  sports: string[];
  audiences: string[];
  moods: string[];
  brugbyen: { categories: string[]; districts: string[]; groups: string[] };
  kultunaut: { genres: string[] };
  /** Categories and genres of the sources that list them, once each, with the sources that use the name. */
  categories: { name: string; sources: string[] }[];
}
export interface OptionsResult {
  data: OptionsData;
  sources: SourceStatus[];
}
export type OptionsLoader = () => Promise<OptionsResult>;

const HOUR = 3600_000;

export function createOptionsLoader(o: { counter?: SourceCounter; stateRoot?: string; ttlMs?: number; retryMs?: number; now?: () => number; run?: typeof runSkill } = {}): OptionsLoader {
  const now = o.now ?? Date.now;
  const run = o.run ?? runSkill;
  let kept: { at: number; result: OptionsResult } | null = null;
  let inflight: Promise<OptionsResult> | null = null;

  const load = async (): Promise<OptionsResult> => {
    const deps = (source: "brugbyen" | "kultunaut") => ({ ...(o.counter ? { fetch: o.counter.fetchFor(source) } : {}), ...(o.stateRoot ? { stateRoot: o.stateRoot } : {}) });
    const [bb, kn] = await Promise.all([run("brugbyen", ["filter", "list"], deps("brugbyen")), run("kultunaut", ["genre", "list"], deps("kultunaut")).catch((e) => ({ ok: false as const, error: { kind: "bug" as const, message: String(e) } }))]);
    const names = (xs: any): string[] => (Array.isArray(xs) ? xs.map((x) => String(x?.name ?? x)).filter(Boolean) : []);
    const brugbyen = bb.ok ? { categories: names(bb.output.categories), districts: names(bb.output.districts), groups: names(bb.output.groups) } : { categories: [], districts: [], groups: [] };
    const genres = kn.ok ? names(kn.output.genres) : [];
    const merged = new Map<string, { name: string; sources: Set<string> }>();
    const add = (name: string, source: string) => {
      const e = merged.get(name.toLowerCase()) ?? { name, sources: new Set<string>() };
      e.sources.add(source);
      merged.set(name.toLowerCase(), e);
    };
    brugbyen.categories.forEach((c) => add(c, "brugbyen"));
    genres.forEach((g) => add(g, "kultunaut"));
    const status = (source: string, r: { ok: boolean; error?: { kind: string } }): SourceStatus => (r.ok ? { source, status: "fresh" } : { source, status: "missing", kind: r.error!.kind as SourceStatus["kind"] });
    return {
      data: {
        sports: [...SPORTS], audiences: [...AUDIENCES], moods: [...MOODS], brugbyen, kultunaut: { genres },
        categories: [...merged.values()].map((e) => ({ name: e.name, sources: [...e.sources] })).sort((a, b) => a.name.localeCompare(b.name, "da")),
      },
      sources: [status("brugbyen", bb), status("kultunaut", kn)],
    };
  };

  return async () => {
    const t = now();
    if (kept && t - kept.at < (o.ttlMs ?? 6 * HOUR)) return kept.result;
    inflight ??= load().finally(() => (inflight = null));
    const result = await inflight;
    // a list with a failed source is kept only briefly, so it is tried again soon
    const complete = result.sources.every((s) => s.status === "fresh");
    kept = { at: complete ? t : t - (o.ttlMs ?? 6 * HOUR) + (o.retryMs ?? 60_000), result };
    return result;
  };
}
