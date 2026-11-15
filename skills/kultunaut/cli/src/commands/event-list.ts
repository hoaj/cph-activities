import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listEvents from "../operations/listEvents";
import site from "../site";
import { parseWhen } from "../lib/when";

const AREA = "Kbh. og Frederiksberg"; // Copenhagen here means Københavns + Frederiksberg Kommune
const PAGE_SIZE = 12;
const MAX_PAGES = 20;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const kn = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(0, 4)}`;

export default defineCommand({
  name: "event list",
  summary: "Everything on in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period from KultuNaut, the broadest calendar, with a link to each event's page; no prices",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: --from)"),
    genre: z.string().optional().describe("one genre from `genre list` (any case), e.g. musik, jazz, teater"),
    fromTime: clock.optional().describe("earliest start time, HH:MM; events with no start time are left out"),
    toTime: clock.optional().describe("latest start time, HH:MM; events with no start time are left out"),
    includeOngoing: z.boolean().default(false).describe("also exhibitions and courses that started before --from"),
    limit: z.coerce.number().int().min(1).max(200).default(40).describe("most events to return (default 40)"),
  }),
  uses: [listEvents],
  run: async (args, { call, note }) => {
    const from = args.from ?? today();
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");
    const timed = args.fromTime !== undefined || args.toTime !== undefined;
    const base = { Area: AREA, ArrStartdato: kn(from), ArrSlutdato: kn(to) };

    let genre: string | undefined;
    const events: Record<string, unknown>[] = [];
    let complete = false;
    if (args.genre !== undefined) {
      // The genre select is on the page only without a Genre filter: read the names from an unfiltered page.
      const known = (await call(listEvents, { ...base, startnr: "1" })).genres.filter((g) => g.trim() !== "");
      genre = known.find((g) => g.toLowerCase() === args.genre!.toLowerCase());
      if (!genre) inputFailure(`Unknown --genre "${args.genre}". Genres: ${known.join(", ")}.`);
    }
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await call(listEvents, { ...base, ...(genre ? { Genre: genre } : {}), startnr: String(page * PAGE_SIZE + 1) });
      for (const e of r.events) {
        const w = parseWhen(e.when, e.venue);
        const ongoing = w.multiDay && w.startDate !== null && w.startDate < from;
        if (ongoing && !args.includeOngoing) continue;
        if (timed) {
          if (!w.startTime) continue;
          if (args.fromTime && w.startTime < args.fromTime) continue;
          if (args.toTime && w.startTime > args.toTime) continue;
        }
        events.push({
          id: e.id,
          title: e.title,
          description: e.description,
          genre: e.genre,
          when: e.when,
          date: w.startDate,
          endDate: w.endDate,
          time: w.startTime,
          endTime: w.endTime,
          venue: e.venue,
          area: "cph",
          ongoing,
          url: new URL(e.url, site.origin).toString(),
        });
      }
      if (r.events.length < PAGE_SIZE) {
        complete = true;
        break;
      }
      if (events.length >= args.limit) break;
      if (page > 0 && page % 5 === 0) note(`read ${page + 1} pages, ${events.length} matches so far`);
    }
    return { total: events.length, complete, events: events.slice(0, args.limit) };
  },
});
