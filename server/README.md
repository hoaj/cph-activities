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
| `SITE_CLI_CHROME` | Path to Chrome for the Billetto skill. The image sets `/opt/google/chrome/chrome`. Not used by the skeleton. |

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
