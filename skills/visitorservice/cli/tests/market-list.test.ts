import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Failure } from "../src/runtime/envelope";
import { Client } from "../src/runtime/call";
import marketList from "../src/commands/market-list";
import { check } from "../src/runtime/check";
import listMarkets from "../src/operations/listMarkets";
import getCalendarMarket from "../src/operations/getCalendarMarket";
import getMarket from "../src/operations/getMarket";
import site from "../src/site";
import { fakeFetch, makeDeps, tempHome, type Recorded } from "./helpers";

let home: ReturnType<typeof tempHome>;
beforeEach(() => (home = tempHome()));
afterEach(() => home.cleanup());

const card = (id: number, href: string, place: string, title: string) =>
  `<li class="card-grid-item--wrapper"><div class="card-grid-item" data-node-id="${id}"><a href="${href}"><div class="field--name-contact">${place}</div><h3 class="title">${title}</h3></a></div></li>`;
const list = (cards: string[], total = cards.length, related = "") =>
  `<!doctype html><html><body><div class="view-events-list">${cards.length ? `<div class="search-resume">Viser 1-${cards.length} af ${total} resultater</div><div class="view-content"><ul class="card-grid--event">${cards.join("")}</ul></div>` : `<div class="view-empty">Ingen</div>`}</div>${related}</body></html>`;

type Market = { name: string; days?: Record<string, [string, string]>; period?: [string, string, string, string]; contact?: string; street?: string; postcode?: string; district?: string; teaser?: string; price?: unknown; free?: string; noBlock?: boolean; noCalendar?: boolean; dateText?: string };
const market = (m: Market) => {
  const occurrences = m.days ? Object.fromEntries(Object.entries(m.days).map(([d, [s, e]]) => [d, [{ date: { hour_start: s, hour_end: e } }]])) : [];
  const schedule = m.period ? { "@type": "Schedule", startDate: m.period[0], endDate: m.period[1], startTime: m.period[2], endTime: m.period[3] } : undefined;
  const ld = { "@context": "https://schema.org", "@graph": [{ "@type": "Event", name: m.name, eventSchedule: schedule, isAccessibleForFree: m.free ?? "https://schema.org/True" }] };
  const settings = m.noCalendar ? {} : { eventCalendar: { "7": { event_defaults: { price_value: m.price ?? "Gratis" }, event_occurrences: occurrences } } };
  const block = m.noBlock ? "" : `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  const dates = m.dateText ? `<div class="field--name-scheduled-dates"><div class="date-text">${m.dateText}</div></div>` : "";
  return `<!doctype html><html><head>${block}<script type="application/json" data-drupal-selector="drupal-settings-json">${JSON.stringify(settings)}</script></head><body>
${dates}<div class="field--name-district">${m.district ?? "Indre by"}</div><div class="field--name-teaser">${m.teaser ?? "Et marked"}</div><div class="field--name-body"><p>Tekst</p></div>
<section id="places"><h2 class="kk-contact__name">${m.contact ?? "København, Testhallen"}</h2>${m.street ? `<p class="kk-contact__line1">${m.street}</p>` : ""}${m.postcode ? `<span class="kk-contact__postal">${m.postcode}</span>` : ""}</section>
<footer><h2 class="kk-contact__name">Sidefod</h2><p class="kk-contact__line1">Fodvej 1</p><span class="kk-contact__postal">9999</span></footer></body></html>`;
};
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const run = async (handler: (req: Recorded) => Response, args: Record<string, unknown>) => {
  const f = fakeFetch(handler);
  const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
  const out = (await marketList.run((marketList.args as any).parse(args), { call: (op, vars) => c.call(op, vars), session: { ids: {} }, note: () => {} })) as any;
  return { out, calls: f.calls.map((r) => new URL(r.url)) };
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
const site1 = (pages: Record<string, string>, first: string) => (req: Recorded) => {
  const u = new URL(req.url);
  if (u.pathname === "/eventkalender") return html(first);
  const body = pages[u.pathname];
  return body ? html(body) : html("nope", 404);
};
const WEEKEND = { from: "2030-12-07", to: "2030-12-08" };

describe("market list", () => {
  test("asks for Christmas markets in the period and reads both URL forms into rows", async () => {
    const first = list([card(1, "/eventkalender/marked-a", "København", "A"), card(2, "/marked-b", "Frederiksberg", "B")]);
    const { out, calls } = await run(
      site1(
        {
          "/eventkalender/marked-a": market({ name: "Marked A", days: { "2030-12-07": ["10:00", "16:00"], "2030-12-08": ["11:00", "17:00"], "2030-12-09": ["11:00", "17:00"] }, street: "Testvej 1", postcode: "2200", district: "Nørrebro", teaser: "Et indendørs marked" }),
          "/marked-b": market({ name: "Marked B", days: { "2030-12-08": ["09:00", "12:00"] }, contact: "Frederiksberg", district: "Udenfor København", price: ["Voksne 40 kr.", "Børn Gratis"] }),
        },
        first,
      ),
      WEEKEND,
    );
    const q = calls[0]!.searchParams;
    expect(calls[0]!.pathname).toBe("/eventkalender");
    expect(q.getAll("categories[]")).toEqual(["82"]);
    expect(q.get("dates[min]")).toBe("2030-12-07");
    expect(q.get("dates[max]")).toBe("2030-12-08");
    expect(out.total).toBe(2);
    expect(out.complete).toBe(true);
    expect(out.markets[0]).toEqual({
      id: "1",
      name: "Marked A",
      type: "julemarked",
      date: "2030-12-07",
      endDate: "2030-12-08",
      time: "10:00",
      endTime: "16:00",
      days: [{ date: "2030-12-07", time: "10:00", endTime: "16:00" }, { date: "2030-12-08", time: "11:00", endTime: "17:00" }],
      dayByDay: true,
      venue: "Testhallen",
      address: "Testvej 1",
      postcode: "2200",
      district: "Nørrebro",
      area: "cph",
      indoor: true,
      price: "Gratis",
      free: true,
      description: "Et indendørs marked",
      url: "https://visitorservice.kk.dk/eventkalender/marked-a",
    });
    expect(out.markets[1]).toMatchObject({ name: "Marked B", date: "2030-12-08", venue: null, address: null, postcode: null, district: null, area: "cph", indoor: null, free: false, price: "Voksne 40 kr.; Børn Gratis" });
  });

  test("leaves out markets outside Copenhagen, reading no page for a card placed elsewhere", async () => {
    const first = list([card(1, "/ude", "Dragør", "Ude"), card(2, "/postnr", "København", "Postnr"), card(3, "/distrikt", "København", "Distrikt"), card(4, "/inde", "København", "Inde")]);
    const day = { "2030-12-07": ["10:00", "16:00"] } as Record<string, [string, string]>;
    const { out, calls } = await run(
      site1({ "/postnr": market({ name: "Postnr", days: day, postcode: "2900" }), "/distrikt": market({ name: "Distrikt", days: day, district: "Udenfor København" }), "/inde": market({ name: "Inde", days: day }) }, first),
      WEEKEND,
    );
    expect(out.markets.map((m: any) => m.name)).toEqual(["Inde"]);
    expect(calls.some((u) => u.pathname === "/ude")).toBe(false);
  });

  test("cards outside the calendar's list are not markets", async () => {
    const first = list([card(1, "/inde", "København", "Inde")], 1, `<ul>${card(9, "/relateret", "København", "Relateret")}</ul>`);
    const { out, calls } = await run(site1({ "/inde": market({ name: "Inde", days: { "2030-12-07": ["10:00", "16:00"] } }) }, first), WEEKEND);
    expect(out.total).toBe(1);
    expect(calls.some((u) => u.pathname === "/relateret")).toBe(false);
  });

  test("a market with no open day in the search is left out", async () => {
    const first = list([card(1, "/andet", "København", "Andet")]);
    const { out } = await run(site1({ "/andet": market({ name: "Andet", days: { "2030-12-20": ["10:00", "16:00"] } }) }, first), WEEKEND);
    expect(out.markets).toEqual([]);
  });

  test("a long period gives every day in the search, flagged dayByDay false", async () => {
    const first = list([card(1, "/lang", "København", "Lang")]);
    const { out } = await run(site1({ "/lang": market({ name: "Lang", period: ["2030-11-01", "2030-12-31", "10:00", "21:00"] }) }, first), WEEKEND);
    expect(out.markets[0]).toMatchObject({ date: "2030-12-07", endDate: "2030-12-08", dayByDay: false });
  });

  test("each row carries the page's teaser as its description (the body when there is no teaser)", async () => {
    const first = list([card(1, "/a", "København", "A"), card(2, "/b", "København", "B")]);
    const day = { "2030-12-07": ["10:00", "16:00"] } as Record<string, [string, string]>;
    const noTeaser = market({ name: "B", days: day }).replace(/<div class="field--name-teaser">.*?<\/div>/, "");
    const { out } = await run(site1({ "/a": market({ name: "A", days: day, teaser: "Julemarked med   gløgg\n og håndværk" }), "/b": noTeaser }, first), WEEKEND);
    const by = Object.fromEntries(out.markets.map((m: any) => [m.name, m.description]));
    expect(by.A).toBe("Julemarked med gløgg og håndværk");
    expect(by.B).toBe("Tekst");
  });

  test("--indoor keeps markets that say so and counts those that do not say", async () => {
    const first = list([card(1, "/a", "København", "A"), card(2, "/b", "København", "B"), card(3, "/c", "København", "C")]);
    const day = { "2030-12-07": ["10:00", "16:00"] } as Record<string, [string, string]>;
    const { out } = await run(
      site1({ "/a": market({ name: "A", days: day, teaser: "Indendørs marked" }), "/b": market({ name: "B", days: day, teaser: "Udendørs marked" }), "/c": market({ name: "C", days: day }) }, first),
      { ...WEEKEND, indoor: true },
    );
    expect(out.markets.map((m: any) => m.name)).toEqual(["A"]);
    expect(out.indoorUnknown).toBe(1);
  });

  test("--free and the time window filter, and days outside the window drop from the row", async () => {
    const first = list([card(1, "/a", "København", "A"), card(2, "/b", "København", "B")]);
    const { out } = await run(
      site1({ "/a": market({ name: "A", days: { "2030-12-07": ["10:00", "12:00"], "2030-12-08": ["14:00", "18:00"] } }), "/b": market({ name: "B", days: { "2030-12-08": ["14:00", "18:00"] }, price: "50 kr." }) }, first),
      { ...WEEKEND, free: true, fromTime: "13:00" },
    );
    expect(out.markets.map((m: any) => m.name)).toEqual(["A"]);
    expect(out.markets[0].days).toEqual([{ date: "2030-12-08", time: "14:00", endTime: "18:00" }]);
    expect(out.markets[0].date).toBe("2030-12-08");
  });

  test("reads every list page, sorts by date and time, and --limit cuts after sorting", async () => {
    const pageOne = Array.from({ length: 12 }, (_, i) => card(i + 1, `/m${i + 1}`, "Lund", `M${i + 1}`));
    const pages: Record<string, string> = { "/sen": market({ name: "Sen", days: { "2030-12-08": ["12:00", "13:00"] } }), "/tidlig": market({ name: "Tidlig", days: { "2030-12-07": ["09:00", "10:00"] } }) };
    const { out, calls } = await run((req) => {
      const u = new URL(req.url);
      if (u.pathname === "/eventkalender") return html(u.searchParams.get("page") === "0" ? list(pageOne, 14) : list([card(20, "/sen", "København", "Sen"), card(21, "/tidlig", "København", "Tidlig")], 14));
      return html(pages[u.pathname] ?? "nope", pages[u.pathname] ? 200 : 404);
    }, { ...WEEKEND, limit: 1 });
    expect(calls.filter((u) => u.pathname === "/eventkalender").length).toBe(2);
    expect(out.total).toBe(2);
    expect(out.markets.map((m: any) => m.name)).toEqual(["Tidlig"]);
  });

  test("an empty search is an empty list, not Drift", async () => {
    const { out } = await run(() => html(list([])), WEEKEND);
    expect(out).toEqual({ total: 0, complete: true, unreadable: 0, markets: [] });
  });

  test("a link in another form is not read, is counted and marks the answer incomplete", async () => {
    const first = list([card(1, "/en/events/marked", "København", "A"), card(2, "/b", "København", "B")]);
    const { out, calls } = await run(site1({ "/b": market({ name: "B", days: { "2030-12-07": ["10:00", "16:00"] } }) }, first), WEEKEND);
    expect(out.markets.map((m: any) => m.name)).toEqual(["B"]);
    expect(out).toMatchObject({ total: 1, complete: false, unreadable: 1 });
    expect(calls.length).toBe(2);
  });

  test("when no card's link has a known form, that is Drift and not an empty list", async () => {
    const first = list([card(1, "/en/events/marked", "København", "A")]);
    const e = await failure(run(site1({}, first), WEEKEND));
    expect(e.kind).toBe("drift");
  });

  test("a calendar page without its list is Drift", async () => {
    const e = await failure(run(() => html("<!doctype html><html><body><p>Ny side med en del tekst</p></body></html>"), WEEKEND));
    expect(e.kind).toBe("drift");
  });

  test("a market page that lost its event data is Drift", async () => {
    const first = list([card(1, "/a", "København", "A")]);
    const e = await failure(run(site1({ "/a": "<!doctype html><html><body><p>Ingen data her</p></body></html>" }, first), WEEKEND));
    expect(e.kind).toBe("drift");
  });

  describe("a page without the Event block", () => {
    const good = market({ name: "God", days: { "2030-12-07": ["10:00", "16:00"] } });

    test("is read from the card's title and the page's calendar", async () => {
      const first = list([card(1, "/a", "København", "Korttitel")]);
      const { out } = await run(site1({ "/a": market({ name: "Ignoreret", noBlock: true, days: { "2030-12-07": ["11:00", "17:00"], "2030-12-08": ["12:00", "16:00"] }, street: "Testvej 1", postcode: "2200", price: "40 kr." }) }, first), WEEKEND);
      expect(out).toMatchObject({ total: 1, complete: true, unreadable: 0 });
      expect(out.markets[0]).toMatchObject({ name: "Korttitel", date: "2030-12-07", endDate: "2030-12-08", time: "11:00", dayByDay: true, address: "Testvej 1", postcode: "2200", price: "40 kr.", free: false });
    });

    test("is read from the page's date text when it has no calendar days", async () => {
      const first = list([card(1, "/dag", "København", "Dag"), card(2, "/periode", "København", "Periode")]);
      const { out } = await run(
        site1({ "/dag": market({ name: "x", noBlock: true, dateText: "Lør. 07. dec. 2030 Kl. 10.30 - 17" }), "/periode": market({ name: "x", noBlock: true, dateText: "01. dec. - 20. dec. 2030 Kl. 11 - 18" }) }, first),
        WEEKEND,
      );
      expect(out.unreadable).toBe(0);
      const by = Object.fromEntries(out.markets.map((m: any) => [m.name, m]));
      expect(by.Dag).toMatchObject({ date: "2030-12-07", endDate: "2030-12-07", time: "10:30", endTime: "17:00", dayByDay: true });
      expect(by.Periode).toMatchObject({ date: "2030-12-07", endDate: "2030-12-08", time: "11:00", endTime: "18:00", dayByDay: false });
    });

    test("with dates outside the search is simply not on that day", async () => {
      const first = list([card(1, "/a", "København", "A"), card(2, "/g", "København", "G")]);
      const { out } = await run(site1({ "/a": market({ name: "x", noBlock: true, dateText: "Lør. 14. dec. 2030 Kl. 10 - 17" }), "/g": good }, first), WEEKEND);
      expect(out).toMatchObject({ total: 1, complete: true, unreadable: 0 });
    });

    test("and with no dates is left out, counted, and marks the answer incomplete", async () => {
      const first = list([card(1, "/a", "København", "A"), card(2, "/g", "København", "G")]);
      const { out } = await run(site1({ "/a": market({ name: "x", noBlock: true }), "/g": good }, first), WEEKEND);
      expect(out.markets.map((m: any) => m.name)).toEqual(["God"]);
      expect(out).toMatchObject({ total: 1, complete: false, unreadable: 1 });
    });

    test("outside Copenhagen is not counted as unreadable", async () => {
      const first = list([card(1, "/a", "København", "A"), card(2, "/g", "København", "G")]);
      const { out } = await run(site1({ "/a": market({ name: "x", noBlock: true, postcode: "2900" }), "/g": good }, first), WEEKEND);
      expect(out).toMatchObject({ total: 1, complete: true, unreadable: 0 });
    });

    test("on every page read, with no dates either, is Drift and not an empty list", async () => {
      const first = list([card(1, "/a", "København", "A"), card(2, "/b", "København", "B")]);
      const e = await failure(run(site1({ "/a": market({ name: "x", noBlock: true }), "/b": market({ name: "y", noBlock: true }) }, first), WEEKEND));
      expect(e.kind).toBe("drift");
      expect(e.fingerprint).toContain("no_dates");
    });

    test("a page with neither block, calendar nor date text is no market page: Drift", async () => {
      const first = list([card(1, "/a", "København", "A"), card(2, "/g", "København", "G")]);
      const e = await failure(run(site1({ "/a": market({ name: "x", noBlock: true, noCalendar: true }), "/g": good }, first), WEEKEND));
      expect(e.kind).toBe("drift");
    });

    test("an Event block that is there but broken is still Drift", async () => {
      const first = list([card(1, "/a", "København", "A")]);
      const broken = market({ name: "", days: { "2030-12-07": ["10:00", "16:00"] } });
      const e = await failure(run(site1({ "/a": broken }, first), WEEKEND));
      expect(e.kind).toBe("drift");
    });
  });

  describe("check", () => {
    const listing = list([card(1, "/eventkalender/a", "København", "A"), card(2, "/b", "København", "B")]);
    const runCheck = async (pages: Record<string, string>) => {
      const f = fakeFetch(site1(pages, listing));
      const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
      return check(c, [listMarkets, getCalendarMarket, getMarket], {});
    };

    test("passes when the pages it lands on have no Event block", async () => {
      const r = await runCheck({ "/eventkalender/a": market({ name: "x", noBlock: true, days: { "2030-12-07": ["10:00", "16:00"] } }), "/b": market({ name: "y", noBlock: true, dateText: "Lør. 07. dec. 2030" }) });
      expect(r.ok).toBe(true);
      expect(r.operations.map((o) => o.status)).toEqual(["ok", "ok", "ok"]);
    });

    test("still reports a page whose layout is gone", async () => {
      const e = await failure(runCheck({ "/eventkalender/a": market({ name: "x", days: { "2030-12-07": ["10:00", "16:00"] } }), "/b": market({ name: "y", noBlock: true, noCalendar: true }) }));
      expect(e.kind).toBe("drift");
    });
  });

  test("bad input is an input failure and sends nothing", async () => {
    for (const args of [{ from: "2030-12-08", to: "2030-12-07" }, { type: "loppemarked" }, { fromTime: "18:00", toTime: "10:00" }]) {
      const f = fakeFetch(() => html(list([])));
      const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
      const e = await failure(marketList.run((marketList.args as any).parse(args), { call: (op, vars) => c.call(op, vars), session: { ids: {} }, note: () => {} }) as Promise<unknown>);
      expect(e.kind).toBe("input");
      expect(f.calls.length).toBe(0);
    }
    for (const args of [{ from: "2030-13-01" }, { from: "2030-02-30" }, { fromTime: "25:00" }, { limit: 0 }]) {
      expect((marketList.args as any).safeParse(args).success).toBe(false);
    }
  });

  test("--type julemarked is accepted in any case", async () => {
    const { out } = await run(() => html(list([])), { ...WEEKEND, type: "Julemarked" });
    expect(out.markets).toEqual([]);
  });
});
