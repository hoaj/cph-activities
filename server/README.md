# cph-activities server

A remote MCP server for the plugin's sources, for the maintainer and a few friends, behind personal secret links. Built under the map [hoaj/cph-activities#19](https://github.com/hoaj/cph-activities/issues/19). Stateless Streamable HTTP, personal links, per-link limits, a health check, the read-through cache and six read-only tools on the cache and the planner.

## What it serves

| Route | What |
|---|---|
| `POST /mcp/<secret>` | MCP (stateless Streamable HTTP). `GET` and `DELETE` answer 405. |
| `POST /mcp` with `Authorization: Bearer <secret>` | The same, for clients that can set headers. |
| `GET /healthz` | `200 ok`. Outside the links; starts no Chrome and calls no source. |
| anything else, or an unknown or revoked secret | a bare `404` (no body, so clients do not start OAuth discovery). After 10 such misses in 10 minutes from one address, that address gets a bare `429` with `Retry-After` for further misses; a valid link is never blocked. |

Each link may make 60 tool calls an hour and 300 a day (sliding windows, in memory, so a restart resets them). Over the limit, the tool call returns an error result saying when the limit resets (not an HTTP error, which clients may retry badly).

Logs are JSON lines on stderr. The secret is never logged: every line passes through a redactor that turns `/mcp/<anything>` into `/mcp/<redacted>` and hides bearer tokens. The only identity in a log line or a limit is the link's name.

## Tools

Six tools, each `readOnlyHint` and `openWorldHint`, each with an input schema, an output schema, and `structuredContent` plus the same compact JSON as text. Bad input (a malformed date, a limit over 50, an unknown id) is a tool error result with a message that says what to fix, never a protocol error. Nothing books or buys anything.

| Tool | Input | Answers |
|---|---|---|
| `plan_outing` | `brief`: `people[{label?, age?}]`, `date?`, `from?`, `to?`, `mood?[]`, `wishes?`, `budgetPerPerson?`, `indoorOnly?`, `area?`, `excludeIds?` ([#24](https://github.com/hoaj/cph-activities/issues/24)) | The planner's `needs_input` (nothing is fetched; with a date the weather is warmed in the background) or a shortlist: `weather` (only when it matters, else null), `best`, `alternatives`, `plan`, `assumptions`, `more`, `next` as `{label, patch}`. |
| `find_events` | `from`, `to?` (at most 7 days), `query?`, `categories?`, `free?`, `maxPricePerPerson?`, `fromTime?`, `toTime?`, `audienceAge?`, `excludeKids?`, `limit` (10, max 50), `cursor?` | Merged, deduplicated compact rows (`id`, title, date, time, venue, price, categories, sources, url), `total`, `nextCursor`, and `facets` by source, category, time of day and price band. Filters run in server code on the cached whole days. |
| `find_activity_slots` | `sport`, `date`, `from?`, `to?`, `players?` (2), `limit` | wannasport courts with free start times, price per court and per person, booking link. |
| `get_weather` | `date`, `from?`, `to?` | The dmi verdict (`dry`/`showers`/`wet`, cold, windy, snow), temperatures, DMI's text, warnings, and the hours of the window. |
| `get_details` | `id` | One item: description, every source's link, all start or court times, address, price. Ids come from the other tools and are remembered in memory for two hours (the id of any merged source works). |
| `list_options` | none | Sports, moods, audiences, category and genre names (brugbyen and kultunaut), brugbyen districts and groups. Cached six hours. |

Every result except `get_details` carries `sources: [{ source, status, kind?, ageMinutes? }]` (one entry per source asked, the worst status of its days) and `notes` (a sentence for each missing, capped or failing-stale source, and what was assumed or left out). `plan_outing`, `find_events`, `find_activity_slots` and `get_weather` go through `loadDaysFor` (`src/days.ts`) and the one shared `DayCache`.

Status values in `sources`: `fresh` (within its TTL), `stale` (older data served; with `kind` the last refresh failed), `capped` (the source's hourly cap is used up, older data served), `missing` (nothing from that source). `kind` is `drift`, `network`, `timeout`, `input`, `bug`, `session` or `capped`.

The server `instructions` (`src/instructions.ts`) are under 4,096 characters with a self-contained first 512; the MCP prompt `plan_a_day` carries the longer guide.

## Environment

| Variable | Meaning |
|---|---|
| `LINKS` | Secret. Comma-separated `name:<sha256 hex of the secret>` entries, e.g. `anna:9f86...,peter:2c26...`. Names are `[a-z0-9-]`, 1-32 characters. A malformed entry stops the server at start. Empty means every `/mcp` request gets 404. |
| `PUBLIC_URL` | The server's public address, e.g. `https://cph.example.com`. Only `links.ts` reads it, to print finished links. |
| `PORT` | Port to listen on. Default 8080 (Railway sets it). |
| `TRUST_PROXY` | Default on: the client address for the miss throttle is the last entry of `X-Forwarded-For` (what Railway's proxy appends). Set `0` to use the socket address. |
| `SOURCE_CAP_PER_HOUR` | Upstream requests one source may make in a sliding hour. Defaults per source: kultunaut 150, wannasport 60, every other source 30. This variable sets the default for sources without their own entry; `SOURCE_CAP_PER_HOUR_<SOURCE>` (e.g. `SOURCE_CAP_PER_HOUR_KULTUNAUT=300`) overrides any one source. Counted by a wrapper around each skill's `fetch`, retries and pages included. |
| `GITHUB_TOKEN` | Secret. A token with issues scope only, for `hoaj/cph-activities` (`GITHUB_REPO` changes the repo). Without it the server logs the issue it would file (`drift_issue_would_file`). |
| `CACHE_TTL_EVENTS_S`, `CACHE_TTL_SLOTS_S`, `CACHE_TTL_WEATHER_S` | Seconds a day stays fresh: event sources (default 3600), court slots from wannasport (600), weather from dmi (3600). |
| `CACHE_MAX_ENTRIES`, `CACHE_MAX_AGE_S` | Days kept, least recently used first out (default 500); nothing older than this is ever served (default 86400). |
| `SITE_CLI_CHROME` | Path to Chrome for the Billetto and wannasport skills. The image sets `/opt/google/chrome/chrome`. |
| `CPH_STATE_ROOT` | Parent of each skill's state folder (`<root>/<skill>`, the skill's `SITE_CLI_HOME`). Default `/tmp/cph-state`; must be writable. |

## The cache

`server/src/cache/` wraps the planner's `fetchDay` (hoaj/cph-activities#28). `DayCache.getDays(sources, dates, { audience? })` returns what the planner's `assemble` makes (`days`, plus the `fetches`) and one status per source and day. It is in memory, so a restart empties it.

- One entry per source and day (brugbyen: per audience), stale-while-revalidate: an expired day is served at once and refreshed in the background; a day older than the hard max age is never served. One fetch per key at a time, however many callers.
- Over a source's hourly cap nothing is fetched: the last entry is served as `capped`, or the source is `missing` with kind `capped`. A billetto day fetch also counts one request for its Chrome bootstrap (it is no `fetch` the cache can see).
- A failed refresh is not retried for 60 s.
- Drift (exit 3): the last good day is served as stale, and one GitHub issue titled with the Fingerprint is filed (label `drift`; shapes only: Fingerprint, source, skill version, time). While one is open, at most one comment a day is added. Network and timeout: stale, no issue, a per-source failure streak in the logs. Input, bug and session: stale, a `source_alert` log line, no issue.

Status values, per source and day:

| `status` | Meaning |
|---|---|
| `fresh` | Within its TTL. |
| `stale` | Past its TTL. With `kind` (`drift`, `network`, `timeout`, `input`, `bug`, `session`) the last refresh failed and `staleSince` says when it first did; without `kind` a refresh is just under way. `ageSeconds` is the age of the data served. |
| `capped` | Past its TTL and the source's cap is used up: the last entry is served, `note: "capped"`. |
| `missing` | No data (`ageSeconds` null), with `kind` saying why. The day's `items` are empty. |

Live checks, not run in CI: `bun server/scripts/live-cache-check.ts` fetches two days from every source twice (the second run must make zero upstream requests); `bun server/scripts/live-tools-check.ts` starts the server with a link and runs `plan_outing` for the coming Saturday, `find_events` and `get_weather` over the SDK client, printing counts, statuses and timing (set `SITE_CLI_CHROME` for billetto and wannasport; `VERBOSE=1` shows the log).

## Issue, rotate and revoke a link

```sh
PUBLIC_URL=https://cph.example.com bun server/links.ts add anna
```

This prints the finished link once (send it to the person privately) and the `anna:<hash>` line to add to `LINKS`. Only the hash is kept; the secret cannot be recovered.

- `rotate <name>` prints a new link and hash line for the same name; replace the name's entry in `LINKS`, and the old link stops working.
- To revoke, delete the entry from `LINKS` and redeploy (Railway redeploys when a variable changes).
- Set `LINKS` in the same shell when you run `add`, and it refuses a name that is already there.

Clients: Claude.ai, ChatGPT: add a custom connector with the link as its URL and "No authentication". Claude Code: `claude mcp add --transport http cph-activities <link>`.

## Run locally

```sh
cd server && bun install
LINKS="$(PUBLIC_URL=http://localhost:8080 bun links.ts add me | grep '^me:')" bun src/index.ts
bun test          # in server/, or `bun test server` from the repo root
```

## Run in Docker

The build context is the repo root, because the image copies `server/`, `planner/` and `skills/`. Google Chrome ships for amd64 only, so on an Apple-silicon Mac add `--platform linux/amd64`.

```sh
docker build --platform linux/amd64 -f server/Dockerfile -t cph-server .
docker run --rm -p 8080:8080 -e LINKS='anna:<hash>' cph-server
curl localhost:8080/healthz
```

The image is `oven/bun:1.4.3-debian` plus `google-chrome-stable` and `fonts-noto-core`, runs as the image's non-root `bun` user and starts `bun server/src/index.ts` on `$PORT`. The server imports `planner/`, which imports every skill's `cli/src` by path, so each of `server/` and `skills/*/cli` gets its own production `node_modules`; state goes to `/tmp/cph-state/<skill>`. The Dockerfile has not been built on the machine that wrote it (no Docker there): its steps were reproduced in a clean directory holding only what the image copies, and the server ran from there.

## Railway

One service from this folder's Dockerfile, with the repo root as build context (decision on [#21](https://github.com/hoaj/cph-activities/issues/21)):

- Variable `RAILWAY_DOCKERFILE_PATH=/server/Dockerfile`; root directory left unset.
- Deploy from `main` with watch paths `/server/**`, `/planner/**`, `/skills/**`, `/package.json`, `/bun.lock`; optionally "Wait for CI".
- Health check path `/healthz`.
- Region EU West Metal (Amsterdam), one replica, no volume.
- Secret variable `LINKS`; `PUBLIC_URL` is only needed where you run `links.ts`.
- On the first deploy, check that the build context really is the repo root and watch Chrome's memory use.
