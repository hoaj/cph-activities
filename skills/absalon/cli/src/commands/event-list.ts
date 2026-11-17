import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listCalendar from "../operations/listCalendar";
import { CATEGORY_NAMES, resolveCategories, selectEvents } from "../lib/events";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export default defineCommand({
  name: "event list",
  summary: "What is on at Folkehuset Absalon (Vesterbro) on a day or period: dinners, dance, yoga, workshops, parties and more, with a link to each event",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: the same as --from)"),
    category: z.array(z.string()).optional().describe("category slug or Danish name from `category list` (any case); repeat or comma-separate for several"),
    excludeKids: z.boolean().default(false).describe("leave out events in the category Børn & familie"),
    free: z.boolean().default(false).describe("only events whose text says they are free"),
    fromTime: hhmm.optional().describe("only events starting at or after HH:MM"),
    toTime: hhmm.optional().describe("only events starting at or before HH:MM"),
    query: z.string().optional().describe("words to find in the title or description"),
    limit: z.coerce.number().int().min(1).max(300).default(40).describe("most events to return (default 40)"),
  }),
  uses: [listCalendar],
  run: async (args, { call }) => {
    const from = args.from ?? today();
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    let categories: string[] | undefined;
    if (args.category?.length) {
      const r = resolveCategories(args.category);
      if ("unknown" in r) inputFailure(`Unknown category ${r.unknown.join(", ")}. Use one of: ${Object.values(CATEGORY_NAMES).join(", ")}.`);
      categories = r.slugs;
    }
    const { events } = await call(listCalendar, {});
    return {
      ...selectEvents(events, { from, to, categories, excludeKids: args.excludeKids, free: args.free, fromTime: args.fromTime, toTime: args.toTime, query: args.query, limit: args.limit }),
      complete: true,
    };
  },
});
