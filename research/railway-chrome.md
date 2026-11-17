# Bun with headless Chrome on Railway, deployed from one folder of this repo

Researched 2026-11-17 for [hoaj/cph-activities#21](https://github.com/hoaj/cph-activities/issues/21) (map #19). Read-only: nothing was created or changed on Railway. Claims marked "estimate" are mine, not Railway's; everything else cites its source.

## Recommendation

Run `server/` as one Railway service built from its own **Dockerfile**, with the repo root as the build context, so the image can copy both `server/` and `skills/`.

| Decision | Recommendation |
|---|---|
| Builder | Dockerfile (`server/Dockerfile`), selected with the service variable `RAILWAY_DOCKERFILE_PATH=/server/Dockerfile`. Not Railpack: it cannot install Google Chrome and its system libraries. |
| Root directory | **Leave unset** (repo root). A root directory makes Railway pull only that folder, which would hide `skills/`. |
| Watch paths | `/server/**`, `/skills/**`, `/package.json`, `/bun.lock` (adjust to the real root files). Patterns match from the repo root. |
| Base image | `oven/bun:1.4.3-debian` (glibc, Debian), pinned like the skills' Dockerfiles. Not distroless (no Chrome, no shell), not Alpine. |
| Chrome | `google-chrome-stable` from Google's apt repo, which installs to `/opt/google/chrome/chrome`, the exact path `chrome.ts` looks for. No code change. Set `SITE_CLI_CHROME=/opt/google/chrome/chrome` anyway to make it explicit. |
| Fonts | `fonts-liberation` (a dependency of the Chrome package) plus `fonts-noto-core`. billetto's bootstrap only reads network requests, so fonts matter little; keep the set small. |
| Memory / CPU | No limit override needed. Plan for about 1 GB peak (estimate): Bun idle about 100-150 MB, Chrome 300-500 MB only while the bootstrap runs. |
| Region | EU West Metal, Amsterdam, `europe-west4-drams3a`. |
| Volume | None. The cache is in memory by design, so a volume would only add downtime on each deploy. |
| Env vars | Set in the dashboard or `railway variable set` (values on stdin): the per-person link secrets, `SITE_CLI_CHROME`, `PORT` only if a target port is used. `RAILWAY_PUBLIC_DOMAIN` and `RAILWAY_GIT_COMMIT_SHA` come from Railway. |
| Health check | `GET /healthz` returning 2xx, timeout 120 s. It must not launch Chrome. |
| Cost | Hobby plan, about **$5-7 a month** all in (see Cost). |

### What the image must provide (from the repo)

- `skills/billetto/cli/src/site.ts` calls `launchInMemory(site, true)` in `bootstrap`: headless, no user-data dir, one page, closed in `finally`. It reads the Algolia key and application id from the front page's first Algolia request, with a 45 s wait. After that, billetto is plain HTTP.
- `runtime/login.ts` imports `playwright-core` (pinned 1.63.0 in `cli/package.json`) and calls `chromium.launch({ channel: "chrome", headless })`. So the image needs real Google Chrome, not Playwright's bundled Chromium, unless `SITE_CLI_CHROME` points to another binary.
- `runtime/chrome.ts` looks for `/opt/google/chrome/chrome` on Linux, or `SITE_CLI_CHROME`.
- The existing `skills/*/Dockerfile` files are `bun build` single-binary images on `gcr.io/distroless/cc-debian12` with no Chrome ("remote mode never launches a browser"). `server/` is a new image; it cannot reuse them. Those Dockerfiles use the skill folder as build context; the server's context is the repo root.
- `skills/cph-activities-deploy/hosts/railway.md` documents running from `skills/<skill>/` with `railway up`, no Railway config file (Config as Code is closed to new services), health check set through the MCP `update-service` tool or the dashboard, and a volume on `/data`. The server drops the volume but otherwise follows the same pattern.
- Only billetto needs Chrome, and only for the bootstrap. Launch it on demand and close it, never keep it resident: that keeps idle memory at the Bun process alone.

### Dockerfile sketch

```dockerfile
FROM oven/bun:1.4.3-debian
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg fonts-noto-core \
 && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*
ENV SITE_CLI_CHROME=/opt/google/chrome/chrome
WORKDIR /app
COPY package.json bun.lock* ./
COPY server/package.json server/
# ... install, COPY server/ and skills/ (paths relative to the repo root)
CMD ["bun", "server/src/index.ts"]
```

The package list is a starting point; the build ticket should run the image and check it. Google publishes Chrome stable for amd64 on Linux, and Railway runs amd64 hosts, so build with `--platform linux/amd64` locally (an Apple-silicon build would fail on the Chrome package).

## Details and sources

### Builder and Dockerfile
- Railway builds a file named exactly `Dockerfile` at the source root; `RAILWAY_DOCKERFILE_PATH` points to another name or path (example `/build/Dockerfile`). Variables are visible at build time only if the Dockerfile declares them with `ARG`. [Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- `build.builder` accepts `RAILPACK`, `NIXPACKS`, `DOCKERFILE`; `build.dockerfilePath` and `build.watchPatterns` are settable per service. The CLI's `railway environment edit --service-config <service> build.dockerfilePath ...` form works, and is how the Railway skill sets them. [Config as Code reference](https://docs.railway.com/config-as-code/reference), Railway skill `references/configure.md`.
- Config as Code (`railway.json/toml`) is deprecated for new services; existing files work until 2026-12-01. Prefer dashboard settings, variables or the CLI. [Config as Code reference](https://docs.railway.com/config-as-code/reference); matches `hosts/railway.md`.
- Not documented by Railway: build memory limits and build time. Estimate: a first build with the apt install takes a few minutes; later builds reuse cached layers.

### Monorepo: root directory vs watch paths
- A root directory means "Railway will only pull down files from that directory when creating new deployments." [Deploying a monorepo](https://docs.railway.com/deployments/monorepo)
- Watch paths are gitignore-style patterns that trigger a deployment only when changed files match. [Deploying a monorepo](https://docs.railway.com/deployments/monorepo)
- Railway's skill says a restrictive root directory hides shared code and calls for the "shared monorepo" pattern (no root directory, scope with build and start commands, add watch paths). `references/deploy.md` in [Railway's skills](https://github.com/railwayapp/railway-skills).
- Staff-confirmed community answer: the Dockerfile build context is the repo root when no root directory is set, so `COPY` paths start at the repo root. This is forum guidance, not official docs; **verify on the first deploy**. [Railway Help Station thread](https://station.railway.com/questions/include-monorepo-root-in-build-environme-f7bae155)
- Skipped deployments: commits outside the watch paths are skipped, and empty commits do not redeploy; use "Deploy Latest Commit". [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys)
- Optional "Wait for CI": the deployment stays `WAITING` until the commit's GitHub Actions workflows finish, a failed workflow skips it, two hours of waiting skips it. It needs a workflow that runs on push to `main`. This fits the map's "protected main, green CI". [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys)
- Caveat: if CI only runs on PRs, or has its own `paths:` filter, "Wait for CI" may never appear or resolve. Check before turning it on.

### Region
- EU West Metal, Amsterdam, identifier `europe-west4-drams3a`; set in service settings (or `deploy.multiRegionConfig`). Services default to the account's preferred region (Account Settings). Moving a service later needs no domain change; with a volume it means downtime. [Regions](https://docs.railway.com/deployments/regions)

### Health check
- Path returning 2xx; default timeout 300 s, changeable in settings or `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`. Railway injects `PORT` and checks that port. Requests come from the host `healthcheck.railway.app`, so the server must not reject unknown hosts. It is called only at deployment start, not afterwards. [Healthchecks](https://docs.railway.com/deployments/healthchecks)
- So `/healthz` should answer without touching Chrome or the upstream sources, and continuous monitoring needs something external (Railway's page suggests an Uptime Kuma template).
- The secret-link middleware must let `/healthz` through without a link.
- Restart policy: `ON_FAILURE`, `ALWAYS` or `NEVER` exist as `deploy.restartPolicyType`; `hosts/railway.md` records Railway's default as restart on failure. [Config as Code reference](https://docs.railway.com/config-as-code/reference)

### Deploys, restarts, in-memory cache
- One deployment per service; the old one overlaps briefly with the new one, then gets SIGTERM with 0 s before SIGKILL unless `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` is set. [Deployments reference](https://docs.railway.com/deployments/reference)
- With no volume, a deploy swaps instances without the "volume mounted once" downtime. [Volumes](https://docs.railway.com/reference/volumes)
- Consequence: the in-memory cache and per-link rate counters reset on every deploy and restart. That is accepted by the map's design (one instance), but the limits are soft across restarts. Replicas are out too: the cache and counters are per process.
- Handle SIGTERM: close any open Chrome.

### Chrome in the container
- Playwright's default Chromium switches include `--disable-dev-shm-usage`, so the small default `/dev/shm` of a container is not a problem for `chromium.launch`. [chromiumSwitches.ts at v1.63.0](https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/chromium/chromiumSwitches.ts)
- Playwright's Docker guidance: use `--init` to avoid PID 1 zombie processes, `--ipc=host` against out-of-memory crashes; root disables Chromium's sandbox (fine for trusted code; for untrusted sites run as another user). [Playwright Docker](https://playwright.dev/docs/docker) Railway gives no control over Docker run flags, so: always close the context in `finally` (billetto already does), and use `bun` as PID 1 with a SIGTERM handler. Billetto's bootstrap visits only billetto.dk's public front page, so running as root is acceptable; running as a non-root user is cleaner if the sandbox works under Railway's runtime (unverified).
- Not documented by Railway: shm size and seccomp. Verify by running the bootstrap once on the first deploy.

### Env vars and secrets
- Variables are set per service in the dashboard, with the CLI (`railway variable set KEY --stdin`), or referenced with `${{service.VAR}}`. Railway provides `RAILWAY_PUBLIC_DOMAIN`, and `RAILWAY_GIT_COMMIT_SHA` for GitHub-triggered deploys. [Variables reference](https://docs.railway.com/variables/reference)
- The Railway page does not cover sealed variables; check the dashboard before relying on them for the link secrets.
- Per-link secrets will be many and change often. If they live in one variable (a JSON map), a change redeploys the service and clears the cache. If the link store ticket (#2x) keeps them elsewhere, that does not apply.
- Railway sets `PORT`; bind `0.0.0.0:$PORT` (the skills' images set `PORT=8080`; Railway injects its own).

### Cost (Hobby plan, which is what the account is on)
- The user's workspace plan reads `HOBBY` (read with a GraphQL query, read-only).
- Hobby: $5 a month subscription including $5 of usage. Usage prices: RAM $10 per GB-month, vCPU $20 per vCPU-month, egress $0.05 per GB, volumes $0.15 per GB-month. A Hobby service may use up to 48 GB and 48 vCPU, so 1 GB is far inside it. [Pricing plans](https://docs.railway.com/reference/pricing/plans)
- Billing is by measured usage (RAM and CPU as used), not by a reserved size. This is my reading of the per-minute rates in the pricing page; the usage page of the dashboard confirms it after the first day.
- Estimate for one always-on service: about 150 MB average RAM is about $1.50; CPU mostly idle at 0.01-0.05 vCPU averaged is about $0.20-$1.00; egress under 5 GB is under $0.25. That is about $2-3 of usage, inside the $5 included, so the bill is **about $5 a month**.
- Pessimistic case: 1 GB resident all month plus 0.1 vCPU average is $10 + $2 = $12 of usage, so about $12 a month. Check with `railway usage` after a week.
- Set a workspace soft and hard spending limit (`railway usage limit set`) so a runaway loop cannot bill more than intended.

## Alternatives considered

| Option | Why not (or when) |
|---|---|
| Railpack/Nixpacks builder | Cannot reasonably install Google Chrome; no apt step without a config file. |
| Root directory `/server` | Hides `skills/`, and the point of `server/` is to reuse the skills' Operations. |
| Playwright's own image `mcr.microsoft.com/playwright:v1.x-noble` | Works, brings Chromium plus fonts, but it is Node-based and large (build and pull time), tied to a matching Playwright version, and its Chromium is not at `/opt/google/chrome/chrome` (needs `SITE_CLI_CHROME`). Acceptable fallback. |
| `bunx playwright-core install --with-deps chromium` in the Bun image | Smaller change to the image recipe, but the browser lives under a cache path, needs `SITE_CLI_CHROME` set, and a Playwright bump changes the build. Acceptable fallback. |
| A separate Chrome service (browserless) | Extra service, extra cost, network hop for a once-per-hour bootstrap. Revisit only if Chrome's memory hurts the main service. |
| Drop Chrome: call Algolia directly with a hard-coded key | Not decided here. The key is read from the page on purpose so Drift is noticed; an alternative would be caching the key for a long TTL, so Chrome starts rarely. Worth a note in the Chrome-image build ticket. |
| Distroless like the skills' images | No shell, no apt, no Chrome. |
| Multiple replicas | Breaks the in-memory cache and counters; volumes also exclude replicas. |

## Open points for the build tickets

1. Confirm on the first deploy that the build context is the repo root when no root directory is set (forum-sourced).
2. Run the billetto bootstrap in the image on Railway once and check the memory graph; adjust the cost estimate.
3. Decide whether "Wait for CI" is on; it needs a workflow that runs on pushes to `main`.
4. Keep `/healthz` outside the secret-link check.
5. Make the Chrome launch lazy, cached by TTL, and serialized (one launch at a time).

## Sources

- Railway, Pricing plans: https://docs.railway.com/reference/pricing/plans
- Railway, Deploying a monorepo: https://docs.railway.com/deployments/monorepo
- Railway, Dockerfiles: https://docs.railway.com/builds/dockerfiles
- Railway, Healthchecks: https://docs.railway.com/deployments/healthchecks
- Railway, Regions: https://docs.railway.com/deployments/regions
- Railway, GitHub autodeploys: https://docs.railway.com/deployments/github-autodeploys
- Railway, Deployments reference: https://docs.railway.com/deployments/reference
- Railway, Variables reference: https://docs.railway.com/variables/reference
- Railway, Volumes: https://docs.railway.com/reference/volumes
- Railway, Config as Code reference: https://docs.railway.com/config-as-code/reference
- Railway skills (`use-railway` references `deploy.md`, `configure.md`, `usage.md`): https://github.com/railwayapp/railway-skills
- Railway Help Station, monorepo root in build: https://station.railway.com/questions/include-monorepo-root-in-build-environme-f7bae155
- Playwright, Docker: https://playwright.dev/docs/docker
- Playwright source, chromiumSwitches.ts (v1.63.0): https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/chromium/chromiumSwitches.ts
- This repo: `skills/billetto/Dockerfile`, `skills/billetto/cli/src/site.ts`, `skills/billetto/cli/src/runtime/login.ts`, `skills/billetto/cli/src/runtime/chrome.ts`, `skills/billetto/cli/package.json`, `skills/cph-activities-deploy/hosts/railway.md`
