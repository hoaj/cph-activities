import { describe, expect, test } from "bun:test";
import { ageOf, amountsIn, artistsOf, clockOf, isCancelled, pageOf, priceOf, scheduleOf, selectEvents, soldOutOf, ticketUrlOf, toRow, withStatedHours, type Card } from "../src/lib/events";

const card = (over: Partial<Card> = {}): Card => ({
  href: "/events/2030/testnat",
  title: "Act One, Act Two",
  calendarLink: "http://www.google.com/calendar/event?action=TEMPLATE&text=x&dates=20301206T220000Z/20301207T050000Z",
  dates: ["2030-12-06", "2030-12-07"],
  clocks: ["11:00 PM", "6:00 AM"],
  lines: ["TICKETS:", "Early bird: 100kr incl. fee", "Door 150 DKK", "Minimum age: 20+"],
  links: ["/info", "https://ra.co/events/1"],
  ...over,
});
const sel = { today: "2030-12-01", from: "2030-12-01", to: "2030-12-31", free: false, includeCancelled: false, limit: 40 };

describe("time", () => {
  test("a night past midnight keeps its start date, in Copenhagen time", () => {
    expect(scheduleOf(card())).toEqual({ date: "2030-12-06", time: "23:00", endDate: "2030-12-07", endTime: "06:00" });
  });

  test("summer time comes from the date", () => {
    const c = card({ calendarLink: "x&dates=20300705T210000Z/20300706T040000Z" });
    expect(scheduleOf(c)).toEqual({ date: "2030-07-05", time: "23:00", endDate: "2030-07-06", endTime: "06:00" });
  });

  test("a start after midnight UTC-wise stays on Copenhagen's date", () => {
    const c = card({ calendarLink: "x&dates=20301206T233000Z/20301207T050000Z" });
    expect(scheduleOf(c)).toMatchObject({ date: "2030-12-07", time: "00:30" });
  });

  test("without the calendar link it reads the shown dates and clocks", () => {
    expect(scheduleOf(card({ calendarLink: null }))).toEqual({ date: "2030-12-06", time: "23:00", endDate: "2030-12-07", endTime: "06:00" });
    expect(scheduleOf(card({ calendarLink: null, dates: ["2030-12-06"], clocks: ["4:00 PM", "11:00 PM"] }))).toEqual({ date: "2030-12-06", time: "16:00", endDate: "2030-12-06", endTime: "23:00" });
    expect(scheduleOf(card({ calendarLink: null, dates: ["2030-12-06"], clocks: ["23.00", "06.00"] }))).toMatchObject({ endDate: "2030-12-07", endTime: "06:00" });
    expect(scheduleOf(card({ calendarLink: null, clocks: [] }))).toEqual({ date: "2030-12-06", time: null, endDate: null, endTime: null });
  });

  test("no date at all is no schedule", () => {
    expect(scheduleOf(card({ calendarLink: "broken", dates: [null], clocks: [] }))).toBeNull();
    expect(scheduleOf(card({ calendarLink: null, dates: ["2030-13-40"] }))).toBeNull();
  });

  test("clocks", () => {
    expect(["12:00 AM", "12:30 PM", "6:00 AM", "23.15", "25:00", "1:75", "soon"].map(clockOf)).toEqual(["00:00", "12:30", "06:00", "23:15", null, null, null]);
  });

  test("the card's stated opening hours beat a leftover calendar end", () => {
    const s = { date: "2030-12-06", time: "23:00", endDate: "2030-12-07", endTime: "00:00" };
    expect(withStatedHours(s, ["Opening hours 23:00-06:00"])).toEqual({ date: "2030-12-06", time: "23:00", endDate: "2030-12-07", endTime: "06:00" });
    expect(withStatedHours(s, ["Opening hours: 23:00 – 05:45"]).endTime).toBe("05:45");
    expect(withStatedHours(s, ["23.00 - 04.00"]).endTime).toBe("04:00");
  });

  test("stated hours that end the same day stay on that day", () => {
    const s = { date: "2030-12-08", time: "16:00", endDate: "2030-12-08", endTime: "17:00" };
    expect(withStatedHours(s, ["Opening hours 16:00-23:00"])).toMatchObject({ endDate: "2030-12-08", endTime: "23:00" });
    expect(withStatedHours(s, ["Opening hours 16:00-00:00"])).toMatchObject({ endDate: "2030-12-09", endTime: "00:00" });
  });

  test("stated hours with another start are ignored", () => {
    const s = { date: "2030-12-06", time: "23:00", endDate: "2030-12-07", endTime: "06:00" };
    expect(withStatedHours(s, ["Opening hours 20:00-02:00"])).toEqual(s);
  });
});

describe("price", () => {
  test("tiers become a min and a max, and the text is kept", () => {
    expect(priceOf(["TICKETS:", "Presale tickets:", "Early entrance* (enter before 24:00): 100kr incl. fee", "Early bird (enter all night): 120 DKK incl. fee", "Doorsale tickets 140kr"])).toEqual({
      priceMinDKK: 100,
      priceMaxDKK: 140,
      free: false,
      priceText: "Early entrance* (enter before 24:00): 100kr incl. fee; Early bird (enter all night): 120 DKK incl. fee; Doorsale tickets 140kr",
    });
  });

  test("lockers, late fees and footnotes are no entry price", () => {
    const p = priceOf([
      "TICKETS:",
      "General admission: 90kr",
      'Guests must arrive early, or a late entrance fee of 55kr applies',
      '*Guests holding "Early entrance" tickets must arrive on time, 30kr',
      "Medium lockers with space for 2-3 jackets = 40 DKK",
      "Large lockers: Space for 3-5 jackets = 70 DKK",
    ]);
    expect(p).toMatchObject({ priceMinDKK: 90, priceMaxDKK: 90 });
    expect(p.priceText).toBe("General admission: 90kr");
  });

  test("clock times and hour ranges next to a price are not amounts", () => {
    expect(amountsIn("Entre ankom før kl. 23.00: 100 kr,- (ex gebyr)")).toEqual([100]);
    expect(amountsIn("Early entrance 21-23 100kr (presale and door sale)")).toEqual([100]);
    expect(amountsIn("Presale: Early entrance (only) 00-01: 100kr")).toEqual([100]);
    expect(amountsIn("2st release: 150kr")).toEqual([150]);
    expect(amountsIn("Tickets 100-150 kr")).toEqual([100, 150]);
    expect(amountsIn("DKK 80 at the door")).toEqual([80]);
    expect(amountsIn("1.200 kr.")).toEqual([1200]);
    expect(amountsIn("100 pre sale tickets")).toEqual([]);
  });

  test("a ticket block's line needs no ticket word; an amount in plain prose outside it does not count", () => {
    expect(priceOf(["Billetsalg:", "Standard: 80 kr"])).toMatchObject({ priceMinDKK: 80, priceMaxDKK: 80 });
    expect(priceOf(["Entré:", "Standard: 80 kr"])).toMatchObject({ priceMinDKK: 80 });
    expect(priceOf(["TICKETS:", "En øl: 40 kr", "Standard: 80 kr"])).toMatchObject({ priceMinDKK: 80, priceMaxDKK: 80 });
    expect(priceOf(["Chocolate 50 kr"]).priceMinDKK).toBeNull();
    expect(priceOf(["They raised 500 kr for charity last year"])).toEqual({ priceMinDKK: null, priceMaxDKK: null, free: null, priceText: null });
  });

  test("no stated amount leaves the numbers null", () => {
    expect(priceOf(["Buy tickets here: https://example.test/1"])).toEqual({ priceMinDKK: null, priceMaxDKK: null, free: null, priceText: null });
  });

  test("free only when the page says the night is free", () => {
    expect(priceOf(["Free entrance"])).toEqual({ priceMinDKK: 0, priceMaxDKK: 0, free: true, priceText: "Free entrance" });
    expect(priceOf(["Entré: gratis"])).toMatchObject({ free: true, priceMinDKK: 0 });
    // The house rules on every page speak of feeling free.
    expect(priceOf(["We want every guest to feel safe and free at our parties"]).free).toBeNull();
  });

  test("a free first hour is kept in the text and is not a free night", () => {
    expect(priceOf(["- Free entrance: 20-21", "- Early entrance 21-23 100kr", "- All night entrance 150kr"])).toEqual({
      priceMinDKK: 100,
      priceMaxDKK: 150,
      free: false,
      priceText: "Free entrance: 20-21; Early entrance 21-23 100kr; All night entrance 150kr",
    });
    expect(priceOf(["Free entrance before 21:00"])).toEqual({ priceMinDKK: null, priceMaxDKK: null, free: null, priceText: "Free entrance before 21:00" });
  });
});

describe("age, status and line-up", () => {
  test("age as the page states it", () => {
    expect(ageOf(["Minimum age: 20+"])).toBe(20);
    expect(ageOf(["Aldersgrænse: 21 + husk ID !"])).toBe(21);
    expect(ageOf(["Age limit 18"])).toBe(18);
    expect(ageOf(["Age: 18+"])).toBe(18);
    expect(ageOf(["She started playing at age 16 years old"])).toBeNull();
  });

  test("no age, or two different ones, is null", () => {
    expect(ageOf(["No harassment based on gender or age."])).toBeNull();
    expect(ageOf(["Minimum age: 20+", "Aldersgrænse: 18+"])).toBeNull();
    expect(ageOf(["Minimum age: 20+", "Age: 20+"])).toBe(20);
  });

  test("cancelled from the title", () => {
    expect(isCancelled("Cancelled: Act One")).toBe(true);
    expect(isCancelled("AFLYST: Act One")).toBe(true);
    expect(isCancelled("The Cancelled Tapes")).toBe(false);
  });

  test("sold out only from the title or a line of its own, never the house rules", () => {
    expect(soldOutOf("SOLD OUT: Act One", [])).toBe(true);
    expect(soldOutOf("Act One", ["UDSOLGT!"])).toBe(true);
    expect(soldOutOf("Act One - SOLD OUT", [])).toBe(true);
    expect(soldOutOf("Act One (udsolgt)", [])).toBe(true);
    expect(soldOutOf("The Sold Out Tapes, Act Two", [])).toBeNull();
    expect(soldOutOf("Act One", ["There are always tickets at the door, even if the presale is sold out."])).toBeNull();
    expect(soldOutOf("Act One", ["Saturday sold out fast, so we added this extra show"])).toBeNull();
  });

  test("artists from a comma-separated title, without the series name or a note", () => {
    expect(artistsOf("Act One, Act Two (Live),Act Three", [])).toEqual(["Act One", "Act Two (Live)", "Act Three"]);
    expect(artistsOf("Series Name: Act One, Act Two", [])).toEqual(["Act One", "Act Two"]);
    expect(artistsOf("Act One, Act Two (extra show)", [])).toEqual(["Act One", "Act Two"]);
  });

  test("a title with no comma gives no list", () => {
    expect(artistsOf("A Night Name", [])).toBeNull();
    expect(artistsOf("Series Name: One Act", [])).toBeNull();
  });

  test("a Line-up section wins and ends at the next section", () => {
    expect(artistsOf("A Night Name", ["Some words", "LINE-UP:", "Act One", "Act Two:", "VJ Line-up:", "Vj Person"])).toEqual(["Act One", "Act Two"]);
    expect(artistsOf("A Night Name", ["Line up", "Act One", "TICKETS:", "Early bird: 100kr"])).toEqual(["Act One"]);
    expect(artistsOf("A Night Name", ["Line-Up", "Act One", "This sentence about the night is much longer than any act's name."])).toEqual(["Act One"]);
  });
});

describe("links", () => {
  test("the ticket link is the link's own target, kept as a string", () => {
    expect(ticketUrlOf(["/info", "mailto:x@example.test", "https://www.instagram.com/x", "https://ra.co/events/2"])).toBe("https://ra.co/events/2");
    expect(ticketUrlOf(["https://billetto.dk/e/x"])).toBe("https://billetto.dk/e/x");
    expect(ticketUrlOf(["/info", null, "not a url"])).toBeNull();
  });

  test("the event's page and id", () => {
    expect(pageOf("/events/2030/1206/testnat")).toEqual({ id: "2030/1206/testnat", url: "https://www.hangaren.dk/events/2030/1206/testnat" });
    expect(pageOf("/events/2030/testnat?format=ical")).toEqual({ id: "2030/testnat", url: "https://www.hangaren.dk/events/2030/testnat" });
    expect(pageOf("https://example.test/events/x")).toBeNull();
    expect(pageOf("/info")).toBeNull();
    expect(pageOf(null)).toBeNull();
  });
});

describe("rows and selection", () => {
  test("a whole row", () => {
    expect(toRow(card())).toEqual({
      id: "2030/testnat",
      title: "Act One, Act Two",
      date: "2030-12-06",
      time: "23:00",
      endDate: "2030-12-07",
      endTime: "06:00",
      venue: "Hangaren",
      address: "Refshalevej 185, 1432 København K",
      area: "cph",
      artists: ["Act One", "Act Two"],
      priceMinDKK: 100,
      priceMaxDKK: 150,
      free: false,
      priceText: "Early bird: 100kr incl. fee; Door 150 DKK",
      soldOut: null,
      cancelled: false,
      ageFrom: 20,
      url: "https://www.hangaren.dk/events/2030/testnat",
      ticketUrl: "https://ra.co/events/1",
    });
  });

  test("a card with no text is still a row, with nulls", () => {
    expect(toRow(card({ lines: [], links: [] }))).toMatchObject({ priceMinDKK: null, priceText: null, ageFrom: null, ticketUrl: null, soldOut: null });
  });

  test("a card with no title, link or date is unreadable, and the rest still come back", () => {
    const out = selectEvents([card(), card({ title: null }), card({ href: null }), card({ calendarLink: null, dates: [], clocks: [] })], sel);
    expect(out.total).toBe(1);
    expect(out.unreadable).toBe(3);
    expect(out.complete).toBe(false);
  });

  test("filters on date, time, price, query and cancelled", () => {
    const a = card({ href: "/events/a", title: "Mëtro, Act Two" });
    const b = card({ href: "/events/b", title: "Act Three, Act Four", calendarLink: "x&dates=20301213T150000Z/20301213T220000Z", lines: ["Early bird: 300kr"] });
    const c = card({ href: "/events/c", title: "Cancelled: Act Five, Act Six" });
    const free = card({ href: "/events/d", title: "Free Night", lines: ["Free entrance"] });
    const ids = (over: Partial<typeof sel> & Record<string, unknown>) => selectEvents([b, a, c, free], { ...sel, ...over }).events.map((e) => e.id);
    expect(ids({})).toEqual(["a", "d", "b"]);
    expect(ids({ includeCancelled: true })).toContain("c");
    expect(ids({ from: "2030-12-10" })).toEqual(["b"]);
    expect(ids({ fromTime: "20:00" })).toEqual(["a", "d"]);
    expect(ids({ toTime: "17:00" })).toEqual(["b"]);
    expect(ids({ maxPrice: 150 })).toEqual(["a", "d"]);
    expect(ids({ free: true })).toEqual(["d"]);
    expect(ids({ query: "metro" })).toEqual(["a"]);
    expect(ids({ query: "act four" })).toEqual(["b"]);
    expect(ids({ query: "act nothing" })).toEqual([]);
  });

  test("a night with no stated price is left out of --max-price, and a time filter leaves out one with no time", () => {
    const none = card({ lines: [] });
    expect(selectEvents([none], { ...sel, maxPrice: 1000 }).total).toBe(0);
    const noTime = card({ calendarLink: null, clocks: [] });
    expect(selectEvents([noTime], { ...sel, fromTime: "20:00" }).total).toBe(0);
    expect(selectEvents([noTime], { ...sel, toTime: "20:00" }).total).toBe(0);
  });

  test("the limit cuts the list and says so", () => {
    const many = [1, 2, 3].map((n) => card({ href: `/events/n${n}` }));
    const out = selectEvents(many, { ...sel, limit: 2 });
    expect(out.total).toBe(3);
    expect(out.events).toHaveLength(2);
    expect(out.complete).toBe(false);
  });

  test("a past search reaching before the page's oldest card is not complete; a coming one is", () => {
    expect(selectEvents([card()], { ...sel, from: "2030-11-01" }).complete).toBe(false);
    expect(selectEvents([card()], sel).complete).toBe(true);
  });

  test("the same card twice is one row", () => {
    expect(selectEvents([card(), card()], sel).total).toBe(1);
  });
});
