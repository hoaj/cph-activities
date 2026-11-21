// The HTTP side: /healthz, and /mcp/<secret> (or /mcp with a bearer header) as stateless
// Streamable HTTP, one MCP server and transport per request.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import pkg from "../package.json";
import type { ToolDeps } from "./common";
import type { Feedback } from "./feedback";
import { INSTRUCTIONS, registerPrompts } from "./instructions";
import type { LinkTable } from "./links";
import type { Limiter } from "./limits";
import type { Log } from "./log";
import { registerTools } from "./tools";

export type AppConfig = {
  /** The cache, item index and option lists the tools use: one set for the whole process. */
  deps: ToolDeps;
  /** send_feedback's state and GitHub client: one for the whole process. Without it the tool says feedback is not set up. */
  feedback?: Feedback;
  links: LinkTable;
  limiter: Limiter;
  log: Log;
  /** Misses (unknown links) one address may make per window before it gets 429. */
  missLimit?: number;
  missWindowMs?: number;
  /** Take the client address from the proxy's X-Forwarded-For (its last entry), not the socket. */
  trustProxy?: boolean;
  now?: () => number;
};

export type Handler = (req: Request, socketIp?: string) => Promise<Response>;

const bare = (status: number, headers?: Record<string, string>) => new Response(null, { status, headers });

/** Counts unknown-link requests per address in a fixed window. */
function missCounter(limit: number, windowMs: number, now: () => number) {
  const seen = new Map<string, { count: number; until: number }>();
  return {
    /** True when this miss is allowed (and counted); false when the address is over the limit. */
    miss(ip: string): { allowed: boolean; retryAfterS: number } {
      const t = now();
      if (seen.size > 10_000) for (const [k, v] of seen) if (v.until <= t) seen.delete(k);
      let e = seen.get(ip);
      if (!e || e.until <= t) seen.set(ip, (e = { count: 0, until: t + windowMs }));
      if (e.count >= limit) return { allowed: false, retryAfterS: Math.ceil((e.until - t) / 1000) };
      e.count++;
      return { allowed: true, retryAfterS: 0 };
    },
  };
}

export function createApp(cfg: AppConfig): Handler {
  const now = cfg.now ?? Date.now;
  const misses = missCounter(cfg.missLimit ?? 10, cfg.missWindowMs ?? 10 * 60_000, now);

  const ipOf = (req: Request, socketIp?: string) => {
    if (cfg.trustProxy) {
      const last = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
      if (last) return last;
    }
    return socketIp ?? "unknown";
  };

  /** The secret of a request to /mcp: the path segment, else the bearer token. Null when not an /mcp request. */
  const secretOf = (req: Request, path: string): string | null | undefined => {
    if (path !== "/mcp" && !path.startsWith("/mcp/")) return undefined;
    const seg = path.slice("/mcp/".length);
    if (path !== "/mcp" && seg && !seg.includes("/")) {
      try {
        return decodeURIComponent(seg);
      } catch {
        return null;
      }
    }
    if (path === "/mcp") return /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
    return null;
  };

  return async (req, socketIp) => {
    const path = new URL(req.url).pathname;
    const ip = ipOf(req, socketIp);
    const started = now();
    // Only these paths are logged as they are; anything else is cut short, and redacted by the logger.
    const shown = path === "/healthz" || path === "/mcp" ? path : path.startsWith("/mcp/") ? "/mcp/<link>" : path.slice(0, 80);
    const done = (res: Response, link?: string) => {
      if (path !== "/healthz") cfg.log("request", { method: req.method, path: shown, status: res.status, ms: now() - started, ip, ...(link && { link }) });
      return res;
    };

    if (path === "/healthz") {
      if (req.method !== "GET" && req.method !== "HEAD") return bare(405, { allow: "GET, HEAD" });
      return new Response(req.method === "HEAD" ? null : "ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    const secret = secretOf(req, path);
    const link = secret ? cfg.links.find(secret) : null;
    if (secret === undefined || !link) {
      if (secret === undefined) return done(bare(404));
      const m = misses.miss(ip);
      return done(m.allowed ? bare(404) : bare(429, { "retry-after": String(m.retryAfterS) }));
    }

    if (req.method !== "POST") return done(bare(405, { allow: "POST" }), link);

    const server = new McpServer({ name: "cph-activities", version: pkg.version }, { instructions: INSTRUCTIONS });
    registerTools(server, { link, limiter: cfg.limiter, deps: cfg.deps, feedback: cfg.feedback, log: cfg.log, now });
    registerPrompts(server);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      return done(await transport.handleRequest(req), link);
    } catch (e) {
      cfg.log("error", { link, error: String((e as Error)?.message ?? e).slice(0, 300) });
      return done(Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }, { status: 500 }), link);
    } finally {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    }
  };
}
