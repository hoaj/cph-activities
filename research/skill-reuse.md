# Can the server call each CLI skill's Operations in-process, and where does the cache wrap them?

Date: 2026-11-17. Ticket: https://github.com/hoaj/cph-activities/issues/23 (child of map #19).
Code read: `origin/main` at ab6bf12 (plugin version 0.14.0, generated with site-cli-creator 0.16.0). Bun 1.4.3.

## Recommendation

**Import the skills in-process (option a), call each command through the skill's own `run(argv, app)`, and put the cache around that call, one level above it.** All eight skills load into one Bun process and ran concurrently, live, with no changes to any skill (proof below). Do not spawn the CLIs, and do not write new per-source "fetch the day" functions yet.

Concretely:

1. `server/` imports, per skill, `skills/<skill>/cli/src/{main,site,registry}.ts` and calls `run(argv, { site, commands, operations, deps })`. `run()` already returns `{ output, code }` and never exits the process (only `main()` and `emit()` do), so no `process.exit` risk. Each skill gets its own `deps.env` with `SITE_CLI_HOME=/data/<skill>`, so state dirs never collide.
2. The cache seam is a `getDay(source, command, args)` function in `server/` that wraps `run()`. Key: `source|command|canonical-args`, TTL per source. The per-source upstream cap is a counting `deps.fetch` handed to `run()` (in-process gives this for free; a spawned CLI cannot).
3. Drift: `run()` returns `code === 3` and `output.error.kind === "drift"` with `output.error.fingerprint` (and `drifts[]` with one fingerprint per Operation). The wrapper serves the last good entry marked stale and files one issue titled with the Fingerprint, exactly as `cph-activities-feedback` does (title is the Fingerprint, label `drift`, dedupe by exact title).
4. Make the cache key honest about command args. Commands filter and cut to `--limit` inside `run`, so a cached "kultunaut, limit 200" is not a superset of "kultunaut, genre jazz". Key on the full args and let `plan_outing` use a small fixed set of calls per source per day. If that proves too coarse (kultunaut and billetto return 150-200+ rows a day, past `--limit` max), then promote that source's loop to a `fetchDay` in a later step (option c below), one source at a time.

Things to carry into the build tickets:

- **Billetto needs Chrome at bootstrap, and reads the Chrome path from `process.env`, not `deps.env`.** Set `SITE_CLI_CHROME` (or install Chrome at `/opt/google/chrome/chrome`) in the container's own environment.
- **A missing Chrome is `kind: "input"` (exit 2), not drift.** The server must treat input errors from a source as an infrastructure alert, never as a Drift issue.
- **Dependencies:** with one root `node_modules`, all eight skills share one copy of `zod` and the rest (1 distinct `ZodObject` constructor, verified). With each skill's own `node_modules` there are 8 copies (76 MB each) and 8 distinct `Failure` classes. Prefer one root install of the pinned dependencies.
- **The existing per-skill `Dockerfile`s do not carry over:** they build a compiled binary for one skill from the `skills/<skill>/` context, on distroless with no Chrome. The server needs a repo-root build context and an image with Chrome.
- **Do not use `instanceof Failure` across skills.** Each skill has its own copy of the runtime, so its `Failure` class is a different class (verified `false`). Read `.kind` or, better, read the envelope `run()` returns.

## What the code is

Every `skills/<skill>/cli` is a Bun package (`package.json`, `build.ts`, `src/`, `tests/`). Eight skills: absalon, billetto, brugbyen, dmi, kultunaut, kulturkbh, teaterbilletter, wannasport. All have `auth: "none"`, so there is no login, no Session to upload and no account. Their `package.json` dependencies are identical (`@modelcontextprotocol/sdk`, `playwright-core` 1.63.0, `zod` ^4.6.5, `express`, `parse5` and friends).

`src/runtime/` is the Starter code, copied into each skill. Comparing the eight copies: they are byte-identical except `call.ts` in absalon, dmi and teaterbilletter (no `charset.ts`, and `r.text()` instead of `decodeBody`; those three sites are UTF-8), and those three lack `charset.ts`. The runtime is therefore the same code eight times, not shared code. That decides how modules behave in one process (below).

### How a command gets its `call`

- `src/site.ts` default-exports the `Site` from `defineSite(...)`: origin, `auth`, `bootstrap`, `never` list.
- `src/registry.ts` (generated) exports `operations` and `commands`.
- `src/commands/<noun>-<verb>.ts` default-exports `defineCommand({ name, args (Zod), uses, run(args, ctx) })`. `ctx` is `{ call, session, account, note }`.
- `src/runtime/call.ts` has `Client` (`new Client(site, deps, options)`), whose `client.call(op, vars)` validates variables with Zod, sends, retries, classifies the outcome and validates the response against the Operation's Contract. `Deps` is `{ fetch, env, plainFetch?, login, release?, sleep, retryDelays, note }`.
- `src/main.ts` exports `run(argv, app)` (parse argv, build Deps and Client, run the command, return `{ output, code }`), `mcpTools(app)` (the same Tasks as MCP tools) and `main()`. It runs `main()` only under `if (import.meta.main || isEntry(import.meta.path))`, so importing it runs nothing.
- `App` is `{ site, operations, commands, deps?: Partial<Deps>, ... }`. `deps` overrides the defaults (`fetch`, `env`, `note`, `sleep`, `retryDelays`). This is the injection point the server uses.

State: `stateDir(site, env)` is `env.SITE_CLI_HOME` when set, else `~/.<plugin>[-<skill>]`. `session.json` there caches what `bootstrap` returned. Env knobs read by the runtime: `SITE_CLI_HOME`, `SITE_CLI_NONINTERACTIVE`, `SITE_CLI_CHROME`, `SITE_CLI_TEST`. Everything except `SITE_CLI_CHROME` in billetto's bootstrap comes from `deps.env`, which is per call.

### How Drift surfaces

`call.ts` header table: 404/405, other non-2xx, a GraphQL validation error, a changed HTML container, or a response that fails the Contract's Zod schema throw `Failure("drift", ...)` with a Fingerprint `plugin:skill:operation:class:path:code`. `run()` catches it and returns `{ code: 3, output: { error: { kind: "drift", message, fingerprint, diff?, drifts?, version, os, next } } }`. Exit codes: `EXIT = { ok 0, bug 1, input 2, drift 3, session 4, network 5 }`. 5xx and 429 after retries are `network` (5), not Drift. `Failure` itself (thrown by `Client.call` when used directly) carries `.kind`, `.fingerprint` and `.drifts`.

### Billetto's Chrome bootstrap

Billetto's `site.ts` `bootstrap` launches headless Chrome (`launchInMemory(site, true)`), opens `https://billetto.dk/da`, waits for the page's first Algolia request, and reads the search-only key and application id. The result is cached in `session.json` in the state dir. A 401/403 reruns bootstrap once, then is Drift `auth`. Playwright runs through `playwright-core` with `channel: "chrome"` (or `executablePath` from `SITE_CLI_CHROME`); on Linux it looks for `/opt/google/chrome/chrome`. The other seven skills never launch Chrome.

## Evidence from proof scripts

Throwaway `*.tmp.ts` scripts in the worktree (deleted before commit), run on macOS arm64 with Chrome installed, against the live sites for 2026-11-18 (public reads).

**1. All eight skills import into one process.** `import()` of each skill's `main.ts`, `site.ts` and `registry.ts`: 462 ms total, no auto-run, no exit. Commands found: absalon `category list`, `event list`; billetto `event search`; brugbyen `event list`, `filter list`; dmi `forecast`; kultunaut `event list`, `genre list`; kulturkbh `event list`; teaterbilletter `category list`, `show list`; wannasport `slot search`, `sport list`.

**2. Module identity.** 8 distinct `Failure` classes and 8 distinct `zod` module instances (one per skill's own `node_modules`). `instanceof Failure` across skills is `false`. After moving all dependencies to a single root `node_modules`, the eight skills' `commands[0].args` share 1 `ZodObject` constructor and `dmi forecast` still ran with exit 0. Global state: the runtime has only module-local caches (`never.ts` glob regex cache) and reads no process-global config except `process.env` defaults; no `process.chdir`, no signal handlers, no `process.exit` outside `emit()`.

**3. Running them through their own runtime, concurrently, live** (`await Promise.all(...)`, each with `SITE_CLI_HOME` set to its own temp dir):

| Skill | exit | time | result |
|---|---|---|---|
| dmi `forecast --date` | 0 | 0.5 s | forecast with `verdict` |
| absalon `event list` | 0 | 0.6 s | 16 events |
| kulturkbh `event list` | 0 | 0.6 s | 15 events |
| wannasport `slot search --sport padel` | 0 | 0.6 s | 8 venues |
| teaterbilletter `show list` | 0 | 1.3 s | 24 shows |
| kultunaut `event list --limit 200` | 0 | 3.4 s | 204 rows counted, 17 upstream requests |
| billetto `event search` | 0 | 4.9 s | 156 events (Chrome bootstrap) |
| brugbyen `event list` | 0 | 24 s | 51 events, 3 requests (the guide skill already says "sometimes slow") |

Billetto: cold call (Chrome bootstrap) 2.7 s; the next call reused `session.json` and took 98 ms with no Chrome.

**4. Calling a command directly** (`new Client(site, deps)`; `cmd.args.parse(...)`; `client.withRefusals(() => cmd.run(args, { call: client.call, session: { ids: {} }, note }))`) works too: kultunaut `event list` returned its events with no argv parsing and no envelope. A thrown drift there is a `Failure` with `.kind === "drift"` and `.fingerprint`, but no `.drifts` and not an instance of another skill's `Failure`.

**5. Drift through `run()` with an injected `deps.fetch`** (no Chrome, no network):

- dmi, body missing a field: exit 3, `drift`, fingerprint `cph-activities:dmi:GET /NinJo2DmiDk/ninjo2dmidk:zod:city:invalid_type`.
- dmi, HTTP 404: exit 3, `...:http::404`.
- dmi, HTTP 503: exit 5, `network` (no Fingerprint).
- kultunaut, page without the event list: exit 3, `cph-activities:kultunaut:GET /perl/arrlist/type-nynaut:html:events:no_match`.
- billetto, 403 on the call after a bootstrap: it reran bootstrap (Chrome, about 2.3 s), then exit 3, `cph-activities:billetto:POST /1/indexes/events/query:auth::403`.

**6. Billetto without Chrome.** With `SITE_CLI_CHROME=/nonexistent` only in `deps.env` the call still succeeded: billetto's `bootstrap` calls `launchInMemory(site, true)` with no env argument, so it reads `process.env`. With the variable in `process.env`, the result is exit 2, `kind: "input"`, "Google Chrome was not found". So the Chrome path must be set in the process environment, and a missing Chrome is an `input` error.

## Options compared

### (a) Import each skill and run it through its own runtime in-process (recommended)

- **Files touched:** new `server/` only. It imports `skills/<skill>/cli/src/{main,site,registry}.ts` by relative path. No skill file changes. Build changes: a root-level install of the pinned dependencies so one copy is shared (a root `package.json` entry or a `server/package.json` that the root install covers), and a server `Dockerfile` with a repo-root context and Chrome (the existing `skills/<skill>/Dockerfile` build a compiled binary on distroless without Chrome). `ci.yml` installs per `cli` dir and runs `bun test` at the root; the server needs its own install step there.
- **Cache seam:** `server/cache.ts` wraps `run()`: `getDay(source, argv)` with key `source|argv-normalized`; TTL per source; in-flight map for one fetch per key; stale-while-revalidate. Upstream cap: pass `deps.fetch` that counts per source (the Clients wrap it in their `site.never` guard, which still applies) and refuses above the cap; the last cache entry is served with a note. Billetto's Chrome launch is outside `deps.fetch`, so count bootstraps separately (it only happens on a cold or refused `session.json`).
- **Stale-on-Drift and the issue:** in the wrapper, `code === 3` with `output.error.kind === "drift"`: return the last good value marked `stale: true` with the Fingerprint(s), or leave the source out when there is none. File one issue per distinct Fingerprint, title exactly the Fingerprint, label `drift` (the convention in `skills/cph-activities-feedback/SKILL.md`); keep a set of seen Fingerprints in memory and check GitHub for an open issue with the same exact title before creating one. `code === 5` (network) is also stale-then-retry, but files nothing. `code === 2` or `1` from a source is an alert for the maintainer, not Drift.
- **Risks:** eight copies of the runtime means eight `Failure` classes (read the envelope, not `instanceof`); `deps.env` is honoured everywhere except billetto's bootstrap Chrome path; each `run()` builds a Client and moves a legacy state dir (a no-op here since `skill !== plugin`); Chrome per billetto call (closed in `finally` through `deps.release`), concurrent first calls would launch several, so the in-flight map must cover bootstrap; the skills' `tests/` stay green because nothing in them changes. A skill upgrade from site-cli-creator that renames `run`, `App` or `Deps` breaks the server's imports at typecheck, not at runtime.
- **Smallest change:** one file of about 40 lines (`runSource(skill, argv)` that loads `site/registry/main`, sets `deps`, returns `{output, code}`), then the cache wrapper.

### (b) Spawn the CLIs

- **Files touched:** none in skills; `server/` runs `bun skills/<skill>/cli/src/main.ts <argv>` (needs 8 installs) or the compiled `bin/<skill>` from `build.ts` (needs the Bun targets and the `playwright-core` compile patch in `build.ts`). The server image carries the binaries.
- **Cache seam:** around the spawn, same key as (a). The per-source cap can only count spawns, not upstream requests (kultunaut makes 17 requests for one day, brugbyen 3, billetto 1 plus a bootstrap).
- **Drift:** read stdout JSON and the exit code (3). Same envelope, so no code reuse issue.
- **Risks:** a process per call (Bun start plus Chrome for billetto); large stdout (the runtime's `emit` exists because piped output cuts at 64 KB); no shared `deps.fetch`, so no per-source request cap and no in-process retry control; concurrency limited by processes. Everything (a) proves works, (b) works; it just gives up the cap and costs more per call. Choose it only if a skill ever cannot be imported (none was found).

### (c) A new per-source `fetchDay` per skill, used by the server and the CLI

- **Files touched:** each skill's `src/lib/` plus its command (the command's loop moves into `fetchDay` and the command calls it), across eight skills, and the same again in site-cli-creator's generator, because `src/commands/*` and `registry.ts` are generated or edited by the generator's modes and `src/runtime/` is overwritten by `regen`. Every PR also bumps the plugin version in the manifests (`bun run bump`).
- **Cache seam:** the cleanest one: `fetchDay(date)` returns the whole day (no `--limit`, no filters), so the key is exactly `source|date`, and `plan_outing` filters in memory. That is the only option that makes "per source per day" literal.
- **Why not first:** kultunaut's command currently caps at `--limit` 200 and 30 requests (12 rows a page), while the day I measured had 204 rows already and the code comment says days can hold 600+; billetto returns up to 1000 hits in one request. So a day-wide function is a behaviour change per source (and a Contract change for the guide skill, which uses those flags). It is worth doing for kultunaut and billetto only if the plan tool needs more than the 200 first rows; do it then, as a thin function the command and server both call.
- **Risks:** touches shared command code that the guide skill's rules depend on; the CLI output shape must not change; more review per source than (a).

## Open points for the build tickets

- Does `plan_outing` need whole days from kultunaut (more than 200 rows)? Decides whether (c) is needed for that one source.
- brugbyen took 24 s once: the server needs a per-source timeout, and its TTL can be longer. The runtime has `retryDelays` (default 500 ms, 1500 ms) and `sleep` as `Deps`, so retries are controllable per source.
- Chrome in the image: install `google-chrome-stable` (lands in `/opt/google/chrome/`) and set `SITE_CLI_CHROME` in the process environment. Memory: one headless Chrome at a time, only on a cold or refused billetto session.
- The image cannot be the existing distroless one. If the server is compiled with `bun build --compile`, it needs the `playwright-core` path patch from `skills/billetto/cli/build.ts`; running from source on `oven/bun` avoids that.
