import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import searchEvents from "../operations/searchEvents";
import { areaOf, dayBoundary } from "../lib/area";

const CPH_CENTER = "55.6761,12.5683"; // Rådhuspladsen
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const PLACEHOLDER_AFTER_S = 3 * 365 * 24 * 3600; // listings dated years ahead are memberships and tests, not events
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

/** Unix seconds as local Copenhagen time, `YYYY-MM-DDTHH:MM`. Billetto's own starts_at is display text. */
const localTime = (unix: number | null | undefined): string | null =>
  unix == null ? null : new Date(unix * 1000).toLocaleString("sv-SE", { timeZone: "Europe/Copenhagen" }).slice(0, 16).replace(" ", "T");

const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

export default defineCommand({
  name: "event search",
  summary: "Events on Billetto around Copenhagen (small venues, culture houses, clubs, talks, workshops), soonest first, with a link to each event's page to buy tickets",
  args: z.object({
    query: z.string().default("").describe("words to search for (default: everything)"),
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: no limit)"),
    category: z.string().optional().describe("Billetto category or subcategory, as printed in `category`/`subcategory` (e.g. music, rock, science)"),
    free: z.boolean().default(false).describe("only free events (price 0)"),
    includeOutside: z.boolean().default(false).describe("also events whose postcode is outside Københavns Kommune (Frederiksberg, suburbs)"),
    radiusKm: z.coerce.number().min(1).max(50).default(10).describe("search radius around the city centre in km (default 10)"),
    limit: z.coerce.number().int().min(1).max(500).default(50).describe("most events to return (default 50)"),
  }),
  uses: [searchEvents],
  run: async (args, { call }) => {
    const from = args.from ?? today();
    if (args.to && args.to < from) inputFailure("--to is before --from.");
    const fromStart = dayBoundary(from, false);
    const range = [`end_time >= ${fromStart}`];
    if (args.to) range.push(`start_time < ${dayBoundary(args.to, true)}`);
    const latest = Math.floor(Date.now() / 1000) + PLACEHOLDER_AFTER_S;
    const wanted = args.category?.toLowerCase();

    // Algolia ranks by relevance, so read every result page (up to MAX_PAGES), then sort by time.
    const matches: Array<{ start: number; ongoing: boolean; event: Record<string, unknown> }> = [];
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await call(searchEvents, {
        query: args.query,
        hitsPerPage: PAGE_SIZE,
        page,
        aroundLatLng: CPH_CENTER,
        aroundRadius: Math.round(args.radiusKm * 1000),
        filters: range.join(" AND "),
      });
      for (const h of r.hits) {
        if (h.start_time != null && h.start_time > latest) continue;
        const postcode = h.postal_code == null || h.postal_code === "" ? null : String(h.postal_code);
        const area = areaOf(postcode);
        const free = h.price == null ? null : h.price === 0;
        if (!args.includeOutside && area === "outside") continue;
        if (args.free && free !== true) continue;
        if (wanted && h.category?.toLowerCase() !== wanted && h.subcategory?.toLowerCase() !== wanted) continue;
        const ongoing = h.start_time != null && h.start_time < fromStart;
        matches.push({
          start: h.start_time ?? Number.MAX_SAFE_INTEGER,
          ongoing,
          event: {
            ongoing,
            id: String(h.id),
            title: h.name.trim(),
            description: orNull(h.short_description),
            startsAt: localTime(h.start_time),
            endsAt: localTime(h.end_time),
            venue: orNull(h.venue_name),
            address: orNull(h.location),
            city: orNull(h.city),
            postcode,
            area,
            price: h.price ?? null,
            priceRange: orNull(h.price_range),
            currency: orNull(h.currency),
            free,
            category: orNull(h.category),
            subcategory: orNull(h.subcategory),
            onSale: h.on_sale ?? null,
            url: h.url,
          },
        });
      }
      if (page + 1 >= r.nbPages) {
        complete = true;
        break;
      }
    }
    // Events that start in the range come first, soonest first; ones already running (season
    // passes, courses, exhibitions that began before --from) follow.
    matches.sort((a, b) => Number(a.ongoing) - Number(b.ongoing) || a.start - b.start);
    // complete is false when there were more result pages than this command reads.
    return { total: matches.length, complete, events: matches.slice(0, args.limit).map((m) => m.event) };
  },
});
