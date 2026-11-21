import { describe, expect, test } from "bun:test";
import * as N from "../normalise";
import { cacheKey } from "../fetch-day";

describe("normalise", () => {
  test("parsePrice reads kr. ranges and ignores pointers", () => {
    expect(N.parsePrice("120-250 kr.")).toEqual({ min: 120, max: 250 });
    expect(N.parsePrice("99,50 DKK")).toEqual({ min: 99.5, max: 99.5 });
    expect(N.parsePrice("Se billetsiden")).toEqual({ min: null, max: null });
    expect(N.parsePrice(null)).toEqual({ min: null, max: null });
  });

  test("kulturkbh: free is price 0, the type tells indoor, the id does not depend on the list position", () => {
    const row = { title: "Foredrag", date: "2026-11-21", time: "19:00:00", venue: "Biblioteket, Gade 1", price: null, free: true, type: "foredrag", url: "https://k" };
    const [a] = N.kulturkbh({ events: [row] }, "2026-11-21");
    const [b] = N.kulturkbh({ events: [{ ...row, title: "Andet" }, row] }, "2026-11-21").slice(1);
    expect(a!.id).toBe(b!.id);
    expect(a).toMatchObject({ source: "kulturkbh", time: "19:00", venue: "Biblioteket", address: "Biblioteket, Gade 1", priceMin: 0, free: true, indoor: true, url: "https://k" });
  });

  test("billetto: drops ongoing rows, keeps slots and the day's end time", () => {
    const rows = N.billetto({ events: [
      { id: "1", title: "A", startsAt: "2026-11-21T11:00:00", endsAt: "2026-11-21T13:30:00", price: 50, priceRange: "50-80 kr.", times: ["11:00", "11:30"], onSale: true },
      { id: "2", title: "Udstilling", ongoing: true, startsAt: "2026-11-01T10:00:00" },
    ] }, "2026-11-21");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "billetto:1", time: "11:00", endTime: "13:30", priceMin: 50, priceMax: 80, times: ["11:00", "11:30"] });
  });

  test("brugbyen: the audience group is on the row; two groups of the same event become one", () => {
    const e = { id: "9", title: "Spiludvikling", date: "2026-11-21", time: "10:00", timeMayDiffer: true };
    const merged = N.dedupe([...N.brugbyen({ events: [e] }, "2026-11-21", "børn"), ...N.brugbyen({ events: [e] }, "2026-11-21", "unge")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.audience).toEqual(["børn", "unge"]);
    expect(merged[0]!.extra.timeMayDiffer).toBe(true);
  });

  test("teaterbilletter: a show with an age limit and a price range, other dates dropped", () => {
    const rows = N.teaterbilletter({ shows: [
      { title: "Peter Pan", date: "2026-11-21", time: "14:00", venue: "Teatret", priceMinDKK: 100, priceMaxDKK: 300, ageFrom: 6, bookingUrl: "https://t", premiere: true },
      { title: "Anden dag", date: "2026-11-22", time: "14:00" },
    ] }, "2026-11-21");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "show", priceText: "100–300 kr.", priceMin: 100, ageFrom: 6, audience: ["børn"], indoor: true, url: "https://t", extra: { premiere: true } });
  });

  test("absalon: free events and the ude-af-huset category", () => {
    const [r] = N.absalon({ events: [{ title: "Fællesspisning", date: "2026-11-21", time: "18:00", free: false, price: "75 kr.", categories: ["ude-af-huset"] }] }, "2026-11-21");
    expect(r).toMatchObject({ priceMin: 75, indoor: false });
  });

  test("wannasport: one item per court with its times; the court name tells indoors", () => {
    const rows = N.wannasport({ sport: "Padel", venues: [{ venue: "Hal", area: "cph", courts: [
      { name: "Bane 1 indendørs", priceMinDKK: 200, priceMaxDKK: 320, times: ["10:00", "11:00"], url: "https://w" },
      { name: "Udendørs bane", priceMinDKK: 100, priceMaxDKK: 100, times: ["12:00"] },
    ] }] }, "2026-11-21", "padel");
    expect(rows.map((r) => [r.kind, r.indoor, r.priceMin, r.times])).toEqual([["slots", true, 200, ["10:00", "11:00"]], ["slots", false, 100, ["12:00"]]]);
    expect(rows[0]!.extra).toMatchObject({ sport: "padel", perCourt: true });
  });

  test("dmi: a forecast keeps the verdict and the hours", () => {
    const w = N.weatherDay({ verdict: { outdoor: "dry" }, day: { minTemp: 3, maxTemp: 6 }, warnings: { texts: ["x"] }, hours: [{ time: "10:00", temp: 4, description: "skyet", precipMm: 0, extra: 1 }] }, null);
    expect(w.day).toEqual({ verdict: { outdoor: "dry" }, day: { minTemp: 3, maxTemp: 6 }, text: null, warnings: ["x"], hours: [{ time: "10:00", temp: 4, description: "skyet", precipMm: 0 }] });
    expect(w.evening).toBeNull();
  });
});

describe("cacheKey", () => {
  test("source and day; brugbyen adds the audience", () => {
    expect(cacheKey("kultunaut", "2026-11-21")).toBe("kultunaut|2026-11-21");
    expect(cacheKey("brugbyen", "2026-11-21", { audience: "børn" })).toBe("brugbyen|2026-11-21|børn");
    expect(cacheKey("brugbyen", "2026-11-21")).toBe("brugbyen|2026-11-21|all");
  });
});
