import { createApp, type AppConfig } from "./app";

/** Starts the HTTP server. Port 0 picks a free one (tests). */
export function startServer(cfg: AppConfig & { port: number }) {
  const handle = createApp(cfg);
  return Bun.serve({
    port: cfg.port,
    hostname: "0.0.0.0",
    maxRequestBodySize: 1024 * 1024,
    fetch: (req, server) => handle(req, server.requestIP(req)?.address),
    error(err) {
      cfg.log("error", { error: String(err.message).slice(0, 300) });
      return new Response(null, { status: 500 });
    },
  });
}
