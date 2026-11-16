import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listEvents from "../operations/listEvents";
import site from "../site";
import { filtersOf, resolve, type Option } from "../lib/filters";
import { otherDates, parseDateText, totalOf } from "../lib/when";

const PAGE_SIZE = 21;
const MAX_PAGES = 10;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const list = (o: Option[]) => o.map((x) => x.name).join(", ");

export default defineCommand({
  name: "event list",
  summary:
    "What is on at Københavns Kommune's own culture houses, libraries and halls (brugbyen.kk.dk) on a day or period, optionally only free, for an audience, category or district, with a link to each event's page; no prices. A recurring event shows its first upcoming date (`shownDate`, with `otherDates` > 0), which can be another day than the one searched: it occurs in the searched period by brugbyen's own filter",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: --from)"),
    category: z.array(z.string()).optional().describe("category name or id from `filter list` (any case); repeat or comma-separate for several"),
    group: z.array(z.string()).optional().describe("audience: børn (kids), unge (youth), voksne (adults), seniorer (seniors); repeat or comma-separate for several"),
    district: z.array(z.string()).optional().describe("district name or id from `filter list` (any case); repeat or comma-separate for several"),
    free: z.boolean().default(false).describe("only free events"),
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
    const base = { from, to, ...(args.free ? { free: "1" as const } : {}) };

    let requests = 0;
    const fetchPage = (page: number, ids: { categories?: string[]; groups?: string[]; districts?: string[] }) => {
      requests++;
      return call(listEvents, { ...base, ...ids, page: String(page) });
    };

    // The filter lists are on every page: read them from the first page when a name must be resolved,
    // which is then a search on the dates only.
    const asked = [args.category, args.group, args.district].some((v) => v !== undefined && v.length > 0);
    const ids: { categories?: string[]; groups?: string[]; districts?: string[] } = {};
    if (asked) {
      const filters = filtersOf(await fetchPage(0, {}));
      const kinds: Array<[string, string[] | undefined, Option[], boolean, "categories" | "groups" | "districts"]> = [
        ["--category", args.category, filters.categories, false, "categories"],
        ["--group", args.group, filters.groups, true, "groups"],
        ["--district", args.district, filters.districts, false, "districts"],
      ];
      for (const [flag, values, options, aliases, key] of kinds) {
        if (!values || values.length === 0) continue;
        const r = resolve(values, options, aliases);
        if (r.unknown.length > 0) inputFailure(`Unknown ${flag} "${r.unknown.join('", "')}". Options: ${list(options)}.`);
        ids[key] = r.ids;
      }
    }

    const events: Record<string, unknown>[] = [];
    let complete = false;
    let total: number | null = null;
    let seen = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await fetchPage(page, ids);
      if (page === 0) total = totalOf(r.resume);
      seen += r.events.length;
      for (const e of r.events) {
        const d = parseDateText(e.dateText);
        const ongoing = d.endDate !== null && d.startDate !== null && d.endDate !== d.startDate && d.startDate < from;
        if (ongoing && !args.includeOngoing) continue;
        if (timed) {
          if (!d.startTime) continue;
          if (args.fromTime && d.startTime < args.fromTime) continue;
          if (args.toTime && d.startTime > args.toTime) continue;
        }
        events.push({
          id: e.id,
          title: e.title,
          venue: e.venue,
          ribbon: e.ribbon || null,
          dateText: e.dateText,
          shownDate: d.startDate,
          endDate: d.endDate,
          time: d.startTime,
          endTime: d.endTime,
          otherDates: otherDates(e.dates),
          ongoing,
          area: "cph",
          url: new URL(e.href, site.origin).toString(),
        });
      }
      if (r.events.length < PAGE_SIZE || (total !== null && seen >= total)) {
        complete = true;
        break;
      }
      if (events.length >= args.limit) break;
    }
    note(`${requests} requests`);
    const key = (e: Record<string, unknown>) => `${e.shownDate ?? "9999-99-99"} ${e.time ?? "99:99"}`;
    events.sort((a, b) => key(a).localeCompare(key(b)));
    return { total: total ?? events.length, complete, events: events.slice(0, args.limit) };
  },
});
