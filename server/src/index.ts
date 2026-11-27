// Entry point: LINKS (name:sha256 entries), PORT (default 8080), the cache settings (see README). PUBLIC_URL is for `links.ts`,
// the serverInfo icons and the website's personal addresses. KEY_SECRET signs those addresses and the chat's cookie;
// LLM_API_KEY (with LLM_BASE_URL, LLM_MODEL) turns the website's chat on.
import { feedbackGitHubFromEnv } from "./cache";
import { createChat } from "./chat";
import { createToolDeps } from "./deps";
import { createFeedback } from "./feedback";
import { createSigner } from "./keys";
import { slidingLimiter } from "./limits";
import { parseLinks } from "./links";
import { createLogger } from "./log";
import { startServer } from "./server";
import { createSite } from "./site";

const log = createLogger();
const links = parseLinks(process.env.LINKS);
if (!links.names.length) log("warning", { message: "LINKS is empty: only self-service keys reach /mcp" });

const keySecret = process.env.KEY_SECRET;
if (keySecret !== undefined && keySecret.length < 32) throw new Error("KEY_SECRET must be at least 32 characters");
const signer = keySecret ? createSigner(keySecret) : undefined;
if (!signer) log("warning", { message: "KEY_SECRET is not set: the website hands out no personal addresses and has no chat" });
const llm = process.env.LLM_API_KEY
  ? { apiKey: process.env.LLM_API_KEY, baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepinfra.com/v1/openai", model: process.env.LLM_MODEL ?? "deepseek-ai/DeepSeek-V4-Flash" }
  : null;
if (!llm) log("warning", { message: "LLM_API_KEY is not set: the website's chat is off" });
const deps = createToolDeps(process.env, log);

const port = Number(process.env.PORT ?? 8080);
const server = startServer({
  port,
  links,
  signer,
  site: createSite({ signer, chat: createChat({ deps, llm, log }), publicUrl: process.env.PUBLIC_URL, log }),
  limiter: slidingLimiter(),
  deps,
  feedback: createFeedback({ github: feedbackGitHubFromEnv(process.env), log, linkBase: process.env.PUBLIC_URL }),
  log,
  publicUrl: process.env.PUBLIC_URL,
  // Railway puts the client address last in X-Forwarded-For; set TRUST_PROXY=0 to use the socket.
  trustProxy: process.env.TRUST_PROXY !== "0",
});
log("listening", { port: server.port, links: links.names, keys: !!signer, chat: llm ? llm.model : false });

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
