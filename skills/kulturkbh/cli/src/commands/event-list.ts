import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listEvents from "../operations/listEvents";
import site from "../site";
import { absoluteUrl, areaOf, isFree, postcodeOf } from "../lib/events";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export default defineCommand({
  name: "event list",
  summary: "Free and cheap culture events in Copenhagen from kulturKBH, with a link to each event's own page",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: no limit)"),
    type: z.string().optional().describe("category, e.g. musik, foredrag, udstilling, film, teater, litteratur, mad, active"),
    query: z.string().optional().describe("words to find in the title or description"),
    free: z.boolean().default(false).describe("only events whose price says they are free"),
    includeOutside: z.boolean().default(false).describe("also events outside Københavns Kommune (Frederiksberg, Louisiana …)"),
    limit: z.coerce.number().int().min(1).max(500).default(50).describe("most events to return (default 50)"),
  }),
  uses: [listEvents],
  run: async (args, { call }) => {
    const from = args.from ?? today();
    if (args.to && args.to < from) inputFailure("--to is before --from.");
    const words = args.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];

    const rows = await call(listEvents, { v: String(Date.now()) });
    const events = rows
      .map((e) => {
        const postcode = postcodeOf(e.addr, e.location);
        return {
          date: e.date,
          time: e.t || null,
          type: e.type,
          title: e.title,
          description: e.desc ?? null,
          venue: e.location || null,
          source: e.src,
          address: e.addr || null,
          postcode,
          area: areaOf(postcode),
          price: e.price ?? null,
          free: isFree(e.price),
          url: absoluteUrl(e.url, site.origin),
        };
      })
      .filter((e) => e.date >= from && (!args.to || e.date <= args.to))
      .filter((e) => !args.type || e.type.toLowerCase() === args.type.toLowerCase())
      .filter((e) => !args.free || e.free === true)
      .filter((e) => args.includeOutside || e.area !== "outside")
      .filter((e) => {
        const text = `${e.title} ${e.description ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));

    return { total: events.length, events: events.slice(0, args.limit) };
  },
});
