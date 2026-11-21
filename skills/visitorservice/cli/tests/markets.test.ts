import { describe, expect, test } from "bun:test";
import { daysIn, districtOf, freeOf, inCph, indoorOf, inWindow, isCphPostcode, placeInCph, placeOf, priceOf, slugOf, totalOf } from "../src/lib/markets";

const occ = (hour_start: string, hour_end: string) => ({ date: { hour_start, hour_end } });
const page = (occurrences: Record<string, ReturnType<typeof occ>[]> | unknown[], eventSchedule?: unknown, price_value: unknown = "Gratis") =>
  ({
    event: { name: "Testmarked", eventSchedule },
    settings: { eventCalendar: { "1": { event_defaults: { price_value }, event_occurrences: occurrences } } },
  }) as any;

describe("daysIn", () => {
  test("takes each day and its hours from the page's calendar, inside the search", () => {
    const r = daysIn(page({ "2030-12-06": [occ("10:00", "16:00")], "2030-12-07": [occ("11:00", "17:00")], "2030-12-08": [occ("12:00", "18:00")] }), "2030-12-07", "2030-12-08");
    expect(r).toEqual({ days: [{ date: "2030-12-07", time: "11:00", endTime: "17:00" }, { date: "2030-12-08", time: "12:00", endTime: "18:00" }], dayByDay: true });
  });
  test("the calendar wins over a stale schema.org schedule", () => {
    const stale = { startDate: "2029-01-04", endDate: "2029-01-04", startTime: "11:00", endTime: "23:00" };
    expect(daysIn(page({ "2030-12-07": [occ("10:00", "16:00")] }, stale), "2030-12-07", "2030-12-07").days).toEqual([{ date: "2030-12-07", time: "10:00", endTime: "16:00" }]);
  });
  test("two openings on one day run from the first opening to the last closing", () => {
    expect(daysIn(page({ "2030-12-07": [occ("14:00", "18:00"), occ("10:00", "12:00")] }), "2030-12-07", "2030-12-07").days[0]).toEqual({ date: "2030-12-07", time: "10:00", endTime: "18:00" });
  });
  test("00:00 to 00:00 is no hours, and an end equal to the start is no end", () => {
    const r = daysIn(page({ "2030-12-07": [occ("00:00", "00:00")], "2030-12-08": [occ("15:00", "15:00")] }), "2030-12-07", "2030-12-08");
    expect(r.days).toEqual([{ date: "2030-12-07", time: null, endTime: null }, { date: "2030-12-08", time: "15:00", endTime: null }]);
  });
  test("a long period with no calendar is every day in the search, flagged as not day by day", () => {
    const period = { startDate: "2030-11-13", endDate: "2030-12-30", startTime: "10:00", endTime: "21:00" };
    expect(daysIn(page([], period), "2030-12-29", "2031-01-02")).toEqual({
      days: [{ date: "2030-12-29", time: "10:00", endTime: "21:00" }, { date: "2030-12-30", time: "10:00", endTime: "21:00" }],
      dayByDay: false,
    });
  });
  test("no calendar and no schedule is no days", () => {
    expect(daysIn(page([]), "2030-12-07", "2030-12-07")).toEqual({ days: [], dayByDay: false });
  });
});

test("inWindow: open during the window, and a day with no hours is not", () => {
  const day = { date: "2030-12-07", time: "11:00", endTime: "17:00" };
  expect(inWindow(day)).toBe(true);
  expect(inWindow(day, "16:00")).toBe(true);
  expect(inWindow(day, "17:30")).toBe(false);
  expect(inWindow(day, undefined, "10:00")).toBe(false);
  expect(inWindow({ ...day, time: null, endTime: null }, "10:00")).toBe(false);
  expect(inWindow({ ...day, endTime: null }, "12:00")).toBe(false);
});

test("indoorOf reads only what the text says", () => {
  expect(indoorOf("Hyggeligt indendørs marked", null)).toBe(true);
  expect(indoorOf(null, "Et udendørs marked")).toBe(false);
  expect(indoorOf("Boder indendørs og udendørs")).toBeNull();
  expect(indoorOf("Marked i gården")).toBeNull();
  expect(indoorOf("Markedet er ikke udendørs")).toBeNull();
  expect(indoorOf(null, null)).toBeNull();
});

test("freeOf: the price text first, and a price-less 'not free' says nothing", () => {
  expect(freeOf("Gratis", false)).toBe(true);
  expect(freeOf("75 kr.", true)).toBe(false);
  expect(freeOf("Voksne 100 kr.; Børn u. 3 Gratis", true)).toBe(false);
  expect(freeOf("Se hjemmesiden", true)).toBeNull();
  expect(freeOf(null, "https://schema.org/True")).toBe(true);
  expect(freeOf(null, "https://schema.org/False")).toBeNull();
  expect(freeOf(null, null)).toBeNull();
});

test("priceOf joins per-guest prices and ignores a missing one", () => {
  expect(priceOf(page({}, undefined, "Gratis"))).toBe("Gratis");
  expect(priceOf(page({}, undefined, ["Voksne 100 kr.", "Børn 50 kr."]))).toBe("Voksne 100 kr.; Børn 50 kr.");
  expect(priceOf(page({}, undefined, false))).toBeNull();
});

test("placeOf splits the contact name into venue and address", () => {
  expect(placeOf("København, Testhallen", "Testvej 1")).toEqual({ venue: "Testhallen", address: "Testvej 1" });
  expect(placeOf("København", "Testplads")).toEqual({ venue: null, address: "Testplads" });
  expect(placeOf("Testhuset, Testvej 12, København", null)).toEqual({ venue: "Testhuset", address: "Testvej 12" });
  expect(placeOf("Frederiksberg", null)).toEqual({ venue: null, address: null });
  expect(placeOf(null, null)).toEqual({ venue: null, address: null });
});

describe("Copenhagen", () => {
  test("postcodes", () => {
    for (const p of ["1000", "1999", "2000", "2100", "2150", "2200", "2300", "2400", "2450", "2500", "2700", "2720"]) expect(isCphPostcode(p)).toBe(true);
    for (const p of ["2610", "2791", "2900", "999", "x"]) expect(isCphPostcode(p)).toBe(false);
  });
  test("a card's place", () => {
    for (const p of ["København", "Copenhagen", "Frederiksberg", "Testhuset, Testvej 1, København"]) expect(placeInCph(p)).toBe(true);
    for (const p of ["Dragør", "Lund", null]) expect(placeInCph(p)).toBe(false);
  });
  test("the postcode decides, then the place and district", () => {
    expect(inCph("København", { postcode: "2900", district: "Indre by" })).toBe(false);
    expect(inCph("Dragør", { postcode: "2100", district: null })).toBe(true);
    expect(inCph("København", { postcode: null, district: "Nørrebro" })).toBe(true);
    expect(inCph("København", { postcode: null, district: "Udenfor København" })).toBe(false);
    expect(inCph("Frederiksberg", { postcode: null, district: "Udenfor København" })).toBe(true);
  });
  test("a district outside the city names none", () => {
    expect(districtOf("Nørrebro")).toBe("Nørrebro");
    expect(districtOf("Udenfor København")).toBeNull();
    expect(districtOf(null)).toBeNull();
  });
});

test("slugOf knows the site's two URL forms and nothing else", () => {
  expect(slugOf("/eventkalender/test-marked")).toEqual({ slug: "test-marked", nested: true });
  expect(slugOf("/test-marked")).toEqual({ slug: "test-marked", nested: false });
  expect(slugOf("/test%20marked?language=da")).toEqual({ slug: "test marked", nested: false });
  expect(slugOf("/en/events/test-marked")).toBeNull();
  expect(slugOf("/eventkalender")).toBeNull();
  expect(slugOf("/")).toBeNull();
});

test("totalOf reads the list's result line", () => {
  expect(totalOf("Viser 1-12 af 20 resultater")).toBe(20);
  expect(totalOf(null)).toBeNull();
});
