/**
 * fetchDay(source, date, opts): one source, one day, normalised. Each call runs the skill's own `run()`
 * in-process (decision on hoaj/cph-activities#23) with fixed broad arguments, then maps the rows to Item.
 * A failing source never throws: the result says what failed, so a caller can serve stale data.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as N from "./normalise";
import { AUDIENCES, SPORTS } from "./types";
import type { Audience, Item, Source, WeatherDay } from "./types";

/** What a skill's runtime needs to run a command. Loosely typed on purpose: eight runtime copies. */
interface SkillApp {
  run: (argv: string[], app: unknown) => Promise<{ output: any; code: number }>;
  site: unknown;
  operations: unknown;
  commands: unknown;
}
/** The skills sit in this repo's `skills/`; each is imported by path and keeps its own node_modules. */
const load = async (m: Promise<any>, s: Promise<any>, r: Promise<any>): Promise<SkillApp> => {
  const [main, site, registry] = await Promise.all([m, s, r]);
  return { run: main.run, site: site.default, operations: registry.operations, commands: registry.commands };
};
const LOADERS: Record<Source, () => Promise<SkillApp>> = {
  kulturkbh: () => load(import("../skills/kulturkbh/cli/src/main"), import("../skills/kulturkbh/cli/src/site"), import("../skills/kulturkbh/cli/src/registry")),
  billetto: () => load(import("../skills/billetto/cli/src/main"), import("../skills/billetto/cli/src/site"), import("../skills/billetto/cli/src/registry")),
  kultunaut: () => load(import("../skills/kultunaut/cli/src/main"), import("../skills/kultunaut/cli/src/site"), import("../skills/kultunaut/cli/src/registry")),
  brugbyen: () => load(import("../skills/brugbyen/cli/src/main"), import("../skills/brugbyen/cli/src/site"), import("../skills/brugbyen/cli/src/registry")),
  teaterbilletter: () => load(import("../skills/teaterbilletter/cli/src/main"), import("../skills/teaterbilletter/cli/src/site"), import("../skills/teaterbilletter/cli/src/registry")),
  kglteater: () => load(import("../skills/kglteater/cli/src/main"), import("../skills/kglteater/cli/src/site"), import("../skills/kglteater/cli/src/registry")),
  absalon: () => load(import("../skills/absalon/cli/src/main"), import("../skills/absalon/cli/src/site"), import("../skills/absalon/cli/src/registry")),
  wannasport: () => load(import("../skills/wannasport/cli/src/main"), import("../skills/wannasport/cli/src/site"), import("../skills/wannasport/cli/src/registry")),
  dmi: () => load(import("../skills/dmi/cli/src/main"), import("../skills/dmi/cli/src/site"), import("../skills/dmi/cli/src/registry")),
};
const apps = new Map<Source, Promise<SkillApp>>();
const appOf = (source: Source) => {
  if (!apps.has(source)) apps.set(source, LOADERS[source]());
  return apps.get(source)!;
};

/** Per-call injection: the server hands in a counting fetch and its own state directory. */
export interface FetchDayDeps {
  /** Replaces the skill's network fetch (to count or fake upstream requests). */
  fetch?: typeof fetch;
  /** Added to the skill's environment. Billetto reads SITE_CLI_CHROME from process.env instead. */
  env?: Record<string, string | undefined>;
  /** Parent of each skill's SITE_CLI_HOME (`<stateRoot>/<source>`). Default: a folder in the OS temp dir. */
  stateRoot?: string;
  /** Receives the skills' progress notes (default: dropped). */
  note?: (msg: string) => void;
  /** Pauses between a skill's retries of a 5xx or 429 (its default: 500 and 1500 ms). */
  retryDelays?: number[];
}

export interface FetchDayOptions {
  /** brugbyen only: one call for this audience group. Default: all three, merged. */
  audience?: Audience;
  /** wannasport only: the sports to ask for. Default: all six. */
  sports?: readonly string[];
  /** Give up on a call after this long (default 120 s). */
  timeoutMs?: number;
  deps?: FetchDayDeps;
}

export type SourceErrorKind = "drift" | "network" | "input" | "session" | "bug" | "timeout";
export interface SourceError {
  kind: SourceErrorKind;
  /** The skill's exit code (3 drift, 5 network, 2 input, 4 session, 1 bug); 0 for a timeout. */
  code: number;
  message: string;
  /** Drift only: `plugin:skill:operation:class:path:code`. File one issue titled with it. */
  fingerprint?: string;
  /** The command that failed, e.g. "event list --group børn". */
  command: string;
}

export interface DayFetch {
  source: Source;
  date: string;
  /** true when every call of this fetch succeeded. */
  ok: boolean;
  items: Item[];
  /** dmi only. */
  weather?: WeatherDay;
  errors: SourceError[];
  /** Rows before dedupe, summed over the calls. */
  rawCount: number;
  /** How many `run()` calls this fetch made. */
  calls: number;
}

/**
 * The key a cache should use for fetchDay(source, date, opts): `source|date`, plus brugbyen's audience
 * (the site filters on it). A fetch without an audience asks all three, and is keyed `brugbyen|date|all`.
 */
export function cacheKey(source: Source, date: string, opts: Pick<FetchDayOptions, "audience"> = {}): string {
  return source === "brugbyen" ? `${source}|${date}|${opts.audience ?? "all"}` : `${source}|${date}`;
}

const ERROR_KINDS: Record<number, SourceErrorKind> = { 1: "bug", 2: "input", 3: "drift", 4: "session", 5: "network" };

interface Call {
  /** argv for the skill's run(). */
  argv: string[];
  /** Turns the skill's output into items (or weather) for this call. */
  into: (output: any) => void;
}

export async function fetchDay(source: Source, date: string, opts: FetchDayOptions = {}): Promise<DayFetch> {
  const deps = opts.deps ?? {};
  const result: DayFetch = { source, date, ok: true, items: [], errors: [], rawCount: 0, calls: 0 };
  const collected: Item[] = [];
  const raw = (output: any, ...lists: string[]) => {
    result.rawCount += lists.reduce((n, k) => n + (Array.isArray(output?.[k]) ? output[k].length : 0), 0);
  };
  let dmiDay: any = null;
  let dmiEvening: any = null;

  const calls: Call[] = [];
  const D = date;
  switch (source) {
    case "kulturkbh":
      calls.push({ argv: ["event", "list", "--from", D, "--to", D, "--limit", "300", "--include-outside"], into: (o) => { raw(o, "events"); collected.push(...N.kulturkbh(o, D)); } });
      break;
    case "billetto":
      calls.push({ argv: ["event", "search", "--from", D, "--to", D, "--limit", "300"], into: (o) => { raw(o, "events"); collected.push(...N.billetto(o, D)); } });
      break;
    case "kultunaut":
      // 200 rows is the command's ceiling and a day can hold more: a second call from 17:00 keeps the evening whole
      calls.push({ argv: ["event", "list", "--from", D, "--limit", "200"], into: (o) => { raw(o, "events"); collected.push(...N.kultunaut(o, D, "all")); } });
      calls.push({ argv: ["event", "list", "--from", D, "--limit", "200", "--from-time", "17:00"], into: (o) => { raw(o, "events"); collected.push(...N.kultunaut(o, D, "evening")); } });
      break;
    case "brugbyen":
      for (const g of opts.audience ? [opts.audience] : AUDIENCES) {
        calls.push({ argv: ["event", "list", "--from", D, "--limit", "200", "--group", g], into: (o) => { raw(o, "events"); collected.push(...N.brugbyen(o, D, g)); } });
      }
      break;
    case "teaterbilletter":
      calls.push({ argv: ["show", "list", "--from", D, "--limit", "300"], into: (o) => { raw(o, "shows"); collected.push(...N.teaterbilletter(o, D)); } });
      break;
    case "absalon":
      calls.push({ argv: ["event", "list", "--from", D, "--limit", "300"], into: (o) => { raw(o, "events"); collected.push(...N.absalon(o, D)); } });
      break;
    case "kglteater":
      calls.push({ argv: ["show", "list", "--from", D, "--limit", "300"], into: (o) => { raw(o, "shows"); collected.push(...N.kglteater(o, D)); } });
      break;
    case "wannasport":
      for (const s of opts.sports ?? SPORTS) {
        calls.push({ argv: ["slot", "search", "--sport", s, "--date", D, "--limit", "10"], into: (o) => { raw(o, "venues"); collected.push(...N.wannasport(o, D, s)); } });
      }
      break;
    case "dmi":
      calls.push({ argv: ["forecast", "--date", D], into: (o) => { dmiDay = o; } });
      calls.push({ argv: ["forecast", "--date", D, "--from-time", "17:00", "--to-time", "23:00"], into: (o) => { dmiEvening = o; } });
      break;
  }

  let app: SkillApp;
  try {
    app = await appOf(source);
  } catch (e) {
    apps.delete(source);
    return { ...result, ok: false, errors: [{ kind: "bug", code: 1, command: "import", message: `could not load the ${source} skill: ${(e as Error).message}` }] };
  }

  const env = {
    ...process.env,
    ...deps.env,
    SITE_CLI_HOME: join(deps.stateRoot ?? join(tmpdir(), "cph-planner"), source),
    SITE_CLI_NONINTERACTIVE: "1",
  };
  const skillDeps = { env, note: deps.note ?? (() => {}), ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.retryDelays ? { retryDelays: deps.retryDelays } : {}) };
  const timeoutMs = opts.timeoutMs ?? 120_000;

  await Promise.all(
    calls.map(async (c) => {
      result.calls++;
      const command = c.argv.slice(0, 2).join(" ") + (c.argv.includes("--group") ? ` --group ${c.argv[c.argv.indexOf("--group") + 1]}` : c.argv.includes("--sport") ? ` --sport ${c.argv[c.argv.indexOf("--sport") + 1]}` : "");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const run = app.run(c.argv, { site: app.site, operations: app.operations, commands: app.commands, deps: skillDeps });
        const timeout = new Promise<"timeout">((res) => { timer = setTimeout(() => res("timeout"), timeoutMs); });
        const r = await Promise.race([run, timeout]);
        if (r === "timeout") {
          result.errors.push({ kind: "timeout", code: 0, command, message: `${source} ${command} took longer than ${timeoutMs} ms` });
        } else if (r.code !== 0) {
          // the envelope's kind, never `instanceof`: each skill carries its own copy of the runtime
          const e = r.output?.error ?? {};
          result.errors.push({ kind: ERROR_KINDS[r.code] ?? "bug", code: r.code, command, message: String(e.message ?? "no message"), ...(e.fingerprint ? { fingerprint: String(e.fingerprint) } : {}) });
        } else {
          c.into(r.output);
        }
      } catch (e) {
        result.errors.push({ kind: "bug", code: 1, command, message: (e as Error).message });
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  result.items = N.dedupe(collected);
  if (source === "dmi" && (dmiDay || dmiEvening)) result.weather = N.weatherDay(dmiDay, dmiEvening);
  result.ok = result.errors.length === 0;
  return result;
}

/**
 * One command of a skill, run in this process with the same env and counting `fetch` as `fetchDay`: for
 * the lists a skill offers (`filter list`, `genre list`) that are no day's rows. Never throws.
 */
export async function runSkill(source: Source, argv: string[], deps: FetchDayDeps = {}, timeoutMs = 60_000): Promise<{ ok: true; output: any } | { ok: false; error: SourceError }> {
  const command = argv.slice(0, 2).join(" ");
  const fail = (kind: SourceErrorKind, code: number, message: string, fingerprint?: string): { ok: false; error: SourceError } => ({ ok: false, error: { kind, code, command, message, ...(fingerprint ? { fingerprint } : {}) } });
  let app: SkillApp;
  try {
    app = await appOf(source);
  } catch (e) {
    apps.delete(source);
    return fail("bug", 1, `could not load the ${source} skill: ${(e as Error).message}`);
  }
  const env = { ...process.env, ...deps.env, SITE_CLI_HOME: join(deps.stateRoot ?? join(tmpdir(), "cph-planner"), source), SITE_CLI_NONINTERACTIVE: "1" };
  const skillDeps = { env, note: deps.note ?? (() => {}), ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.retryDelays ? { retryDelays: deps.retryDelays } : {}) };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = app.run(argv, { site: app.site, operations: app.operations, commands: app.commands, deps: skillDeps });
    const r = await Promise.race([run, new Promise<"timeout">((res) => { timer = setTimeout(() => res("timeout"), timeoutMs); })]);
    if (r === "timeout") return fail("timeout", 0, `${source} ${command} took longer than ${timeoutMs} ms`);
    if (r.code !== 0) {
      const e = r.output?.error ?? {};
      return fail(ERROR_KINDS[r.code] ?? "bug", r.code, String(e.message ?? "no message"), e.fingerprint ? String(e.fingerprint) : undefined);
    }
    return { ok: true, output: r.output };
  } catch (e) {
    return fail("bug", 1, (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
