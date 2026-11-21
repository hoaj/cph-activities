import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "../src/runtime/call";
import { Failure } from "../src/runtime/envelope";
import { extractHtml } from "../src/runtime/html";
import eventList from "../src/commands/event-list";
import listEvents from "../src/operations/listEvents";
import site from "../src/site";
import { fakeFetch, makeDeps, tempHome, type Recorded } from "./helpers";

let home: ReturnType<typeof tempHome>;
beforeEach(() => (home = tempHome()));
afterEach(() => home.cleanup());

type C = { path?: string; title?: string; stamps?: string | null; body?: string; past?: boolean };
const article = (c: C) => {
  const link = c.path === undefined ? "/events/2030/testnat" : c.path;
  const stamps = c.stamps === undefined ? "20301206T220000Z/20301207T050000Z" : c.stamps;
  return `<article class="eventlist-event eventlist-event--${c.past ? "past" : "upcoming"}">
  <h1 class="eventlist-title"><a href="${link}" class="eventlist-title-link">${c.title ?? "Act One, Act Two"}</a></h1>
  <ul class="eventlist-meta"><li class="eventlist-meta-date">
    ${stamps ? `<time class="event-date" datetime="2030-12-06">Fri</time><span class="eventlist-meta-time"><time class="event-time-localized" datetime="2030-12-06">11:00 PM</time></span>
    <time class="event-date" datetime="2030-12-07">Sat</time><span class="eventlist-meta-time"><time class="event-time-localized" datetime="2030-12-07">6:00 AM</time></span>` : ""}
  </li>${stamps ? `<li class="eventlist-meta-export"><a href="http://www.google.com/calendar/event?action=TEMPLATE&text=x&dates=${stamps}" class="eventlist-meta-export-google">Google Calendar</a><a href="${link}?format=ical" class="eventlist-meta-export-ical">ICS</a></li>` : ""}</ul>
  <div class="eventlist-description">${c.body ?? `<p><strong>TICKETS:<br></strong>Early bird: 100kr incl. fee <br>Door 150 DKK</p><p><strong>Buy tickets: </strong><a href="https://ra.co/events/1">here</a></p><p><br>*Guests pay a late entrance fee of 55kr.<br>Opening hours 23:00-06:00<br>Minimum age: 20+<br>Medium lockers = 40 DKK</p><style>.x { color: red }</style>`}</div>
  <a href="${link}" class="eventlist-button">View Event</a>
</article>`;
};
const page = (cards: C[]) => `<!doctype html><html><body><div class="sqs-events-collection-list">${cards.map(article).join("")}</div></body></html>`;
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const run = async (handler: (req: Recorded) => Response, args: Record<string, unknown> = { from: "2030-12-01", to: "2030-12-31" }) => {
  const f = fakeFetch(handler);
  const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
  const out = (await eventList.run((eventList.args as any).parse(args), { call: (op, vars) => c.call(op, vars), session: { ids: {} }, note: () => {} })) as any;
  return { out, calls: f.calls };
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

describe("event list", () => {
  test("reads the card into a row with one plain page load and no query string", async () => {
    const { out, calls } = await run(() => html(page([{}])));
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0]!.url);
    expect(calls[0]!.method ?? "GET").toBe("GET");
    expect(u.origin + u.pathname).toBe("https://www.hangaren.dk/events");
    expect(u.search).toBe(""); // robots.txt disallows the JSON and iCal formats
    expect(out.complete).toBe(true);
    expect(out.events[0]).toMatchObject({
      title: "Act One, Act Two",
      date: "2030-12-06",
      time: "23:00",
      endDate: "2030-12-07",
      endTime: "06:00",
      artists: ["Act One", "Act Two"],
      priceMinDKK: 100,
      priceMaxDKK: 150,
      priceText: "Early bird: 100kr incl. fee; Door 150 DKK",
      ageFrom: 20,
      url: "https://www.hangaren.dk/events/2030/testnat",
      ticketUrl: "https://ra.co/events/1",
    });
  });

  test("never follows a ticket link: every request stays on the site", async () => {
    const { calls } = await run(() => html(page([{}, { path: "/events/2030/b" }])));
    expect(calls.every((r) => new URL(r.url).hostname === "www.hangaren.dk")).toBe(true);
  });

  test("one odd card is counted and the others still come back", async () => {
    const { out } = await run(() => html(page([{}, { path: "/events/2030/x", stamps: null }, { path: "", title: "No link" }, { path: "/events/2030/y", body: "" }])));
    expect(out.total).toBe(2);
    expect(out.unreadable).toBe(2);
    expect(out.complete).toBe(false);
    expect(out.events[1]).toMatchObject({ priceMinDKK: null, ageFrom: null, ticketUrl: null });
  });

  test("no night in the period is an empty list, not Drift", async () => {
    const { out } = await run(() => html(page([{ past: true }])), { from: "2031-01-01" });
    expect(out.total).toBe(0);
    expect(out.events).toEqual([]);
  });

  test("a page with no event list is Drift", async () => {
    const e = await failure(run(() => html("<!doctype html><html><body><p>New design</p></body></html>")));
    expect(e.kind).toBe("drift");
  });

  test("a list with no card is Drift", async () => {
    const e = await failure(run(() => html(page([]))));
    expect(e.kind).toBe("drift");
  });

  test("cards none of which can be read are Drift", async () => {
    const e = await failure(run(() => html(page([{ stamps: null }, { path: "/events/2030/b", stamps: null }]))));
    expect(e.kind).toBe("drift");
  });

  test("bad input fails before any request", async () => {
    const parse = (a: Record<string, unknown>) => (eventList.args as any).safeParse(a).success;
    expect(parse({ from: "2030-02-30" })).toBe(false);
    expect(parse({ fromTime: "25:00" })).toBe(false);
    expect(parse({ limit: "0" })).toBe(false);
    expect(parse({ maxPrice: "-1" })).toBe(false);
    let calls = 0;
    const e = await failure(run(() => (calls++, html(page([{}]))), { from: "2030-12-02", to: "2030-12-01" }));
    expect(e.kind).toBe("input");
    expect(calls).toBe(0);
  });
});

describe("lines", () => {
  test("a field with lines: true splits at <br> and block elements, and a source line break is a space", () => {
    const fields = { text: { css: "div", lines: true } };
    const out = extractHtml("<div><p>One<br>Two\n   words</p><p> </p><ul><li>Three</li></ul><style>.x{}</style></div>", fields);
    expect(out).toEqual({ ok: true, value: { text: ["One", "Two words", "Three"] } });
    expect(extractHtml("<p>none</p>", fields)).toEqual({ ok: true, value: { text: [] } });
  });
});

test("the Contract asks only for the events page", () => {
  expect(listEvents.rest?.path).toBe("/events");
  expect(listEvents.rest?.query).toBeUndefined();
});
