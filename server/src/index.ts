// Entry point: LINKS (name:sha256 entries), PORT (default 8080), the cache settings (see README). PUBLIC_URL is only for `links.ts`.
import { feedbackGitHubFromEnv } from "./cache";
import { createToolDeps } from "./deps";
import { createFeedback } from "./feedback";
import { slidingLimiter } from "./limits";
import { parseLinks } from "./links";
import { createLogger } from "./log";
import { startServer } from "./server";

const log = createLogger();
const links = parseLinks(process.env.LINKS);
if (!links.names.length) log("warning", { message: "LINKS is empty: every /mcp request will get 404" });

const port = Number(process.env.PORT ?? 8080);
const server = startServer({
  port,
  links,
  limiter: slidingLimiter(),
  deps: createToolDeps(process.env, log),
  feedback: createFeedback({ github: feedbackGitHubFromEnv(process.env), log, linkBase: process.env.PUBLIC_URL }),
  log,
  // Railway puts the client address last in X-Forwarded-For; set TRUST_PROXY=0 to use the socket.
  trustProxy: process.env.TRUST_PROXY !== "0",
});
log("listening", { port: server.port, links: links.names });

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
