// list_options: what the other tools accept.
import { z } from "zod";
import { notesField, ok, sourcesField, type ToolDeps } from "./common";
import { statusNotes } from "./days";

export const listOptionsOutput = {
  sports: z.array(z.string()).describe("Valid sport for find_activity_slots."),
  audiences: z.array(z.string()).describe("Audience groups: audienceAge in find_events picks one."),
  moods: z.array(z.string()).describe("Valid mood values for plan_outing."),
  categories: z.array(z.object({ name: z.string(), sources: z.array(z.string()) })).describe("Category and genre names the sources list. find_events matches `categories` against part of any source's own category names, so other words (music, film, teater) work too."),
  brugbyen: z.object({ categories: z.array(z.string()), districts: z.array(z.string()), groups: z.array(z.string()) }).describe("Municipal culture houses (brugbyen): districts and groups. Districts are words for plan_outing's area."),
  kultunaut: z.object({ genres: z.array(z.string()) }),
  sources: sourcesField,
  notes: notesField,
};

export async function listOptions(deps: ToolDeps) {
  const { data, sources } = await deps.options();
  return ok({ ...data, sources, notes: statusNotes(sources) });
}
