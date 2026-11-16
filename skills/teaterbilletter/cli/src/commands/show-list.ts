import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listCategories from "../operations/listCategories";
import listEvents from "../operations/listEvents";
import { bookingUrl, fitsAge, matchesCategory, isCopenhagen, localDate, localTime, pageUrl } from "../lib/shows";

// 356 productions over 8 pages of 50 at the time of writing; the site has no date filter, so a run reads every page.
const PAGE_SIZE = 50;
const MAX_PAGES = 12;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

export default defineCommand({
  name: "show list",
  summary:
    "Theatre, revue, stand-up, musicals, opera, ballet and children's theatre in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period, soonest first, with price, age limit and a link to buy tickets yourself",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: the same as --from)"),
    category: z.string().min(1).optional().describe("category from `category list`, e.g. stand-up, musical, børneteater (part of a name is enough)"),
    age: z.coerce.number().int().min(0).max(120).optional().describe("only productions suitable for someone this old (no age limit, or a limit at most this)"),
    maxPrice: z.coerce.number().min(0).optional().describe("only productions whose cheapest ticket costs at most this many DKK"),
    fromTime: hhmm.optional().describe("earliest start time, HH:MM"),
    toTime: hhmm.optional().describe("latest start time, HH:MM"),
    query: z.string().optional().describe("words that must all be in the title"),
    includeOutside: z.boolean().default(false).describe("also venues outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Gentofte, Lyngby, Hvidovre …"),
    limit: z.coerce.number().int().min(1).max(300).default(40).describe("most shows to return (default 40)"),
  }),
  uses: [listCategories, listEvents],
  run: async (args, { call }) => {
    const from = args.from ?? today();
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");

    // The site files a production under its own category and subcategory (Skuespil og dramatik, Comedy …)
    // and maps it to the short names of `category list` (Komedie, Børneteater …): match either.
    const wanted = args.category?.trim().toLowerCase();
    let siteNames: string[] = [];
    let listed: string[] = [];
    if (wanted) {
      const { eventCategories } = await call(listCategories, {});
      listed = eventCategories.map((c) => c.name);
      siteNames = eventCategories.filter((c) => c.name.toLowerCase().includes(wanted) || (c.label ?? "").toLowerCase().includes(wanted)).flatMap((c) => [c.name.toLowerCase(), (c.label ?? "").toLowerCase()]);
    }
    const seenCategories = new Set<string>();
    let categoryHit = false;
    const words = (args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);

    const rows: Array<Record<string, unknown> & { date: string; time: string }> = [];
    let complete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await call(listEvents, { page: String(page), pageSize: String(PAGE_SIZE) });
      for (const item of r.items) {
        for (const c of [item.categoryName, item.subCategoryName]) if (c) seenCategories.add(c);
        if (wanted) {
          if (!matchesCategory(item, wanted, siteNames)) continue;
          categoryHit = true;
        }
        const municipality = item.venue?.municipality ?? null;
        const area = isCopenhagen(municipality) ? "cph" : "outside";
        if (area === "outside" && !args.includeOutside) continue;
        if (args.age != null && !fitsAge(item.ageFrom, args.age)) continue;
        if (args.maxPrice != null && !(item.ticketPriceMin != null && item.ticketPriceMin <= args.maxPrice)) continue;
        const title = item.title.trim();
        if (words.length && !words.every((w) => title.toLowerCase().includes(w))) continue;
        const v = item.venue;
        const address = [[v?.street, v?.number].filter(Boolean).join(" ").trim(), orNull(v?.city)].filter(Boolean).join(", ");
        for (const s of item.scheduledShows ?? []) {
          if (s.type === "Lukket forestilling") continue;
          const date = localDate(s.dateTime);
          const time = localTime(s.dateTime);
          if (date < from || date > to) continue;
          if (args.fromTime && time < args.fromTime) continue;
          if (args.toTime && time > args.toTime) continue;
          rows.push({
            title,
            category: orNull(item.categoryName),
            subCategory: orNull(item.subCategoryName),
            date,
            time,
            stage: orNull(s.stageName),
            venue: orNull(v?.name),
            address: address || null,
            postcode: orNull(v?.postCode),
            municipality: orNull(municipality),
            area,
            priceMinDKK: item.ticketPriceMin ?? null,
            priceMaxDKK: item.ticketPriceMax ?? null,
            ageFrom: item.ageFrom ?? null,
            premiere: s.type === "Premiere" || s.type === "Forpremiere",
            url: pageUrl(item),
            bookingUrl: bookingUrl(item),
          });
        }
      }
      if (page >= r.pagination.pageCount) {
        complete = true;
        break;
      }
    }
    if (wanted && complete && !categoryHit) {
      inputFailure(`No category "${args.category}". --category takes a name from \`category list\` (${listed.join(", ")}) or part of one of the site's own: ${[...seenCategories].sort().join(", ")}.`);
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || String(a.title).localeCompare(String(b.title)));
    // complete is false when the site has more pages than this command reads.
    return { total: rows.length, complete, shows: rows.slice(0, args.limit) };
  },
});
