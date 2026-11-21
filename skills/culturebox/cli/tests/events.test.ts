import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import eventList from "../src/commands/event-list";
import getEvent from "../src/operations/getEvent";
import listEvents from "../src/operations/listEvents";
import { ageFromOf, clockOf, dateOf, endDateOf, hoursOf, matchesQuery, priceOf, roomOf, slugOf, soldOutOf, titleOf, toNight } from "../src/lib/events";
import { Client } from "../src/runtime/call";
import { check } from "../src/runtime/check";
import { Failure } from "../src/runtime/envelope";
import { extractHtml } from "../src/runtime/html";
import site from "../src/site";
import { fakeFetch, makeDeps, tempHome, type Recorded } from "./helpers";

let home: ReturnType<typeof tempHome>;
beforeEach(() => (home = tempHome()));
afterEach(() => home.cleanup());

const O = "https://culture-box.com";
type Spec = { slug: string; heading?: string; rooms?: string; facts?: string[] };
const room = (name: string, lines: string[], series?: string) =>
  `<div class="post-block__content__block"><h3 class="is-capitalized">${name}</h3><p>${series ? `<strong>${series}</strong><br />` : ""}${lines.join("<br />\n")}</p></div>`;
const DEFAULT_ROOMS = room("Room One", ['<a href="https://audio.example.test/a">PLANTED ALPHA</a>', '<a href="https://audio.example.test/b">BETA</a> B2B <a href="https://audio.example.test/c">GAMMA</a>'], "PLANTED SERIES") + room("Room Two", ["DELTÀ"]);
const card = ({ slug, heading = "SAT 6 MARCH 2038", rooms = DEFAULT_ROOMS, facts = ["Entrance&nbsp;<strong>120 DKK</strong>", "10PM – 7AM", '<a href="https://social.example.test/1">Facebook</a>'] }: Spec) =>
  `<article class="post-block indented inverted"><h2 class="post-block__title">${heading}</h2><a href="${O}/event/${slug}/" class="post-block__image"></a><div class="post-block__content text-formatting">${rooms}</div><div class="post-block__footer"><div class="post-block__footer__aside"><ul>${facts.map((f) => `<li class="text-formatting">${f}</li>`).join("")}</ul></div><a href="${O}/event/${slug}/" class="post-block__button"><span class="post-block__button__label">More information</span></a></div></article>`;
const calendar = (cards: string[], older = "") =>
  `<!doctype html><html><body><main><div class="post-list">${cards.join("")}<div class="post-pagniation-links"><div class="post-pagniation-links__newer"></div><div class="post-pagniation-links__older">${older}</div></div></div></main></body></html>`;
const button = (label: string, href: string) => `<a target="_blank" href="${href}" class="button"><span class="post-block__button__label">${label}</span></a>`;
const eventPage = (buttons = button("Facebook", "https://social.example.test/1") + button("Tickets", "https://tickets.example.test/planted"), notes = "<p>Planted text with soldout shows and 20+ years behind the decks.</p>") =>
  `<!doctype html><html><body><main><article class="post-block single-block"><div class="post-block__buttons">${buttons}</div><div class="post-block__additional-text">${notes}</div></article></main></body></html>`;
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const run = async (handler: (req: Recorded) => Response, args: Record<string, unknown> = { from: "2038-03-06" }) => {
  const f = fakeFetch(handler);
  const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
  const out = (await eventList.run((eventList.args as any).parse(args), { call: (op: any, vars: any) => c.call(op, vars), session: { ids: {} }, note: () => {} } as any)) as any;
  return { out, paths: f.calls.map((r) => new URL(r.url).pathname) };
};
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Failure) return e;
    throw e;
  }
  throw new Error("expected a Failure");
};
const site1 = (cards: string[], page: (path: string) => Response = () => html(eventPage())) => (r: Recorded) => {
  const path = new URL(r.url).pathname;
  return path === "/events/" ? html(calendar(cards)) : page(path);
};

describe("parsing", () => {
  test("dates: the heading's real date, else null", () => {
    expect(dateOf("SAT 6 MARCH 2038")).toBe("2038-03-06");
    expect(dateOf("fri-12-november-2038")).toBe("2038-11-12");
    expect(dateOf("SAT 31 FEBRUARY 2038")).toBeNull();
    expect(dateOf("COMING SOON")).toBeNull();
    expect(dateOf(null)).toBeNull();
  });
  test("clock: am/pm and 24-hour; a bare number is ambiguous", () => {
    expect(clockOf("10PM")).toBe("22:00");
    expect(clockOf("10.30 pm")).toBe("22:30");
    expect(clockOf("12AM")).toBe("00:00");
    expect(clockOf("12PM")).toBe("12:00");
    expect(clockOf("23:15")).toBe("23:15");
    expect(clockOf("10")).toBeNull();
    expect(clockOf("13PM")).toBeNull();
  });
  test("hours: an open end keeps the opening time; a past-midnight close is the next day", () => {
    expect(hoursOf("10PM – 8AM")).toEqual({ time: "22:00", endTime: "08:00" });
    expect(hoursOf("8PM - late")).toEqual({ time: "20:00", endTime: null });
    expect(hoursOf("TBA")).toEqual({ time: null, endTime: null });
    expect(endDateOf("2038-12-31", "22:00", "10:00")).toBe("2039-01-01");
    expect(endDateOf("2038-03-06", "14:00", "22:00")).toBe("2038-03-06");
    expect(endDateOf("2038-03-06", "22:00", null)).toBeNull();
  });
  test("price: only stated kroner; a later cheaper price widens the range; no guess", () => {
    expect(priceOf("Entrance 120 DKK")).toEqual({ price: "120 DKK", priceMinDKK: 120, priceMaxDKK: 120, free: false });
    expect(priceOf("Entrance 140 DKK / 90 DKK after 6AM")).toMatchObject({ priceMinDKK: 90, priceMaxDKK: 140, free: false });
    expect(priceOf("Entrance Free")).toMatchObject({ priceMinDKK: 0, priceMaxDKK: 0, free: true });
    expect(priceOf("Entrance TBA")).toEqual({ price: "TBA", priceMinDKK: null, priceMaxDKK: null, free: null });
    expect(priceOf(null)).toEqual({ price: null, priceMinDKK: null, priceMaxDKK: null, free: null });
  });
  test("age: only a stated limit, never a number in a bio", () => {
    expect(ageFromOf("Age limit: 20+")).toBe(20);
    expect(ageFromOf("Aldersgrænse 21 år")).toBe(21);
    expect(ageFromOf("This is an 18+ event")).toBe(18);
    expect(ageFromOf("20+ years behind the decks")).toBeNull();
    expect(ageFromOf("10 YEARS OF PLANTED")).toBeNull();
    expect(ageFromOf("after 20+ events worldwide")).toBeNull();
    expect(ageFromOf("no age limit on 20 tracks")).toBeNull();
    expect(ageFromOf(null)).toBeNull();
  });
  test("sold out: a stated marker only", () => {
    expect(soldOutOf(["Sold out"])).toBe(true);
    expect(soldOutOf(["UDSOLGT"])).toBe(true);
    expect(soldOutOf(["120 DKK", null])).toBeNull();
  });
  test("slug: only the site's own event links", () => {
    expect(slugOf(`${O}/event/sat-6-march-2038/`)).toBe("sat-6-march-2038");
    expect(slugOf("/event/planted/")).toBe("planted");
    expect(slugOf("https://other.example.test/event/planted/")).toBeNull();
    expect(slugOf(`${O}/news/planted/`)).toBeNull();
    expect(slugOf(null)).toBeNull();
  });
  test("room: bold first line is the series, a linked bold name stays an artist", () => {
    expect(roomOf({ name: "Room", lines: ["Room", "SERIES:", "ONE", "TWO B2B THREE"], heading: "SERIES:" })).toEqual({ name: "Room", series: "SERIES", artists: ["ONE", "TWO B2B THREE"] });
    expect(roomOf({ name: "Room", lines: ["Room", "ONE", "TWO"], heading: null })).toEqual({ name: "Room", series: null, artists: ["ONE", "TWO"] });
  });
  test("title: series, else each room's first line, else a plain label", () => {
    expect(titleOf([{ name: "A", series: "S", artists: ["X"] }, { name: "B", series: "s", artists: [] }])).toBe("S");
    expect(titleOf([{ name: "A", series: null, artists: ["X", "Y"] }, { name: "B", series: null, artists: ["Z"] }])).toBe("X / Z");
    expect(titleOf([])).toBe("Club night at Culture Box");
  });
  test("the lines picker splits at <br>, not at a source newline", () => {
    const out = extractHtml("<div><p>ONE\nSTILL ONE<br>TWO <b>B2B</b> THREE<br/><br/></p></div>", { l: { css: "div", lines: true }, none: { css: "section", lines: true } });
    expect(out).toEqual({ ok: true, value: { l: ["ONE STILL ONE", "TWO B2B THREE"], none: [] } });
  });
  test("a card without a date or own link is no row", () => {
    expect(toNight({ heading: "COMING SOON", link: "https://other.example.test/x", rooms: [], facts: [] }, O)).toBeNull();
  });
  test("the entrance line's '6AM' is never read as opening hours", () => {
    const n = toNight({ heading: "SAT 6 MARCH 2038", link: `${O}/event/x/`, rooms: [], facts: ["Entrance 140 DKK / 90 DKK after 6AM"] }, O)!;
    expect(n.time).toBeNull();
    expect(n.priceMinDKK).toBe(90);
  });
});

describe("event list", () => {
  test("a full row: dated on its opening day, lineup per room, ticket link, no description", async () => {
    const { out, paths } = await run(site1([card({ slug: "sat-6-march-2038" })]));
    expect(paths).toEqual(["/events/", "/event/sat-6-march-2038/"]);
    expect(out).toMatchObject({ total: 1, complete: true, unreadable: 0, withoutDetails: 0, houseAgeFrom: 18 });
    expect(out.events[0]).toEqual({
      id: "sat-6-march-2038",
      title: "PLANTED SERIES",
      date: "2038-03-06",
      time: "22:00",
      endDate: "2038-03-07",
      endTime: "07:00",
      venue: "Culture Box",
      address: "Kronprinsessegade 54, 1306 København K",
      area: "cph",
      rooms: [
        { name: "Room One", series: "PLANTED SERIES", artists: ["PLANTED ALPHA", "BETA B2B GAMMA"] },
        { name: "Room Two", series: null, artists: ["DELTÀ"] },
      ],
      price: "120 DKK",
      priceMinDKK: 120,
      priceMaxDKK: 120,
      free: false,
      soldOut: null,
      ageFrom: null,
      url: `${O}/event/sat-6-march-2038/`,
      ticketUrl: "https://tickets.example.test/planted",
      detailsRead: true,
    });
    expect(JSON.stringify(out)).not.toContain("Planted text");
  });
  test("filters: dates, time, price, free and query (artists, accents ignored)", async () => {
    const cards = [
      card({ slug: "a", heading: "FRI 5 MARCH 2038", facts: ["Entrance 200 DKK", "11PM – 6AM"] }),
      card({ slug: "b", heading: "SAT 6 MARCH 2038" }),
      card({ slug: "c", heading: "SUN 7 MARCH 2038", rooms: room("Room One", ["OTHER"]), facts: ["Entrance Free", "2PM – 9PM"] }),
    ];
    const ids = async (args: Record<string, unknown>) => (await run(site1(cards), args)).out.events.map((e: any) => e.id);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07" })).toEqual(["a", "b", "c"]);
    expect(await ids({ from: "2038-03-06" })).toEqual(["b"]);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07", fromTime: "22:30" })).toEqual(["a"]);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07", toTime: "15:00" })).toEqual(["c"]);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07", maxPrice: 150 })).toEqual(["b", "c"]);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07", free: true })).toEqual(["c"]);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07", query: "delta" })).toEqual(["a", "b"]);
    expect(await ids({ from: "2038-03-05", to: "2038-03-07", query: "beta gamma", limit: 1 })).toEqual(["a"]);
  });
  test("a time or price filter leaves out a night that does not state it", async () => {
    const cards = [card({ slug: "a", facts: ["Entrance TBA", "soon"] })];
    expect((await run(site1(cards), { from: "2038-03-06", fromTime: "20:00" })).out.events).toEqual([]);
    expect((await run(site1(cards), { from: "2038-03-06", maxPrice: 500 })).out.events).toEqual([]);
  });
  test("bad input is exit 2 before any request", async () => {
    const parse = (a: unknown) => (eventList.args as any).safeParse(a).success;
    expect(parse({ from: "2038-02-31" })).toBe(false);
    expect(parse({ fromTime: "25:00" })).toBe(false);
    expect(parse({ limit: 0 })).toBe(false);
    const f = await failure(run(site1([]), { from: "2038-03-06", to: "2038-03-05" }));
    expect(f.kind).toBe("input");
    expect((await failure(run(site1([]), { from: "2038-03-06", fromTime: "23:00", toTime: "22:00" }))).kind).toBe("input");
  });
  test("an odd card is counted and the rest still come back", async () => {
    const odd = `<article class="post-block"><h2 class="post-block__title">COMING SOON</h2></article>`;
    const bare = card({ slug: "bare", rooms: "", facts: [] });
    const { out } = await run(site1([odd, bare, card({ slug: "b" })]));
    expect(out).toMatchObject({ total: 2, complete: false, unreadable: 1 });
    const row = out.events.find((e: any) => e.id === "bare");
    expect(row).toMatchObject({ rooms: [], time: null, endTime: null, endDate: null, price: null, priceMinDKK: null, free: null, title: "Club night at Culture Box" });
  });
  test("one event page that 404s or lacks its article leaves that row without details", async () => {
    const cards = [card({ slug: "gone" }), card({ slug: "odd" }), card({ slug: "good" })];
    const { out } = await run(site1(cards, (p) => (p.includes("gone") ? html("nope", 404) : p.includes("odd") ? html("<!doctype html><html><body><main></main></body></html>") : html(eventPage()))));
    expect(out.total).toBe(3);
    expect(out.withoutDetails).toBe(2);
    expect(out.events.find((e: any) => e.id === "good")).toMatchObject({ detailsRead: true, ticketUrl: "https://tickets.example.test/planted" });
    expect(out.events.find((e: any) => e.id === "gone")).toMatchObject({ detailsRead: false, ticketUrl: null, priceMinDKK: 120 });
  });
  test("a single odd page in a one-day search is no Drift when another night's page reads", async () => {
    const cards = [card({ slug: "odd", heading: "SAT 6 MARCH 2038" }), card({ slug: "other", heading: "FRI 12 MARCH 2038" })];
    const { out, paths } = await run(site1(cards, (p) => (p.includes("odd") ? html("nope", 404) : html(eventPage()))));
    expect(out.events.map((e: any) => e.id)).toEqual(["odd"]);
    expect(out.withoutDetails).toBe(1);
    expect(paths).toEqual(["/events/", "/event/odd/", "/event/other/"]);
  });
  test("the calendar's only night keeps its row when its page is odd", async () => {
    const { out } = await run(site1([card({ slug: "only" })], () => html("nope", 404)));
    expect(out).toMatchObject({ total: 1, withoutDetails: 1 });
    expect(out.events[0]).toMatchObject({ id: "only", detailsRead: false, ticketUrl: null });
  });
  test("an event page with no ticket button or a bad link is a null ticketUrl", async () => {
    const page = eventPage(button("Facebook", "https://social.example.test/1") + button("Tickets", "javascript:alert(1)"));
    const { out } = await run(site1([card({ slug: "b" })], () => html(page)));
    expect(out.events[0]).toMatchObject({ ticketUrl: null, detailsRead: true });
  });
  test("a stated age limit and a sold-out button come from the page", async () => {
    const page = eventPage(button("Sold out", "https://tickets.example.test/x"), "<p>Age limit: 20+</p>");
    const { out } = await run(site1([card({ slug: "b" })], () => html(page)));
    expect(out.events[0]).toMatchObject({ ageFrom: 20, soldOut: true });
  });
  test("a description that says sold out marks nothing", async () => {
    const { out } = await run(site1([card({ slug: "b" })]));
    expect(out.events[0].soldOut).toBeNull();
  });
  test("event pages are capped and counted", async () => {
    const cards = Array.from({ length: 12 }, (_, i) => card({ slug: `n${i}`, heading: `SAT ${i + 1} MARCH 2038` }));
    const { out, paths } = await run(site1(cards), { from: "2038-03-01", to: "2038-03-31" });
    expect(paths.length).toBe(11);
    expect(out).toMatchObject({ total: 12, withoutDetails: 2 });
  });
  test("a network failure on an event page keeps the rows and stops reading", async () => {
    const cards = [card({ slug: "a" }), card({ slug: "b" })];
    const { out, paths } = await run(site1(cards, () => new Response("down", { status: 503 })));
    expect(out.withoutDetails).toBe(2);
    expect(new Set(paths.filter((p) => p.startsWith("/event/"))).size).toBe(1); // the runtime's own retries stay on one page
  });
  test("an older-page link makes the result incomplete", async () => {
    const f = (r: Recorded) => (new URL(r.url).pathname === "/events/" ? html(calendar([card({ slug: "b" })], `<a href="${O}/events/page/2/">Older</a>`)) : html(eventPage()));
    expect((await run(f)).out.complete).toBe(false);
  });
  test("an empty calendar is an empty list", async () => {
    const { out } = await run(site1([]));
    expect(out).toMatchObject({ total: 0, events: [], complete: true });
  });
});

describe("Drift", () => {
  const drift = async (handler: (r: Recorded) => Response, args?: Record<string, unknown>) => {
    const f = await failure(run(handler, args));
    expect(f.kind).toBe("drift");
    return f;
  };
  test("the calendar's container is gone", async () => {
    const f = await drift(() => html("<!doctype html><html><body><main><p>new layout</p></main></body></html>"));
    expect(f.fingerprint).toContain("html:cards:no_match");
  });
  test("cards renamed: the page links to nights but no card is found", async () => {
    const page = `<!doctype html><html><body><main><div class="post-list"><div class="new-card"><a href="${O}/event/x/">x</a></div></div></main></body></html>`;
    expect((await drift(() => html(page))).fingerprint).toContain("no_cards");
  });
  test("no card has a date", async () => {
    const page = calendar([`<article class="post-block"><h2 class="post-block__title">?</h2></article>`]);
    expect((await drift(() => html(page))).fingerprint).toContain("no_dates");
  });
  test("every event page lost its article: the one read and the control", async () => {
    const cards = [card({ slug: "a", heading: "SAT 6 MARCH 2038" }), card({ slug: "b", heading: "FRI 12 MARCH 2038" })];
    const f = await drift(site1(cards, () => html("<!doctype html><html><body><main></main></body></html>")));
    expect(f.fingerprint).toContain("zod:article");
  });
  test("every event page answers 404", async () => {
    const cards = [card({ slug: "a" }), card({ slug: "b" })];
    expect((await drift(site1(cards, () => html("nope", 404)))).fingerprint).toContain("http::404");
  });
});

test("query matching folds case and accents", () => {
  const n = toNight({ heading: "SAT 6 MARCH 2038", link: `${O}/event/x/`, rooms: [{ name: "Room", lines: ["Room", "RÓS"], heading: null }], facts: [] }, O)!;
  expect(matchesQuery(n, "ros")).toBe(true);
  expect(matchesQuery(n, "ros other")).toBe(false);
  expect(matchesQuery(n, undefined)).toBe(true);
});

describe("check", () => {
  const runCheck = (page: string) => {
    const f = fakeFetch(site1([card({ slug: "b" })], () => html(page)));
    const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
    return check(c, [listEvents, getEvent], {});
  };
  test("reads the calendar, then a night from it", async () => {
    const r = await runCheck(eventPage());
    expect(r.ok).toBe(true);
    expect(r.operations.map((o) => o.status)).toEqual(["ok", "ok"]);
  });
  test("reports an event page whose layout is gone", async () => {
    const e = await failure(runCheck("<!doctype html><html><body><main></main></body></html>"));
    expect(e.kind).toBe("drift");
  });
});
