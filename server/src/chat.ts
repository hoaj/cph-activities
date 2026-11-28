// The website's chat: an OpenAI-compatible chat completions endpoint (DeepInfra by default) running a tool
// loop over the same tools the MCP server serves, through an in-memory MCP client, so both behave alike.
// send_feedback is left out: anonymous visitors do not file GitHub issues from here.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json";
import { copenhagenToday, type ToolDeps } from "./common";
import { INSTRUCTIONS } from "./instructions";
import type { Log } from "./log";
import { registerTools } from "./tools";

export type LlmConfig = { baseUrl: string; apiKey: string; model: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Chat = { enabled: boolean; reply(history: ChatTurn[]): Promise<{ reply: string; toolCalls: number }> };

const MAX_ROUNDS = 6;
const MAX_TOOL_TEXT = 12_000;
const OFF = new Set(["send_feedback"]);

/** The chat's opening instructions: the MCP server's, without the feedback part, plus the website's rules. */
export function chatPreamble(today: string): string {
  const weekday = new Date(today + "T12:00:00Z").toLocaleDateString("da-DK", { weekday: "long", timeZone: "UTC" });
  return `${INSTRUCTIONS.split("\n\nFeedback.")[0]}

Website. You are the chat on the website "Hvad sker der i København". Today is ${today}, a ${weekday} (Europe/Copenhagen): turn days like "lørdag" or "i morgen" into dates from it. Write in Danish unless the user writes in another language. The person writing is an adult: give them age 35 in a brief unless they say otherwise, and ask only for the ages of the others. When something is missing, ask it in your own words; never mention tools, briefs or what a tool asked for. Keep answers short and easy to scan: no tables and no headings; the best bet first, then 2-4 alternatives as a short list, each with time, place, price and its link written as [name](url). No emoji and no horizontal rules (---). Use only facts from the tool results: call something free only when the result says free or a price of 0; when the price is missing, write "pris ikke oplyst". Feedback cannot be sent from here; if the user wants to report something, point to https://github.com/hoaj/cph-activities/issues.`;
}

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg = { role: "user" | "assistant" | "tool"; content: string; tool_calls?: ToolCall[]; tool_call_id?: string };
type Completion = { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };

export function createChat(cfg: { deps: ToolDeps; llm: LlmConfig | null; log: Log; fetch?: typeof fetch; timeoutMs?: number }): Chat {
  const doFetch = cfg.fetch ?? fetch;
  let tools: Promise<{ client: Client; defs: unknown[]; names: Set<string> }> | null = null;
  const connect = async () => {
    const server = new McpServer({ name: "cph-activities-web", version: pkg.version });
    // The chat counts messages, not tool calls (site.ts), so the tools run without a per-call limit here.
    registerTools(server, { link: "web", limiter: { take: () => ({ ok: true }) }, deps: cfg.deps, log: cfg.log });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "cph-activities-web-chat", version: pkg.version });
    await client.connect(b);
    const listed = (await client.listTools()).tools.filter((t) => !OFF.has(t.name));
    return {
      client,
      names: new Set(listed.map((t) => t.name)),
      defs: listed.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
    };
  };

  const complete = async (body: Record<string, unknown>): Promise<Completion> => {
    const llm = cfg.llm!;
    const r = await doFetch(`${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${llm.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: llm.model, max_tokens: 1500, temperature: 0.3, ...body }),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000),
    });
    if (!r.ok) throw new Error(`LLM answered ${r.status}`);
    return (await r.json()) as Completion;
  };

  const runTool = async (t: Awaited<NonNullable<typeof tools>>, call: ToolCall): Promise<string> => {
    if (!t.names.has(call.function.name)) return `ERROR: there is no tool named ${call.function.name}.`;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments || "{}");
    } catch {
      return "ERROR: the arguments were not valid JSON. Call the tool again with a JSON object.";
    }
    const res = await t.client.callTool({ name: call.function.name, arguments: args });
    const content = (res.content as { type: string; text?: string }[] | undefined) ?? [];
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    return (res.isError ? "ERROR: " : "") + text.slice(0, MAX_TOOL_TEXT);
  };

  return {
    enabled: !!cfg.llm,
    async reply(history) {
      tools ??= connect();
      const t = await tools;
      // DeepInfra advises against system messages with tool calling, so the instructions open the first user turn.
      const [first, ...rest] = history;
      const messages: Msg[] = [{ role: "user", content: `${chatPreamble((cfg.deps.today ?? copenhagenToday)())}\n\n---\n\n${first!.content}` }, ...rest];
      let toolCalls = 0;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const msg = (await complete({ messages, tools: t.defs, tool_choice: "auto" })).choices?.[0]?.message;
        if (!msg) throw new Error("LLM gave no message");
        const calls = msg.tool_calls ?? [];
        if (!calls.length) return { reply: (msg.content ?? "").trim(), toolCalls };
        messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
        const results = await Promise.all(calls.map((c) => runTool(t, c)));
        calls.forEach((c, i) => messages.push({ role: "tool", tool_call_id: c.id, content: results[i]! }));
        toolCalls += calls.length;
      }
      // Out of rounds: one last answer from what it has, without tools.
      const last = (await complete({ messages, tools: t.defs, tool_choice: "none" })).choices?.[0]?.message;
      return { reply: (last?.content ?? "").trim(), toolCalls };
    },
  };
}
