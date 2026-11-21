// plan_outing: the planner behind one tool. A brief that lacks an age or a "what" is answered with a
// question before anything is fetched; otherwise the day comes from the cache and the planner shortlists.
import { z } from "zod";
import { mergeItems } from "../../planner/merge";
import { needsInput, planOuting, shownIds } from "../../planner/plan";
import { MOODS } from "../../planner/types";
import type { Brief } from "../../planner/types";
import { clock, copenhagenToday, isoDate, notPast, notesField, ok, sourcesField, type ToolDeps } from "./common";
import { loadDaysFor } from "./days";

export const planOutingInput = {
  brief: z.object({
    people: z.array(z.object({
      label: z.string().max(40).optional().describe("A name or role, e.g. 'mig', 'lillebror'."),
      age: z.number().int().min(0, "age must be 0 or more").max(120, "age must be at most 120").optional().describe("Age in years. Leave out when unknown: the answer will ask."),
    })).max(12).describe("Everyone who goes, the user included. [] when you do not know yet."),
    date: isoDate("date").optional().describe("YYYY-MM-DD. Default: today."),
    from: clock("from").optional().describe("Earliest start, HH:MM."),
    to: clock("to").optional().describe("Latest end, HH:MM."),
    mood: z.array(z.enum(MOODS as unknown as [string, ...string[]])).max(7).optional().describe("The kind of outing: active, culture, social, calm, food, gaming, nightlife."),
    wishes: z.string().max(200).optional().describe("Free words for a kind of thing or a title, e.g. 'jazz', 'padel', 'stand-up'."),
    budgetPerPerson: z.number().min(0, "budgetPerPerson must be 0 or more").optional().describe("DKK per person; 0 means free only."),
    indoorOnly: z.boolean().optional(),
    area: z.string().max(40).optional().describe("'cph' (default) or a district word the venue or address must contain."),
    excludeIds: z.array(z.string().max(300)).max(200).optional().describe("Ids already shown (from `ids` of earlier suggestions), to get others."),
  }).describe("What the user wants. Fill in only what the user said; the answer asks for the rest."),
};

const item = z.object({ time: z.string(), title: z.string(), place: z.string(), price: z.string(), url: z.string().nullable(), sources: z.array(z.string()), ids: z.array(z.string()).describe("For get_details and excludeIds.") });
const suggestion = z.object({ kind: z.string(), title: z.string(), why: z.array(z.string()), items: z.array(item) });

export const planOutingOutput = {
  status: z.enum(["needs_input", "ok"]).describe("needs_input: ask the user `ask`, then call again. ok: a shortlist."),
  missing: z.array(z.string()).optional().describe("needs_input: what is missing, e.g. people[1].age, mood."),
  ask: z.string().optional().describe("needs_input: the question for the user, in Danish. Pass it on as it is."),
  options: z.object({ age: z.array(z.string()).optional(), mood: z.array(z.string()).optional() }).optional().describe("needs_input: answers to offer."),
  weather: z.string().nullable().optional().describe("A Danish weather line, present only when the weather matters (wet, showers, cold, windy, snow). null: say nothing about the weather."),
  best: suggestion.nullable().optional().describe("The best bet, or null when nothing with a start time fits."),
  alternatives: z.array(suggestion).optional().describe("Two to four, of different kinds."),
  plan: z.array(z.string()).optional().describe("A simple order for the day, when it helps."),
  assumptions: z.array(z.string()).optional().describe("What was assumed or left out: tell the user."),
  more: z.record(z.string(), z.number()).optional().describe("Counts of what else matched, by kind."),
  next: z.array(z.object({ label: z.string(), patch: z.record(z.string(), z.unknown()).describe("Merge into the brief (null deletes a key) and call plan_outing again.") })).optional().describe("Refinements to offer, each one call away."),
  stats: z.object({ candidates: z.number(), dropped: z.record(z.string(), z.number()), mergedAway: z.number() }).optional(),
  sources: sourcesField,
  notes: notesField,
};

export async function planOutingTool(deps: ToolDeps, a: { brief: unknown }) {
  const brief = a.brief as Brief;
  const today = (deps.today ?? copenhagenToday)();
  if (brief.date) notPast(brief.date, today, "brief.date");
  const date = brief.date ?? today;

  const ask = needsInput(brief);
  if (ask) {
    // Nothing is fetched; the weather is warmed so the next call is quick.
    if (brief.date) void deps.cache.getDays(["dmi"], [date]).catch(() => {});
    return ok({ ...ask, sources: [], notes: [] });
  }

  const loaded = await loadDaysFor(deps.cache, [date]);
  const result = planOuting(brief, loaded.days);
  if (result.status === "ok") {
    const shown = new Set(shownIds(result));
    const rows = loaded.days.items.filter((i) => i.date === date);
    deps.index.remember(mergeItems(rows).filter((m) => m.ids.some((id) => shown.has(id))), rows);
  }
  return ok({ ...result, sources: loaded.sources, notes: loaded.notes });
}
