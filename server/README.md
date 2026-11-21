# cph-activities server

A remote MCP server for the plugin's sources, for the maintainer and a few friends, behind personal secret links. Built under the map [hoaj/cph-activities#19](https://github.com/hoaj/cph-activities/issues/19). This is the skeleton: stateless Streamable HTTP, personal links, per-link limits, a health check and the image. The only tool is `ping`; the source tools come in later tickets.

## What it serves

| Route | What |
|---|---|
| `POST /mcp/<secret>` | MCP (stateless Streamable HTTP). `GET` and `DELETE` answer 405. |
| `POST /mcp` with `Authorization: Bearer <secret>` | The same, for clients that can set headers. |
| `GET /healthz` | `200 ok`. Outside the links; starts no Chrome and calls no source. |
| anything else, or an unknown or revoked secret | a bare `404` (no body, so clients do not start OAuth discovery). After 10 such misses in 10 minutes from one address, that address gets a bare `429` with `Retry-After` for further misses; a valid link is never blocked. |

Each link may make 60 tool calls an hour and 300 a day (sliding windows, in memory, so a restart resets them). Over the limit, the tool call returns an error result saying when the limit resets (not an HTTP error, which clients may retry badly).

Logs are JSON lines on stderr. The secret is never logged: every line passes through a redactor that turns `/mcp/<anything>` into `/mcp/<redacted>` and hides bearer tokens. The only identity in a log line or a limit is the link's name.

## Environment

| Variable | Meaning |
|---|---|
| `LINKS` | Secret. Comma-separated `name:<sha256 hex of the secret>` entries, e.g. `anna:9f86...,peter:2c26...`. Names are `[a-z0-9-]`, 1-32 characters. A malformed entry stops the server at start. Empty means every `/mcp` request gets 404. |
| `PUBLIC_URL` | The server's public address, e.g. `https://cph.example.com`. Only `links.ts` reads it, to print finished links. |
| `PORT` | Port to listen on. Default 8080 (Railway sets it). |
| `TRUST_PROXY` | Default on: the client address for the miss throttle is the last entry of `X-Forwarded-For` (what Railway's proxy appends). Set `0` to use the socket address. |
| `SOURCE_CAP_PER_HOUR` | Upstream requests one source may make in a sliding hour. Default 30. `SOURCE_CAP_PER_HOUR_<SOURCE>` (e.g. `SOURCE_CAP_PER_HOUR_KULTUNAUT=300`) overrides it for one source. Counted by a wrapper around each skill's `fetch`, retries and pages included. |
| `GITHUB_TOKEN` | Secret. A token with issues scope only, for `hoaj/cph-activities` (`GITHUB_REPO` changes the repo). Without it the server logs the issue it would file (`drift_issue_would_file`). |
| `CACHE_TTL_EVENTS_S`, `CACHE_TTL_SLOTS_S`, `CACHE_TTL_WEATHER_S` | Seconds a day stays fresh: event sources (default 3600), court slots from wannasport (600), weather from dmi (3600). |
| `CACHE_MAX_ENTRIES`, `CACHE_MAX_AGE_S` | Days kept, least recently used first out (default 500); nothing older than this is ever served (default 86400). |
| `SITE_CLI_CHROME` | Path to Chrome for the Billetto skill. The image sets `/opt/google/chrome/chrome`. Not used by the skeleton. |

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

A live check, not run in CI: `bun server/scripts/live-cache-check.ts` fetches two days from every source twice; the second run must make zero upstream requests.

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

The build context is the repo root, because the image copies `server/` and `skills/`. Google Chrome ships for amd64 only, so on an Apple-silicon Mac add `--platform linux/amd64`.

```sh
docker build --platform linux/amd64 -f server/Dockerfile -t cph-server .
docker run --rm -p 8080:8080 -e LINKS='anna:<hash>' cph-server
curl localhost:8080/healthz
```

The image is `oven/bun:1.4.3-debian` plus `google-chrome-stable` and `fonts-noto-core`, runs as the image's non-root `bun` user and starts `bun server/src/index.ts` on `$PORT`.

## Railway

One service from this folder's Dockerfile, with the repo root as build context (decision on [#21](https://github.com/hoaj/cph-activities/issues/21)):

- Variable `RAILWAY_DOCKERFILE_PATH=/server/Dockerfile`; root directory left unset.
- Deploy from `main` with watch paths `/server/**`, `/skills/**`, `/package.json`, `/bun.lock`; optionally "Wait for CI".
- Health check path `/healthz`.
- Region EU West Metal (Amsterdam), one replica, no volume.
- Secret variable `LINKS`; `PUBLIC_URL` is only needed where you run `links.ts`.
- On the first deploy, check that the build context really is the repo root and watch Chrome's memory use.
