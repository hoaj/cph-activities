import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Server instructions, written for the model that connects. ChatGPT reads the first 512 characters,
// Claude Code up to 4,096: the opening stands alone, the rest adds the detail.
export const INSTRUCTIONS = `cph-activities finds things to do in Copenhagen (Københavns and Frederiksberg Kommune): events, bookable courts and the weather. For an open question call plan_outing; if it answers needs_input, ask the user its question first, then call again. Show 3-5 suggestions with a reason each, and mention the weather only when it matters. Nothing is booked or bought here: the user does that through the link in each result.

Work in four steps: brief, fetch, shortlist, answer.

1. Brief. Collect who goes (with ages), the day, the kind of outing (mood: active, culture, social, calm, food, gaming, nightlife), budget and constraints from what the user already said. plan_outing needs every age and a "what" (a mood or a wish). If one is missing it returns status "needs_input" with a Danish question in "ask": put that question to the user as it stands, then call plan_outing again with the answer in the brief. Do not guess ages.

2. Fetch. Prefer plan_outing for open questions: it fetches, merges duplicates and applies the age, budget and weather rules. Use find_events to browse one kind of thing ("jazz Friday under 200 kr."), find_activity_slots for court times (padel, badminton, ...), get_weather for the forecast alone, get_details for one result's full text and every link, list_options for valid sports, categories and districts. Run independent calls together.

3. Shortlist. Show at most 3-5 suggestions: a best bet and alternatives of different kinds, each with a reason from its "why". Read each event's description, categories and age before suggesting it, and drop those that do not fit; when "description" is null, say you do not know what it is, or call get_details; never guess from the title. brugbyen events never have a description in a list: call get_details on the 2-3 you are about to suggest and it fetches it. To refine, merge a patch from "next" into the brief and call plan_outing again; pass "excludeIds" to see others.

4. Answer. Give the best bet first: what, when, where, price, link, why it fits them. Then the alternatives, a short plan for the day when it helps, and what was assumed (see "assumptions"). End with one offer to go further. Reply in the user's language.

Weather. It is checked for you whenever a date is given. Mention it only when it matters: a "weather" line is present only then (rain, showers, cold, wind, snow, or when it moved plans indoors). When "weather" is null, say nothing about it.

Sources. Every result lists "sources" with status fresh, stale, capped or missing. Tell the user when a source is missing or stale ("Billetto is not available right now") and answer from the rest. "notes" holds what to pass on.

Prices and times. Write "pris ikke oplyst" when a price is missing and "tid: se siden" when there is no start time. Never invent times, prices or links; use what the results contain. Ids belong to one result set and expire after about two hours.

Feedback. To report a problem or an idea, use send_feedback after the user approves the text.`;

// The longer guide behind the MCP prompt "plan_a_day": the rules the tools encode, for a model that wants them spelled out.
export const PLAN_A_DAY_GUIDE = `${INSTRUCTIONS}

The rules plan_outing applies, so you can explain a result or plan by hand with find_events:
- Age: nothing 18+ (club nights, bars) when someone is under 18; children's events are left out for teenagers; for children under 10 only events made for them, none after 19:00. When someone under 18 wants nightlife, late concerts, comedy and theatre from about 19:00 replace clubs and bars, and the answer says why.
- Budget: per person. A court's price is split between the players (at least two). Budget 0 means free only; where a source gives no price (KultuNaut, brugbyen, most of Absalon) the item stays and says "pris ikke oplyst".
- Weather: outdoor items only when the weather allows. Rain moves them indoors; showers rank them lower; cold, wind and snow move anything long outdoors, even on a dry day.
- Time: events with no start time are never the best bet alone and have no fixed slot in a plan.
- Duplicates: the same event listed by several sources is one suggestion with every link; Billetto's link leads.
- Threads: a festival, venue or theme that several sources point to on one day is one suggestion with its best two to four events.
- No source for bowling: point to https://www.easybowl.com/bc/dgi/booking.

Ask the user for what is missing before you search; at most two questions, each with two to four options.`;

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "plan_a_day",
    {
      title: "Plan a day in Copenhagen",
      description: "The full guide for planning a day or an evening in Copenhagen with this server's tools.",
      argsSchema: { request: z.string().max(500).optional().describe("What the user asked, in their words.") },
    },
    ({ request }) => ({ messages: [{ role: "user", content: { type: "text", text: PLAN_A_DAY_GUIDE + (request ? `\n\nThe user asks: ${request}` : "") } }] }),
  );
}
