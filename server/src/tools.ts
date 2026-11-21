// The server's tools. Every tool goes through guard(), which counts the call against the link's
// limits and, over the limit, answers with an error result (never an HTTP 429, which clients may retry).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { LimitResult, Limiter } from "./limits";

export const limitMessage = (r: Extract<LimitResult, { ok: false }>, now: number) => {
  const minutes = Math.max(1, Math.ceil((r.resetsAt - now) / 60_000));
  return `Limit reached: this link may make ${r.limit} tool calls per ${r.window}. It resets at ${new Date(r.resetsAt).toISOString().replace(/\.\d+Z$/, "Z")} (in about ${minutes} minute${minutes === 1 ? "" : "s"}). Do not retry before then; tell the user.`;
};

export function registerTools(server: McpServer, ctx: { link: string; limiter: Limiter; now?: () => number }): void {
  const guard =
    <A extends unknown[]>(run: (...args: A) => CallToolResult | Promise<CallToolResult>) =>
    async (...args: A): Promise<CallToolResult> => {
      const r = ctx.limiter.take(ctx.link);
      if (!r.ok) return { isError: true, content: [{ type: "text", text: limitMessage(r, (ctx.now ?? Date.now)()) }] };
      return run(...args);
    };

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Checks that the connection to cph-activities works. Takes no input and returns pong. Use it only to test the connection.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guard(() => ({ content: [{ type: "text", text: "pong" }] })),
  );
}
