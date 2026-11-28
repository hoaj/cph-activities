import { expect, test } from "bun:test";
import { chatPreamble, createChat } from "../src/chat";
import { DATE, fakeDeps, forecast, item } from "./helpers";

type Body = { model: string; messages: { role: string; content: string; tool_call_id?: string }[]; tools?: { function: { name: string } }[]; tool_choice?: string };

/** A fake chat completions endpoint: answers each request with the next scripted message, recording the bodies. */
function fakeLlm(script: unknown[]) {
  const bodies: Body[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const message = script[Math.min(bodies.length - 1, script.length - 1)];
    return Response.json({ choices: [{ message }] });
  }) as unknown as typeof fetch;
  return { f, bodies };
}

const call = (name: string, args: unknown, id = "c1") => ({ content: "", tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const llm = { baseUrl: "https://llm.test/v1/", apiKey: "k", model: "test-model" };
const deps = () => fakeDeps({ items: [item({ id: "k:1", title: "Jazzkoncert", date: DATE, time: "20:00", categories: ["Jazz"] })], weather: forecast("dry") });

test("the preamble keeps the server's instructions, drops feedback and names the day", () => {
  const p = chatPreamble("2026-11-28");
  expect(p).toContain("plan_outing");
  expect(p).not.toContain("send_feedback");
  expect(p).toContain("Today is 2026-11-28, a lørdag");
  expect(p).toContain("No emoji");
});

test("a tool call runs against the real tools and the answer comes back", async () => {
  const { f, bodies } = fakeLlm([call("find_events", { from: DATE }), { content: "Prøv **Jazzkoncert** kl. 20." }]);
  const chat = createChat({ deps: deps(), llm, log: () => {}, fetch: f });
  const r = await chat.reply([{ role: "user", content: "Hvad sker der lørdag?" }]);
  expect(r).toEqual({ reply: "Prøv **Jazzkoncert** kl. 20.", toolCalls: 1 });
  expect(bodies[0]!.model).toBe("test-model");
  expect(bodies[0]!.messages[0]!.content).toContain("Hvad sker der lørdag?");
  expect(bodies[0]!.messages[0]!.content).toContain("Website.");
  const names = bodies[0]!.tools!.map((t) => t.function.name);
  expect(names).toContain("plan_outing");
  expect(names).not.toContain("send_feedback");
  const toolMsg = bodies[1]!.messages.find((m) => m.role === "tool")!;
  expect(toolMsg.tool_call_id).toBe("c1");
  expect(toolMsg.content).toContain("Jazzkoncert");
});

test("send_feedback and unknown tools are refused, bad JSON is reported", async () => {
  const bad = { content: "", tool_calls: [{ id: "c2", type: "function", function: { name: "find_events", arguments: "{nope" } }] };
  const { f, bodies } = fakeLlm([call("send_feedback", { kind: "bug" }), bad, { content: "ok" }]);
  const chat = createChat({ deps: deps(), llm, log: () => {}, fetch: f });
  await chat.reply([{ role: "user", content: "hej" }]);
  expect(bodies[1]!.messages.at(-1)!.content).toBe("ERROR: there is no tool named send_feedback.");
  expect(bodies[2]!.messages.at(-1)!.content).toContain("not valid JSON");
});

test("the loop stops after six rounds and asks for an answer without tools", async () => {
  const { f, bodies } = fakeLlm([call("list_options", {})]);
  const chat = createChat({ deps: deps(), llm, log: () => {}, fetch: f });
  const r = await chat.reply([{ role: "user", content: "hej" }]);
  expect(bodies.length).toBe(7);
  expect(bodies[6]!.tool_choice).toBe("none");
  expect(r.toolCalls).toBe(6);
});

test("an LLM error is thrown, and no LLM means the chat is off", async () => {
  const f = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  await expect(createChat({ deps: deps(), llm, log: () => {}, fetch: f }).reply([{ role: "user", content: "hej" }])).rejects.toThrow("LLM answered 500");
  expect(createChat({ deps: deps(), llm: null, log: () => {} }).enabled).toBe(false);
});
