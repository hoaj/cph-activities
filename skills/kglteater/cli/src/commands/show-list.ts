import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import getShowPage from "../operations/getShowPage";
import listActivities from "../operations/listActivities";
import listFilters from "../operations/listFilters";
import { fitsAge, isGuidedTour, isRealDate, isSchoolOnly, resolveNames, showPathParts, splitNames, toRow, withDetails, type Row } from "../lib/shows";

// The page size the site's own calendar asks for.
const PAGE_SIZE = 25;
const MAX_PAGES = 12;
// Show pages are read one at a time, and at most this many per run, to keep the traffic light.
const MAX_SHOW_PAGES = 10;
const API_VERSION = "20261012";
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").refine(isRealDate, "no such date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export default defineCommand({
  name: "show list",
  summary:
    "Opera, ballet, plays, concerts and more at Det Kongelige Teater on a day or period, soonest first, with the cheapest price, availability and a link to the performance on kglteater.dk",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: the same as --from)"),
    genre: z.array(z.string()).optional().describe("genre from `genre list`, e.g. opera, ballet, skuespil, koncert (part of a name is enough); repeat or comma-separate for several"),
    stage: z.array(z.string()).optional().describe("stage from `stage list`, e.g. Operaen, Gamle Scene, Skuespilhuset; repeat or comma-separate for several"),
    maxPrice: z.coerce.number().min(0).optional().describe("keep performances whose cheapest ticket (`priceMinDKK`) is at most this many kroner"),
    free: z.boolean().default(false).describe("only free performances"),
    fromTime: hhmm.optional().describe("earliest start time, HH:MM"),
    toTime: hhmm.optional().describe("latest start time, HH:MM"),
    age: z.coerce.number().int().min(0).max(120).optional().describe("only productions suitable for someone this old (no stated age, or an age at most this); reads show pages like --details"),
    excludeKids: z.boolean().default(false).describe("leave out performances the site labels For børn"),
    query: z.string().optional().describe("words that must all be in the title"),
    details: z.boolean().default(false).describe(`also read each production's page for priceMaxDKK and ageFrom (at most ${MAX_SHOW_PAGES} productions a run)`),
    includeOutside: z.boolean().default(false).describe("also tours and places outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Dyrehaven, Moesgaard"),
    includeCancelled: z.boolean().default(false).describe("also cancelled performances"),
    limit: z.coerce.number().int().min(1).max(300).default(40).describe("most performances to return (default 40)"),
  }),
  uses: [listActivities, listFilters, getShowPage],
  run: async (args, { call }) => {
    const from = args.from ?? today();
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");

    const genres = splitNames(args.genre);
    const stages = splitNames(args.stage);
    let category: string[] | undefined;
    let location: string[] | undefined;
    if (genres.length || stages.length) {
      const filters = await call(listFilters, {});
      if (genres.length) {
        const r = resolveNames(genres, filters.genres);
        if ("unknown" in r) inputFailure(`Unknown genre ${r.unknown.join(", ")}. Use one of: ${filters.genres.map((g) => g.name).join(", ")}.`);
        category = r.ids;
      }
      if (stages.length) {
        const r = resolveNames(stages, filters.stages);
        if ("unknown" in r) inputFailure(`Unknown stage ${r.unknown.join(", ")}. Use one of: ${filters.stages.map((s) => s.name).join(", ")}.`);
        location = r.ids;
      }
    }
    // Naming a stage is asking for it, also when it is outside Copenhagen.
    const includeOutside = args.includeOutside || stages.length > 0;
    const words = (args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const wantPages = args.details || args.age != null;

    const rows: { row: Row; showId: number; showUrl: string }[] = [];
    let complete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await call(listActivities, {
        v: API_VERSION,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        culture: "da-dk",
        startDate: from,
        endDate: to,
        category,
        location,
        price: args.free ? "free" : undefined,
        showCancelled: "true",
      });
      for (const item of r.items) {
        if (isSchoolOnly(item)) continue;
        if (!category && isGuidedTour(item.category)) continue;
        const row = toRow(item);
        if (row.date < from || row.date > to) continue;
        if (row.availability === "cancelled" && !args.includeCancelled) continue;
        if (row.area === "outside" && !includeOutside) continue;
        if (args.free && !row.free) continue;
        if (args.maxPrice != null && !(row.priceMinDKK != null && row.priceMinDKK <= args.maxPrice)) continue;
        if (args.fromTime && row.time < args.fromTime) continue;
        if (args.toTime && row.time > args.toTime) continue;
        if (args.excludeKids && row.forChildren) continue;
        if (words.length && !words.every((w) => row.title.toLowerCase().includes(w))) continue;
        rows.push({ row, showId: item.showId, showUrl: item.showUrl });
      }
      if (!r.hasMore) {
        complete = true;
        break;
      }
      // The calendar is sorted by start, so the rows so far are the soonest. --age may still drop some.
      if (args.age == null && rows.length >= args.limit) break;
    }

    let shows = rows.map((r) => r.row);
    let showsWithoutDetails = 0;
    if (wantPages) {
      const pages = new Map<number, { priceText: string | null; ageText: string | null }>();
      const unread = new Set<number>();
      const out: Row[] = [];
      for (const { row, showId, showUrl } of rows) {
        if (out.length >= args.limit) {
          complete = false;
          break;
        }
        if (!pages.has(showId) && !unread.has(showId)) {
          const parts = showPathParts(showUrl);
          if (parts && pages.size < MAX_SHOW_PAGES) pages.set(showId, await call(getShowPage, parts));
          else unread.add(showId);
        }
        const details = pages.get(showId);
        const full = details ? withDetails(row, details) : row;
        if (args.age != null && !fitsAge(full.ageFrom, args.age)) continue;
        out.push(full);
      }
      shows = out;
      showsWithoutDetails = unread.size;
    }
    return {
      source: "Det Kongelige Teater (kglteater.dk)",
      total: shows.length,
      complete,
      ...(wantPages && { showsWithoutDetails }),
      shows: shows.slice(0, args.limit),
    };
  },
});
