import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listEvents from "../operations/listEvents";
import { isRealDate, selectEvents } from "../lib/events";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").refine(isRealDate, "no such date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export default defineCommand({
  name: "event list",
  summary:
    "Upcoming club nights at Hangaren (Refshaleøen, Copenhagen) on a day or period, soonest first, with start and end time, line-up, entry price and age limit when the page states them, and links to the event and its ticket seller",
  args: z.object({
    from: isoDate.optional().describe("first date a night starts on, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date a night starts on, YYYY-MM-DD (default: the same as --from)"),
    fromTime: hhmm.optional().describe("only nights starting at or after HH:MM"),
    toTime: hhmm.optional().describe("only nights starting at or before HH:MM"),
    maxPrice: z.coerce.number().min(0).optional().describe("keep nights whose cheapest stated ticket (`priceMinDKK`) is at most this many kroner; nights with no stated price are left out"),
    free: z.boolean().default(false).describe("only nights the page states are free"),
    query: z.string().optional().describe("words that must all be in the title or the artists (any case, accents ignored)"),
    includeCancelled: z.boolean().default(false).describe("also nights the page marks as cancelled or postponed"),
    limit: z.coerce.number().int().min(1).max(300).default(40).describe("most nights to return (default 40)"),
  }),
  uses: [listEvents],
  run: async (args, { call }) => {
    const now = today();
    const from = args.from ?? now;
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");
    const { cards } = await call(listEvents, {});
    return selectEvents(cards, {
      today: now,
      from,
      to,
      fromTime: args.fromTime,
      toTime: args.toTime,
      maxPrice: args.maxPrice,
      free: args.free,
      query: args.query,
      includeCancelled: args.includeCancelled,
      limit: args.limit,
    });
  },
});
