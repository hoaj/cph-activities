// The public website: the page at /, POST /api/keys (a personal MCP address) and POST /api/chat. Limits:
// new keys per address; chat messages per browser (the signed cph_uid cookie), per address and in total.
// Tool calls through a key are counted by the MCP side's own limiter, like a personal link's.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Chat, ChatTurn } from "./chat";
import type { Signer } from "./keys";
import { slidingLimiter, type LimitResult, type Limiter } from "./limits";
import type { Log } from "./log";

export type SiteHandler = (req: Request, path: string, ip: string) => Promise<Response | null>;

export type SiteLimits = { keysPerIpDay: number; chatPerUserHour: number; chatPerUserDay: number; chatPerIpDay: number; chatPerDay: number };
export const SITE_LIMITS: SiteLimits = { keysPerIpDay: 5, chatPerUserHour: 15, chatPerUserDay: 50, chatPerIpDay: 100, chatPerDay: 2000 };

const PAGE = readFileSync(join(import.meta.dir, "..", "public", "index.html"));
const HISTORY = 12;
const TURN_CHARS = 2000;
const COOKIE = "cph_uid";

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const at = (ms: number) => new Date(ms).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

function cookieOf(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** The turns of a chat request: user and assistant text only, the last one from the user, trimmed to size. */
function turnsOf(body: unknown): ChatTurn[] | null {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list)) return null;
  const turns = list
    .filter((m): m is ChatTurn => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim() !== "")
    .map((m) => ({ role: m.role, content: m.content.slice(0, TURN_CHARS) }))
    .slice(-HISTORY);
  while (turns.length && turns[0]!.role !== "user") turns.shift();
  return turns.length && turns[turns.length - 1]!.role === "user" ? turns : null;
}

export function createSite(cfg: { signer?: Signer; chat: Chat; publicUrl?: string; log: Log; limits?: SiteLimits; now?: () => number }): SiteHandler {
  const l = cfg.limits ?? SITE_LIMITS;
  const now = cfg.now ?? Date.now;
  const keysByIp = slidingLimiter({ perHour: l.keysPerIpDay, perDay: l.keysPerIpDay, now });
  const chatByUser = slidingLimiter({ perHour: l.chatPerUserHour, perDay: l.chatPerUserDay, now });
  const chatByIp = slidingLimiter({ perHour: l.chatPerIpDay, perDay: l.chatPerIpDay, now });
  const chatTotal: Limiter = slidingLimiter({ perHour: l.chatPerDay, perDay: l.chatPerDay, now });
  const base = (req: Request) => (cfg.publicUrl ?? new URL(req.url).origin).replace(/\/+$/, "");
  const isJson = (req: Request) => (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");

  return async (req, path, ip) => {
    if (path === "/") {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
      return new Response(req.method === "HEAD" ? null : PAGE, { status: 200, headers: PAGE_HEADERS });
    }

    if (path === "/api/keys") {
      if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
      if (!cfg.signer) return json(503, { error: "Personlige adresser er ikke sat op endnu." });
      // A JSON body makes a cross-site form or script need a CORS preflight, which this server never grants.
      if (!isJson(req)) return json(415, { error: "Send JSON." });
      const r = keysByIp.take(ip);
      if (!r.ok) return json(429, { error: "Der er lavet mange adresser fra din forbindelse i dag. Prøv igen i morgen." }, { "retry-after": String(Math.ceil((r.resetsAt - now()) / 1000)) });
      const key = cfg.signer.newKey();
      cfg.log("key_created", { link: cfg.signer.keyName(key) });
      return json(200, { url: `${base(req)}/mcp/${key}` });
    }

    if (path === "/api/chat") {
      if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
      if (!cfg.signer || !cfg.chat.enabled) return json(503, { error: "Chatten er ikke sat op endnu. Brug i mellemtiden MCP-serveren i din egen agent." });
      if (!isJson(req)) return json(415, { error: "Send JSON." });
      let turns: ChatTurn[] | null;
      try {
        turns = turnsOf(await req.json());
      } catch {
        turns = null;
      }
      if (!turns) return json(400, { error: "Skriv en besked." });

      let uid = cfg.signer.uidOf(cookieOf(req, COOKIE));
      const headers: Record<string, string> = {};
      if (!uid) {
        const value = cfg.signer.newUid();
        uid = cfg.signer.uidOf(value)!;
        headers["set-cookie"] = `${COOKIE}=${value}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
      }
      const over = (r: LimitResult, text: (r: Extract<LimitResult, { ok: false }>) => string) =>
        r.ok ? null : json(429, { error: text(r) }, { ...headers, "retry-after": String(Math.ceil((r.resetsAt - now()) / 1000)) });
      const blocked =
        over(chatTotal.take("all"), () => "Chatten har nået dagens loft. Prøv igen i morgen, eller brug MCP-serveren i din egen agent.") ??
        over(chatByIp.take(ip), (r) => `Der er sendt mange beskeder fra din forbindelse i dag. Prøv igen efter kl. ${at(r.resetsAt)}.`) ??
        over(chatByUser.take(uid), (r) => `Du har brugt dine ${r.limit} beskeder ${r.window === "hour" ? "for denne time" : "for i dag"}. Prøv igen efter kl. ${at(r.resetsAt)}.`);
      if (blocked) return blocked;

      const started = now();
      try {
        const { reply, toolCalls } = await cfg.chat.reply(turns);
        cfg.log("chat", { user: uid.slice(0, 8), ms: now() - started, toolCalls });
        return json(200, { reply: reply || "Jeg fandt ikke noget svar. Prøv at skrive det på en anden måde." }, headers);
      } catch (e) {
        cfg.log("chat_error", { user: uid.slice(0, 8), ms: now() - started, error: String((e as Error)?.message ?? e).slice(0, 300) });
        return json(502, { error: "Chatten svarede ikke. Prøv igen om lidt." }, headers);
      }
    }

    return null;
  };
}
