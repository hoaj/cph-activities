import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import { Failure } from "../runtime/envelope";
import { driftFingerprint } from "../runtime/fingerprint";
import getEvent from "../operations/getEvent";
import listEvents from "../operations/listEvents";
import site from "../site";
import { HOUSE_AGE_FROM, selectNights, toNight, withPage, type EventPage, type Night } from "../lib/events";

const MAX_EVENT_PAGES = 10; // each night's page is one request, read one at a time
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").refine((s) => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "not a real date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

const drift = (operation: string, path: string, code: string, message: string) =>
  new Failure("drift", `${operation}: ${message}`, {
    fingerprint: driftFingerprint(site, operation, "html", path, code),
    diff: [{ path, code }],
  });

/** One event page, or why not: Drift on this page, or a network failure. A block by the site always ends the run. */
async function readPage(read: () => Promise<EventPage>): Promise<{ page?: EventPage; drift?: Failure }> {
  try {
    return { page: await read() };
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    if (e.kind === "drift") return { drift: e };
    if (e.kind === "network" && !e.details.blocked) return {};
    throw e;
  }
}

export default defineCommand({
  name: "event list",
  summary:
    "Club nights at Culture Box (Copenhagen) on a day or period, soonest first: opening hours, lineup per room, entrance price, and links to the night's page and tickets",
  args: z.object({
    from: isoDate.optional().describe("first date a night opens on, YYYY-MM-DD (default: today)"),
    to: isoDate.optional().describe("last date a night opens on, YYYY-MM-DD (default: the same as --from)"),
    fromTime: hhmm.optional().describe("only nights opening at or after HH:MM; nights with no hours are left out"),
    toTime: hhmm.optional().describe("only nights opening at or before HH:MM; nights with no hours are left out"),
    maxPrice: z.coerce.number().min(0).optional().describe("keep nights whose lowest stated entrance (`priceMinDKK`) is at most this many kroner"),
    free: z.boolean().default(false).describe("only nights the site marks as free"),
    query: z.string().optional().describe("words that must all be in the title, a room, a series or an artist's name"),
    limit: z.coerce.number().int().min(1).max(60).default(40).describe("most nights to return (default 40)"),
  }),
  uses: [listEvents, getEvent],
  run: async (args, { call, note }) => {
    const from = args.from ?? today();
    const to = args.to ?? from;
    if (to < from) inputFailure("--to is before --from.");
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");

    const list = await call(listEvents, {});
    // The calendar's own links with no card to read them from: the cards' layout changed.
    if (list.cards.length === 0 && list.eventLinks.some(Boolean)) {
      throw drift(listEvents.name, "cards", "no_cards", "the page links to nights but no card was found.");
    }
    const nights = list.cards.map((c) => toNight(c, site.origin));
    const readable = nights.filter((n): n is Night => n !== null);
    if (list.cards.length > 0 && readable.length === 0) {
      throw drift(listEvents.name, "cards[].heading", "no_dates", "no card has a readable date and link.");
    }
    const unreadable = nights.length - readable.length;

    const matched = selectNights(readable, { from, to, fromTime: args.fromTime, toTime: args.toTime, maxPrice: args.maxPrice, free: args.free, query: args.query });
    const shown = matched.slice(0, args.limit);

    // One odd or missing page leaves its row without details. Drift is when the pages in general are gone.
    const events: Night[] = [...shown];
    let requests = 1;
    let read = 0;
    let firstDrift: Failure | null = null;
    let struggling = false;
    const toRead = shown.slice(0, MAX_EVENT_PAGES);
    for (let i = 0; i < toRead.length && !struggling; i++) {
      requests++;
      const outcome = await readPage(() => call(getEvent, { id: toRead[i]!.id }));
      if (outcome.page) {
        read++;
        events[i] = withPage(toRead[i]!, outcome.page);
      } else if (outcome.drift) firstDrift ??= outcome.drift;
      else struggling = true; // the site is not answering: send it nothing more
    }
    if (read === 0 && firstDrift && !struggling) {
      // No page read: ask one night outside the result, to tell odd pages from a changed layout.
      const other = readable.find((n) => !toRead.some((t) => t.id === n.id));
      if (other) {
        requests++;
        const control = await readPage(() => call(getEvent, { id: other.id }));
        if (control.drift) throw firstDrift;
      } else if (toRead.length > 1) throw firstDrift;
    }
    note(`${requests} requests`);

    return {
      total: matched.length,
      complete: unreadable === 0 && !list.older,
      unreadable,
      withoutDetails: events.filter((e) => !e.detailsRead).length,
      houseAgeFrom: HOUSE_AGE_FROM,
      events,
    };
  },
});
