import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listEvents from "../operations/listEvents";
import site from "../site";
import { filtersOf, resolve, staticGroups, type Option } from "../lib/filters";
import { occurrence, otherDates, parseDateText, totalOf } from "../lib/when";

const PAGE_SIZE = 21;
const MAX_PAGES = 10;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const list = (o: Option[]) => o.map((x) => x.name).join(", ");

export default defineCommand({
  name: "event list",
  summary:
    "What is on at Københavns Kommune's own culture houses, libraries and halls (brugbyen.kk.dk) on a day or period, optionally only free, for an audience, category or district, with a link to each event's page; no prices and no descriptions (`event show --url <url>` reads one event's description). `date` is the day the event occurs within the search (on a one-day search always the searched day, by brugbyen's own filter; in a period `shownDate` when it lies in it, else null). A recurring event (`recurring`, `otherDates` > 0) shows its first upcoming date as `shownDate` and that date's time: `timeMayDiffer` says the time may be another day's",
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

    // Audience groups resolve from the fixed map. Category and district names (and a group the map does not know)
    // need the filter lists, which are on every page: read them from an unfiltered first page.
    const ids: { categories?: string[]; groups?: string[]; districts?: string[] } = {};
    const fixedGroups = args.group && args.group.length > 0 ? staticGroups(args.group) : null;
    if (fixedGroups) ids.groups = fixedGroups;
    const lookup: Array<[string, string[] | undefined, (f: ReturnType<typeof filtersOf>) => Option[], boolean, "categories" | "groups" | "districts"]> = [
      ["--category", args.category, (f) => f.categories, false, "categories"],
      ["--group", fixedGroups ? undefined : args.group, (f) => f.groups, true, "groups"],
      ["--district", args.district, (f) => f.districts, false, "districts"],
    ];
    if (lookup.some(([, v]) => v !== undefined && v.length > 0)) {
      const filters = filtersOf(await fetchPage(0, {}));
      for (const [flag, values, optionsOf, aliases, key] of lookup) {
        if (!values || values.length === 0) continue;
        const options = optionsOf(filters);
        const r = resolve(values, options, aliases);
        if (r.unknown.length > 0) inputFailure(`Unknown ${flag} "${r.unknown.join('", "')}". Options: ${list(options)}.`);
        ids[key] = r.ids;
      }
    }

    const events: Record<string, unknown>[] = [];
    let complete = false;
    let total: number | null = null;
    let seen = 0;
    // Page 0 gives the total; the other pages needed are then fetched together, in waves sized from
    // how many events of a page survive the filters on this side (time window, ongoing).
    let first: Awaited<ReturnType<typeof fetchPage>> | null = await fetchPage(0, ids);
    total = totalOf(first.resume);
    const lastPage = Math.min(MAX_PAGES, total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : MAX_PAGES) - 1;
    let next = 0;
    while (!complete && next < MAX_PAGES) {
      let wave: Array<Awaited<ReturnType<typeof fetchPage>>>;
      if (first) {
        wave = [first];
        first = null;
      } else {
        const kept = events.length;
        const rate = kept > 0 ? kept / seen : 0;
        const need = rate > 0 ? Math.ceil((args.limit - kept) / rate / PAGE_SIZE) : MAX_PAGES;
        const count = Math.max(1, Math.min(need, lastPage - next + 1));
        wave = await Promise.all(Array.from({ length: count }, (_, i) => fetchPage(next + i, ids)));
      }
      const firstIndex = next;
      next += wave.length;
      for (const [i, r] of wave.entries()) {
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
          const others = otherDates(e.dates);
          events.push({
            id: e.id,
            title: e.title,
            venue: e.venue,
            ribbon: e.ribbon || null,
            dateText: e.dateText,
            date: occurrence({ from, to, shownDate: d.startDate, otherDates: others }).date,
            shownDate: d.startDate,
            endDate: d.endDate,
            time: d.startTime,
            endTime: d.endTime,
            otherDates: others,
            recurring: others > 0,
            timeMayDiffer: occurrence({ from, to, shownDate: d.startDate, otherDates: others }).timeMayDiffer,
            ongoing,
            area: "cph",
            url: new URL(e.href, site.origin).toString(),
          });
        }
        // A page can hold fewer than PAGE_SIZE events without being the last (text-only items are
        // left out), so stop on the last page by total, an empty page, or everything seen.
        if (r.events.length === 0 || firstIndex + i >= lastPage || (total !== null && seen >= total)) {
          complete = true;
          break;
        }
      }
      if (events.length >= args.limit) break;
    }
    note(`${requests} requests`);
    const key = (e: Record<string, unknown>) => `${e.date ?? e.shownDate ?? "9999-99-99"} ${e.time ?? "99:99"}`;
    events.sort((a, b) => key(a).localeCompare(key(b)));
    return { total: total ?? events.length, complete, events: events.slice(0, args.limit) };
  },
});
