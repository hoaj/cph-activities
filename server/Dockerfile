# cph-activities server. Build context is the REPO ROOT (the image copies server/, planner/ and skills/):
#   docker build --platform linux/amd64 -f server/Dockerfile -t cph-server .
# (Google Chrome stable ships for amd64 only.) Railway: RAILWAY_DOCKERFILE_PATH=/server/Dockerfile,
# root directory unset. See server/README.md.
FROM oven/bun:1.4.3-debian

# Google Chrome stable from Google's apt repo (installs to /opt/google/chrome/chrome) and Noto fonts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg fonts-noto-core \
 && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends google-chrome-stable \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/*
ENV SITE_CLI_CHROME=/opt/google/chrome/chrome

WORKDIR /app
# One writable state folder per skill (the skills write their state under SITE_CLI_HOME = $CPH_STATE_ROOT/<skill>).
RUN mkdir -p /tmp/cph-state && chown -R bun:bun /app /tmp/cph-state
USER bun

# The server imports ../planner, and the planner imports each skill's cli/src by path, so the image holds
# server/, planner/ and skills/. Each package keeps its own node_modules (production only). Dependencies
# are installed before the sources are copied where a lockfile is enough, so a code change does not
# reinstall them.
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun server/package.json server/bun.lock server/
RUN cd server && bun install --frozen-lockfile --production
COPY --chown=bun:bun .claude-plugin/plugin.json .claude-plugin/plugin.json
COPY --chown=bun:bun planner/ planner/
COPY --chown=bun:bun skills/ skills/
RUN set -e; for d in skills/*/cli; do (cd "$d" && bun install --frozen-lockfile --production); done
COPY --chown=bun:bun server/ server/

ENV PORT=8080 NODE_ENV=production CPH_STATE_ROOT=/tmp/cph-state
EXPOSE 8080
CMD ["bun", "server/src/index.ts"]
