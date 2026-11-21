# planner

The shared planner behind `plan_outing`: one typed Bun/TypeScript package that fetches each source's day and decides what to suggest. The server's `plan_outing` tool and a later plugin command call the same code, so the rules live in one place. Decisions: [#23](https://github.com/hoaj/cph-activities/issues/23) (in-process fetch) and [#24](https://github.com/hoaj/cph-activities/issues/24) (the contract), validated on `prototype/plan-outing`.

Two halves, joined only by data:

| Half | Does I/O | Entry |
|---|---|---|
| `fetchDay(source, date, opts)` | yes: calls a skill's own `run()` in this process | `fetch-day.ts`, rows normalised in `normalise.ts` |
| `planOuting(brief, days)` | no: pure, same input gives the same answer | `plan.ts` |

## fetchDay

```ts
import { fetchDay, cacheKey } from "./planner";

const r = await fetchDay("kultunaut", "2026-11-28", { deps: { fetch: countingFetch, stateRoot: "/data" } });
// r = { source, date, ok, items: Item[], weather?, errors: SourceError[], rawCount, calls }
```

- Sources: kulturkbh, billetto, kultunaut, brugbyen, teaterbilletter, absalon, wannasport (padel, tabletennis, badminton, squash, tennis, basketball) and dmi (`weather` instead of items: the day and the 17:00-23:00 window).
- Each skill is imported from `skills/<skill>/cli/src/{main,site,registry}.ts` and called as `run(argv, { site, operations, commands, deps })` with fixed broad arguments. Nothing in a skill changes. The skills keep their own `node_modules`; run `bun install` in each `skills/*/cli` and at the repo root.
- `deps.env` is per call, with `SITE_CLI_HOME=<stateRoot>/<source>` (default `<tmp>/cph-planner/<source>`). `deps.fetch` replaces the skill's network fetch: hand in a counting one for the per-source upstream cap. Billetto reads `SITE_CLI_CHROME` from `process.env`, not `deps.env`: set it in the container.
- It never throws for a source. A failing call becomes an entry in `errors` with the envelope's `kind` (never `instanceof`: each skill has its own runtime copy): `drift` (exit 3, with `fingerprint`: serve the last good data as stale and file one issue titled with it), `network` (5: serve stale, no issue), `input` (2: a missing Chrome, an alert, not Drift), `session` (4), `bug` (1) and `timeout` (the call took longer than `opts.timeoutMs`, default 120 s). Calls that did succeed still return their items.
- brugbyen filters on the site by audience: `opts.audience` makes one call for one group (børn, unge, voksne); without it all three are asked and merged. kultunaut makes two calls (the day, and from 17:00) because a day can hold more than the 200-row ceiling. wannasport makes one call per sport.
- `cacheKey(source, date, opts)` is the key to cache a `DayFetch` under: `source|date`, and for brugbyen `|<audience>` or `|all`.
- Every row becomes the prototype's `Item` (`types.ts`): id, source, kind (`event`, `show`, `slots`), title, date, time, venue, price fields, age, audience, categories, indoor, url, `times` for court slots.

## planOuting

```ts
import { planOuting, applyPatch } from "./planner";

const r = planOuting(brief, days); // days = { days: string[], weather: Record<date, WeatherDay>, items: Item[] }
if (r.status === "needs_input") { /* turn r.ask into a question, offer r.options */ }
else { /* r.weather, r.best, r.alternatives, r.plan, r.assumptions, r.more, r.next */ }
const refined = planOuting(applyPatch(brief, r.next[0].patch), days);
```

The contract is #24's: `needs_input` when a person lacks an age or the brief has no "what" (a mood or wishes; budget, times and indoor-only do not count), with one Danish message of at most two questions and options; otherwise a shortlist with a weather line (only when the weather matters: wet, showers, cold, windy or snow; otherwise null), a best bet, two to four alternatives of different kinds, an optional plan, assumptions, facet counts (`more`) and `next` as `{ label, patch }` where the patch is applied to the brief by `applyPatch` (a value sets a key, `null` deletes it).

Rules, in the order they act (the guide skill `skills/cph-activities/SKILL.md` has the longer reasoning):

1. Merge duplicates across sources (same date, start times within 30 minutes, same or contained title; or the same exact time and same place with an agreeing price). Billetto leads, every id and link is kept.
2. Drop what does not fit: outside the window, courses and season passes, not on sale, the wrong age (18+ for a minor; children's events for a teenager; only child-made events, none after 19:00, for under 10), another district, outdoors in rain, cold, wind or snow (or when indoors only), over budget (a court's price is split by max(people, 2); budget 0 keeps free rows and unpriced brugbyen rows as "gratis?"), another mood.
3. Events with no start time are demoted: never the best bet alone, never in the plan ("tid: se siden"); they are left out for small children and for evening briefs.
4. Under 18 asking for nightlife: clubs and bars are left out and late (from 19:00) concerts, shows and events are shown; the assumptions say why.
5. Threads: two items in two sources for a two-word key, three for a single long word, shown as one suggestion of two to four items.
6. Rank by fit, then appeal (thread, premiere, value, sources agreeing); alternatives are diversified by kind.

## How the server will use it

```
tool call -> brief -> needsInput? -> answer without fetching
          -> for each source: cache.get(cacheKey(...)) or fetchDay(...) (counting fetch, stateRoot on the volume-less /data)
          -> assemble(dates, dayFetches) -> planOuting(brief, days) -> structuredContent
```

The server owns the cache (TTL, stale-while-revalidate, one in-flight fetch per key), the per-source cap and the Drift issue; this package only fetches and plans. `loadDays` (`days.ts`) is the uncached version used by the CLI and the smoke script; `assemble` builds `PlannerDays` from cached `DayFetch`es.

## Run, test

```sh
bun install                      # repo root, and in every skills/*/cli
bun test planner                 # offline: the five prototype walkthroughs on fixtures/snapshot.json, rules, normalisers, fetchDay with a fake fetch
bun run typecheck:planner
bun planner/smoke.ts [date]      # live: every source for a day (default: next Saturday); needs Chrome for billetto; not run in CI
echo '{"people":[{"age":31}],"mood":["active"]}' | bun planner/cli.ts   # live
echo '{...}' | bun planner/cli.ts --snapshot planner/fixtures/snapshot.json   # offline
```

`fixtures/snapshot.json` is the prototype's recording of public listings for 18, 21 and 22 Nov 2026 (rows in `Item` shape plus a weather forecast per day). Re-record it with the prototype's `snapshot.prototype.ts` on branch `prototype/plan-outing`, or build the same shape from `loadDays`.
