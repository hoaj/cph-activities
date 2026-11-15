import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listCategories from "../operations/listCategories";
import searchProducts from "../operations/searchProducts";
import { apiDate, bookingUrl, clock, kroner } from "../lib/links";
import { areaAt } from "../lib/cph-boundary";

const MAX_PAGES = 5;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export default defineCommand({
  name: "slot search",
  summary: "Free times for a sport (padel, tennis, badminton, squash, swimming …) at venues in Københavns and Frederiksberg Kommune on one day, nearest first, with price and a link to book it yourself",
  args: z.object({
    sport: z.string().min(1).describe("sport slug or Danish name from `sport list`, e.g. padel, tennis, badminton, fodbold"),
    date: isoDate.optional().describe("the day, YYYY-MM-DD (default: today)"),
    from: hhmm.optional().describe("earliest start time, HH:MM"),
    to: hhmm.optional().describe("latest start time, HH:MM"),
    radiusKm: z.coerce.number().int().min(1).max(50).default(10).describe("search radius from central Copenhagen in km (default 10)"),
    includeOutside: z.boolean().default(false).describe("also venues outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Gentofte, Hvidovre, Tårnby …"),
    limit: z.coerce.number().int().min(1).max(100).default(20).describe("most venues to return, nearest first (default 20)"),
  }),
  uses: [listCategories, searchProducts],
  run: async (args, { call }) => {
    const sports = await call(listCategories, {});
    const wanted = args.sport.trim().toLowerCase();
    const sport = sports.find((s) => s.slug.toLowerCase() === wanted || s.name.trim().toLowerCase() === wanted);
    if (!sport) inputFailure(`No sport "${args.sport}". --sport takes one of: ${sports.map((s) => s.slug).join(", ")}.`);
    if (args.from && args.to && args.to < args.from) inputFailure("--to is before --from.");
    const date = args.date ?? today();

    const venues = [];
    let complete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await call(searchProducts, {
        area: "koebenhavn",
        category: sport!.slug,
        distance: String(args.radiusKm * 1000),
        date: apiDate(date),
        time: "0",
        page: String(page),
      });
      for (const f of r.facilities) {
        const courts = f.productGroups
          .flatMap((g) => g.products)
          .map((p) => {
            const times = [...new Set((p.timeSpans ?? []).filter((t) => t.time.startsWith(date)).map((t) => clock(t.time)))]
              .filter((t): t is string => t !== null)
              .filter((t) => (!args.from || t >= args.from) && (!args.to || t <= args.to))
              .sort();
            return {
              name: p.name.trim(),
              type: p.type ?? null,
              priceMinDKK: kroner(p.rangePriceMin),
              priceMaxDKK: kroner(p.rangePriceMax),
              times,
              url: bookingUrl(f.slug, p.slug),
            };
          })
          .filter((c) => c.times.length > 0);
        const area = f.coordinates ? areaAt(f.coordinates.lng, f.coordinates.lat) : "unknown";
        if (!args.includeOutside && area === "outside") continue;
        if (courts.length > 0) venues.push({ venue: f.name.trim(), distanceKm: f.distance ?? null, area, courts });
      }
      if (r.isLast || page >= r.totalPages) {
        complete = true;
        break;
      }
    }
    venues.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    // complete is false when wannasport had more result pages than this command reads.
    return { sport: sport!.name, date, total: venues.length, complete, venues: venues.slice(0, args.limit) };
  },
});
