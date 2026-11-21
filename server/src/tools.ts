// The server's seven tools. Every tool goes through guard(), which counts the call against the link's
// limits and, over the limit, answers with an error result (never an HTTP 429, which clients may retry).
// Bad input is a tool error result with a message the model can act on, not a protocol error.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ToolInputError, toolError, type ToolDeps } from "./common";
import { getDetails, getDetailsInput, getDetailsOutput } from "./details";
import { findEvents, findEventsInput, findEventsOutput } from "./find-events";
import { createFeedback, feedbackInput, feedbackOutput, type Feedback, type FeedbackInput } from "./feedback";
import { findSlots, findSlotsInput, findSlotsOutput } from "./find-slots";
import { listOptions, listOptionsOutput } from "./list-options";
import type { LimitResult, Limiter } from "./limits";
import type { Log } from "./log";
import { planOutingTool, planOutingInput, planOutingOutput } from "./plan-outing";
import { getWeather, getWeatherInput, getWeatherOutput } from "./weather";

export const limitMessage = (r: Extract<LimitResult, { ok: false }>, now: number) => {
  const minutes = Math.max(1, Math.ceil((r.resetsAt - now) / 60_000));
  return `Limit reached: this link may make ${r.limit} tool calls per ${r.window}. It resets at ${new Date(r.resetsAt).toISOString().replace(/\.\d+Z$/, "Z")} (in about ${minutes} minute${minutes === 1 ? "" : "s"}). Do not retry before then; tell the user.`;
};

const annotations = { readOnlyHint: true, openWorldHint: true } as const;
const feedbackAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

export const DESCRIPTIONS = {
  plan_outing: `Plan an outing in Copenhagen (Københavns and Frederiksberg Kommune) from a brief: who goes, when, what kind of thing. Returns a shortlist: a best bet, two to four alternatives of different kinds, each with time, place, price, link and why it fits. Use it first for any open question like "what should we do Saturday?"; it merges events from all sources, checks the weather and applies age, budget and weather rules for you.
If it returns status "needs_input", ask the user the "ask" question word for word (offer "options"), then call again with the answers added to the brief. To refine, take a patch from "next", merge it into the brief and call again.
Each item carries the event's description, categories and ageFrom: read them before you suggest it, write its reason from them, and drop an item whose description shows it does not fit the brief. When description is null, no source says what the event is: say you do not know, call get_details, or keep it out of the main suggestions.
Not for a plain listing of events (find_events), court times (find_activity_slots) or only the forecast (get_weather). Books nothing.
Example: brief {"people":[{"age":31},{"label":"lillebror","age":17}],"date":"2026-11-28","mood":["active","gaming"],"budgetPerPerson":300}.`,
  find_events: `List events in Copenhagen across all event sources, merged so one event appears once with every source that lists it. Filter by words, category, price, time, age; returns compact rows with counts (facets) to narrow the search, and nextCursor for more. Use it when the user wants to browse or asks for one kind of thing on given days ("jazz this week under 200 kr.", "free things Sunday").
Every row carries description, categories, audience and ageFrom: read them before you suggest an event, and drop events whose description shows they do not fit what the user asked. Judge fit from the description, not the title. When description is null, no source says what the event is: say you do not know, call get_details, or leave it out of the main suggestions.
Not for planning a whole outing from a vague wish (plan_outing), court bookings (find_activity_slots) or the weather. Use get_details with a row's id for the full text and every link.
Example: {"from":"2026-11-28","query":"jazz","maxPricePerPerson":200,"fromTime":"18:00"}.`,
  find_activity_slots: `Find free times on bookable courts (wannasport): padel, tabletennis, badminton, squash, tennis, basketball. Returns courts with free start times, price per court and per person, and a booking link. Use it when the user wants to play a sport on a day ("padel Saturday afternoon"). The sport must be one from list_options.
Not for events (find_events) or an open question (plan_outing). The user books on the link; nothing is booked here.
Example: {"sport":"padel","date":"2026-11-28","from":"12:00","to":"18:00","players":4}.`,
  get_weather: `The DMI forecast for a day in Copenhagen: whether outdoor plans are fine (verdict dry, showers or wet), temperatures, wind, hour by hour. Use it when the user asks about the weather, or to decide indoor or outdoor when you build a plan yourself. About 10 days ahead only. Mention it to the user only when it matters (wet, showers, cold, windy, snow).
Not needed with plan_outing, which checks the weather itself.
Example: {"date":"2026-11-28","from":"17:00","to":"23:00"}.`,
  get_details: `Everything known about one item: the full stored description (up to 300 characters; nothing more is fetched), categories, audience, age, venue, address, price, every source's link and all start times or free court times. Use it when the user asks about one result ("tell me more about the second one", "where do I book?"), and when a row has description null, with the id from plan_outing, find_events or find_activity_slots. If the description is still missing, say you do not know what the event is and point to the link; never guess it from the title.
Ids are kept for about two hours after the tool returned them. For an unknown id, repeat the search first.
Example: {"id":"billetto:123456"}.`,
  send_feedback: `Report a bug, an idea or something missing about these tools: it becomes a GitHub issue, or a comment on an issue that already covers the case.
Use it when the user wants to report a problem or suggest something. FIRST show the user the draft (title and text) and ask whether to send it. Call only after a yes, with approved: true.
The issue is PUBLIC on GitHub. Leave out names, e-mail addresses, phone numbers, addresses, tokens and the user's personal link. Describe the request in general terms ("a 17-year-old, Saturday evening, active"), not with identifying details. Text with an e-mail address, a phone number, a long token-like string or a link containing /mcp/ is refused.
The result has an action. "created": a new issue was opened; give the user its issueUrl. "commented": the case was already reported and this was added to that issue. "already_noted": the user's report is already on it; nothing was sent. "possible_duplicate": nothing was sent; ask the user whether it is the same case as one of the candidates, never decide yourself. If yes, call again with the same text and existing_issue set to its number; if it is a new case, call again with force_new: true.
Example: {"kind":"bug","title":"Padel search returns no courts on Saturday","what_happened":"Asked for padel for four on Saturday afternoon; find_activity_slots returned an empty list although courts were free.","tool":"find_activity_slots","approved":true}.`,
  list_options: `The values the other tools accept: sports, moods, audiences, category and genre names, and brugbyen's districts. Use it before filtering by category or district or when the user asks what is possible. Takes no input; the answer changes rarely.
Example: {}.`,
};

export function registerTools(server: McpServer, ctx: { link: string; limiter: Limiter; deps: ToolDeps; feedback?: Feedback; log?: Log; now?: () => number }): void {
  const run =
    <A extends unknown[]>(name: string, fn: (...args: A) => CallToolResult | Promise<CallToolResult>) =>
    async (...args: A): Promise<CallToolResult> => {
      const r = ctx.limiter.take(ctx.link);
      if (!r.ok) return toolError(limitMessage(r, (ctx.now ?? Date.now)()));
      const started = Date.now();
      let res: CallToolResult;
      try {
        res = await fn(...args);
      } catch (e) {
        if (e instanceof ToolInputError) res = toolError(e.message);
        else {
          ctx.log?.("tool_error", { link: ctx.link, tool: name, error: String((e as Error)?.message ?? e).slice(0, 300) });
          res = toolError("The tool failed internally. Try again in a moment; if it keeps failing, tell the user.");
        }
      }
      ctx.log?.("tool", { link: ctx.link, tool: name, ms: Date.now() - started, ...(res.isError ? { error: true } : {}) });
      return res;
    };
  const d = ctx.deps;
  const feedback = ctx.feedback ?? createFeedback({ github: null, log: ctx.log });

  server.registerTool("plan_outing", { title: "Plan an outing", description: DESCRIPTIONS.plan_outing, inputSchema: planOutingInput, outputSchema: planOutingOutput, annotations }, run("plan_outing", (a) => planOutingTool(d, a)));
  server.registerTool("find_events", { title: "Find events", description: DESCRIPTIONS.find_events, inputSchema: findEventsInput, outputSchema: findEventsOutput, annotations }, run("find_events", (a) => findEvents(d, a)));
  server.registerTool("find_activity_slots", { title: "Find court times", description: DESCRIPTIONS.find_activity_slots, inputSchema: findSlotsInput, outputSchema: findSlotsOutput, annotations }, run("find_activity_slots", (a) => findSlots(d, a)));
  server.registerTool("get_weather", { title: "Weather forecast", description: DESCRIPTIONS.get_weather, inputSchema: getWeatherInput, outputSchema: getWeatherOutput, annotations }, run("get_weather", (a) => getWeather(d, a)));
  server.registerTool("get_details", { title: "Details of one item", description: DESCRIPTIONS.get_details, inputSchema: getDetailsInput, outputSchema: getDetailsOutput, annotations }, run("get_details", (a) => getDetails(d, a)));
  server.registerTool("list_options", { title: "Valid options", description: DESCRIPTIONS.list_options, outputSchema: listOptionsOutput, annotations }, run("list_options", () => listOptions(d)));
  server.registerTool("send_feedback", { title: "Send feedback", description: DESCRIPTIONS.send_feedback, inputSchema: feedbackInput, outputSchema: feedbackOutput, annotations: feedbackAnnotations }, run("send_feedback", (a: FeedbackInput) => feedback.send(ctx.link, a)));
}
