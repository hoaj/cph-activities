import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import listMarkets from "../operations/listMarkets";
import getCalendarMarket from "../operations/getCalendarMarket";
import getMarket from "../operations/getMarket";
import { Failure } from "../runtime/envelope";
import { driftFingerprint } from "../runtime/fingerprint";
import site from "../site";
import type { MarketPage } from "../lib/market-page";
import { CHRISTMAS_MARKET_CATEGORY, daysIn, districtOf, freeOf, hasDates, inCph, indoorOf, inWindow, placeInCph, placeOf, priceOf, slugOf, totalOf } from "../lib/markets";

const PAGE_SIZE = 12;
const MAX_LIST_PAGES = 6;
const MAX_MARKET_PAGES = 30; // each market costs one page load
const AT_ONCE = 3;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").refine((s) => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "not a real date");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

/** What the market is, from the page's teaser (else its body): one line of text, at most 500 characters. */
const textOf = (...texts: Array<string | null>): string | null => {
  const t = texts.map((x) => (x ?? "").replace(/\s+/g, " ").trim()).find(Boolean);
  return t ? (t.length > 500 ? `${t.slice(0, 499)}…` : t) : null;
};

export default defineCommand({
  name: "market list",
  summary:
    "Christmas markets in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period from the municipality's Visitor Service calendar, with each open day's hours, the address when the page gives it, indoor or outdoor when its text says so, free or not, and a link to the market's page. It has no flea markets",
  args: z.object({
    from: isoDate.optional().describe("first date, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date, YYYY-MM-DD (default: --from)"),
    type: z.string().optional().describe("julemarked, the only type this calendar has; any other type exits 2 and names the skills to ask"),
    indoor: z.boolean().default(false).describe("only markets whose page says they are indoors; markets that do not say are left out and counted in indoorUnknown"),
    free: z.boolean().default(false).describe("only markets the page marks as free"),
    fromTime: clock.optional().describe("only days still open at or after HH:MM; days with no hours are left out"),
    toTime: clock.optional().describe("only days open by HH:MM; days with no hours are left out"),
    limit: z.coerce.number().int().min(1).max(60).default(20).describe("most markets to return (default 20)"),
  }),
  uses: [listMarkets, getCalendarMarket, getMarket],
  run: async (args, { call, note }) => {
    const from = args.from ?? today();
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");
    if (args.type !== undefined && args.type.trim().toLowerCase() !== "julemarked") {
      inputFailure(`This calendar only has --type julemarked, not "${args.type}". For flea and other markets ask \`kultunaut event list --genre Loppemarked/Genbrug\` and \`brugbyen event list --category Marked\`.`);
    }

    let requests = 0;
    let complete = true;
    const cards: Array<{ id: string; href: string; place: string | null; title: string }> = [];
    for (let page = 0; ; page++) {
      if (page === MAX_LIST_PAGES) {
        complete = false;
        break;
      }
      requests++;
      const r = await call(listMarkets, { categories: [CHRISTMAS_MARKET_CATEGORY], from, to, page: String(page) });
      cards.push(...r.cards);
      const found = totalOf(r.resume);
      if (r.cards.length < PAGE_SIZE || (found !== null && cards.length >= found)) break;
    }

    const seen = new Set<string>();
    const inCity = cards.filter((c) => placeInCph(c.place) && !seen.has(c.id) && !!seen.add(c.id));
    if (inCity.length > MAX_MARKET_PAGES) complete = false;
    const toRead = inCity.slice(0, MAX_MARKET_PAGES);

    const pages: Array<{ card: (typeof toRead)[number]; page: MarketPage } | null> = [];
    for (let i = 0; i < toRead.length; i += AT_ONCE) {
      const batch = toRead.slice(i, i + AT_ONCE);
      requests += batch.length;
      pages.push(
        ...(await Promise.all(
          batch.map(async (card) => {
            const s = slugOf(card.href);
            if (!s) {
              complete = false; // a link in neither of the site's two forms: this market could not be read
              return null;
            }
            const page = (await call(s.nested ? getCalendarMarket : getMarket, { slug: s.slug })) as MarketPage;
            return { card, page };
          }),
        )),
      );
    }

    // Single pages can lack the Event block. When none that was read gives an Event or dates (or no link
    // could be read at all), the site has changed: that is Drift, never an empty list.
    const read = pages.filter((p) => p !== null);
    if (toRead.length > 0 && read.every((p) => p.page.event === null && !hasDates(p.page))) {
      throw new Failure("drift", `${getMarket.name}: no market page read has an Event block or dates.`, {
        fingerprint: driftFingerprint(site, getMarket.name, "html", "event", "no_dates"),
        diff: [{ path: "event", code: "no_dates" }],
      });
    }

    let unreadable = pages.length - read.length;
    let indoorUnknown = 0;
    const markets: Array<Record<string, unknown> & { date: string; time: string | null }> = [];
    for (const item of pages) {
      if (!item) continue;
      const { card, page } = item;
      if (!inCph(card.place, page)) continue;
      if (!hasDates(page)) {
        unreadable++;
        complete = false;
        continue;
      }
      const { days: all, dayByDay } = daysIn(page, from, to);
      const days = all.filter((d) => inWindow(d, args.fromTime, args.toTime));
      if (days.length === 0) continue;
      const price = priceOf(page);
      const free = freeOf(price, page.event?.isAccessibleForFree);
      if (args.free && free !== true) continue;
      const indoor = indoorOf(page.teaser, page.body);
      if (args.indoor && indoor === null) indoorUnknown++;
      if (args.indoor && indoor !== true) continue;
      const first = days[0]!;
      const { venue, address } = placeOf(page.contactName, page.street);
      markets.push({
        id: card.id,
        name: page.event?.name ?? card.title,
        type: "julemarked",
        date: first.date,
        endDate: days[days.length - 1]!.date,
        time: first.time,
        endTime: first.endTime,
        days,
        dayByDay,
        venue,
        address,
        postcode: page.postcode?.match(/\b\d{4}\b/)?.[0] ?? null,
        district: districtOf(page.district),
        area: "cph",
        indoor,
        price,
        free,
        description: textOf(page.teaser, page.body),
        url: new URL(card.href, site.origin).toString(),
      });
    }
    note(`${requests} requests`);
    const key = (m: { date: string; time: string | null }) => `${m.date} ${m.time ?? "99:99"}`;
    markets.sort((a, b) => key(a).localeCompare(key(b)));
    return {
      total: markets.length,
      complete,
      unreadable,
      ...(args.indoor ? { indoorUnknown } : {}),
      markets: markets.slice(0, args.limit),
    };
  },
});
