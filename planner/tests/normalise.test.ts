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

describe("descriptions", () => {
  const D = "2026-11-28";
  test("cleaned: entities decoded, tags and whitespace collapsed", () => {
    const [r] = N.kultunaut({ events: [{ id: "1", title: "T", date: D, time: "10:00", genre: "Børn", description: "  Tr&aelig;f os &amp; spis &#8211; &quot;gratis&quot;&nbsp;kage\n\n<b>kl.</b>   10 &#x2013; 12  " }] }, D);
    expect(r!.extra.description).toBe('Træf os & spis – "gratis" kage kl. 10 – 12');
  });

  test("cut at a word boundary with an ellipsis, 300 characters at most", () => {
    const long = Array.from({ length: 80 }, (_, i) => `ord${i}`).join(" ");
    const [r] = N.absalon({ events: [{ title: "A", date: D, time: "10:00", description: long }] }, D);
    const d = r!.extra.description!;
    expect(d.length).toBeLessThanOrEqual(300);
    expect(d.length).toBeGreaterThan(250);
    expect(d.endsWith("…")).toBe(true);
    expect(long.startsWith(d.slice(0, -1))).toBe(true);
    expect(long[d.length - 1]).toBe(" "); // the cut fell on a space, not inside a word
    const exactly = "x".repeat(300);
    expect(N.absalon({ events: [{ title: "A", date: D, time: "10:00", description: exactly }] }, D)[0]!.extra.description).toBe(exactly);
  });

  test("an empty or missing description is absent, never an empty string", () => {
    const [r] = N.kulturkbh({ events: [{ title: "A", date: D, time: "10:00", description: "  ", type: "film" }] }, D);
    expect(r!.extra.description).toBeUndefined();
  });

  test("kulturkbh: description, category, venue, price text, free", () => {
    const [r] = N.kulturkbh({ events: [{ date: D, time: "13:00", type: "udstilling", title: "Stencilworkshop", description: "Lav din egen streetart.", venue: "Københavns Museum", price: "Se billetsiden", free: null, url: "https://k" }] }, D);
    expect(r).toMatchObject({ venue: "Københavns Museum", priceText: "Se billetsiden", free: null, categories: ["udstilling"], extra: { description: "Lav din egen streetart." } });
  });

  test("billetto: description, category and subcategory, venue, price range", () => {
    const [r] = N.billetto({ events: [{ id: "5", title: "Quiz", startsAt: `${D}T19:00:00`, description: "Pubquiz &amp; øl.", category: "Music", subcategory: "Quiz", venue: "Baren", priceRange: "50-80 kr.", price: 50, free: false }] }, D);
    expect(r).toMatchObject({ venue: "Baren", priceText: "50-80 kr.", free: false, categories: ["Music", "Quiz"], extra: { description: "Pubquiz & øl." } });
  });

  test("kultunaut: description, genres as categories, children's genre as audience", () => {
    const [r] = N.kultunaut({ events: [{ id: "2", title: "Toddlerhold", date: D, time: "08:00", genre: "Andet motionstilbud, Børn", description: "Begynder 3-6 år.", venue: "Skatepark" }] }, D);
    expect(r).toMatchObject({ categories: ["Andet motionstilbud", "Børn"], audience: ["børn"], venue: "Skatepark", extra: { description: "Begynder 3-6 år." } });
  });

  test("absalon: description, categories, venue, price", () => {
    const [r] = N.absalon({ events: [{ title: "Yoga", date: D, time: "09:30", categories: ["Bevægelse", "Yoga"], price: "75 kr.", free: false, venue: "Folkehuset Absalon", description: "Alle niveauer." }] }, D);
    expect(r).toMatchObject({ categories: ["Bevægelse", "Yoga"], venue: "Folkehuset Absalon", priceText: "75 kr.", extra: { description: "Alle niveauer." } });
  });

  test("teaterbilletter: teaser (or subtitle) and description joined, genre, age, audience, price", () => {
    const row = { title: "Peter Pan", category: "Teater", subCategory: "Børneteater", date: D, time: "14:00", venue: "Teatret", priceMinDKK: 100, priceMaxDKK: 300, ageFrom: 5, url: "https://t" };
    const [a] = N.teaterbilletter({ shows: [{ ...row, teaser: "Et flyvende eventyr", description: "Peter tager Wendy med til Ønskeland." }] }, D);
    expect(a).toMatchObject({ categories: ["Teater", "Børneteater"], audience: ["børn"], ageFrom: 5, priceText: "100–300 kr.", free: false, extra: { description: "Et flyvende eventyr Peter tager Wendy med til Ønskeland." } });
    const [b] = N.teaterbilletter({ shows: [{ ...row, subtitle: "Musical" }] }, D);
    expect(b!.extra.description).toBe("Musical");
    expect(N.teaterbilletter({ shows: [row] }, D)[0]!.extra.description).toBeUndefined();
  });

  test("kglteater: description, genre, venue, age, price", () => {
    const [r] = N.kglteater({ shows: [{ title: "Evita", genre: "Musical", date: D, time: "12:00", stage: "Operaen", venue: "Det Kongelige Teater", priceMinDKK: 200, ageFrom: 12, description: "Musical om Eva Peron." }] }, D);
    expect(r).toMatchObject({ categories: ["Musical"], venue: "Operaen", priceText: "fra 200 kr.", ageFrom: 12, extra: { description: "Musical om Eva Peron." } });
  });

  test("visitorservice: description, category, venue, price, free", () => {
    const [r] = N.visitorservice({ markets: [{ id: "1", name: "Julemarked", price: "Gratis", free: true, venue: "Remisen", description: "Julemarked med håndværk og gløgg.", days: [{ date: D, time: "10:00", endTime: "17:00" }] }] }, D);
    expect(r).toMatchObject({ categories: ["Julemarked"], venue: "Remisen", priceText: "Gratis", free: true, extra: { description: "Julemarked med håndværk og gløgg." } });
  });

  test("brugbyen: the list has no description, so there is none", () => {
    const [r] = N.brugbyen({ events: [{ id: "9", title: "Åben hal", venue: "Korsgadehallen", date: D, time: "09:00", ribbon: "Gratis", dateText: "Lør. 28. nov." }] }, D, "børn");
    expect(r!.extra.description).toBeUndefined();
    expect(r).toMatchObject({ venue: "Korsgadehallen", audience: ["børn"] });
  });
});
