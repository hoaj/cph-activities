import { describe, expect, test } from "bun:test";
import { CATEGORY_NAMES, categoriesOf, decodeEntities, isFree, priceOf } from "../src/lib/events";

describe("decodeEntities", () => {
  test("named and numeric entities", () => {
    expect(decodeEntities("Quiz &amp; Bingo &ndash; fredag &mdash; &quot;x&quot; &#39;y&#39; a&nbsp;b")).toBe(`Quiz & Bingo – fredag — "x" 'y' a b`);
    expect(decodeEntities("&oslash;&aring;&aelig;&Oslash;&Aring;&AElig; &hellip; &lt;b&gt;")).toBe("øåæØÅÆ … <b>");
    expect(decodeEntities("&#233; &#x1F600; &#xe9;")).toBe("é 😀 é");
  });
  test("unknown entities and plain text stay", () => {
    expect(decodeEntities("&bogus; plain")).toBe("&bogus; plain");
    expect(decodeEntities("&#99999999;")).toBe("&#99999999;");
  });
  test("a decoded ampersand is not decoded twice", () => {
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
  });
});

describe("categoriesOf", () => {
  test("slugs from event-category classes", () => {
    expect(categoriesOf(["fc-event", "event-category-dans", "event-category-boern-familie"])).toEqual(["dans", "boern-familie"]);
    expect(categoriesOf(null)).toEqual([]);
    expect(categoriesOf(undefined)).toEqual([]);
  });
  test("names", () => {
    expect(CATEGORY_NAMES["boern-familie"]).toBe("Børn & familie");
    expect(CATEGORY_NAMES["banko-quiz-spil"]).toBe("Banko, quiz & spil");
    expect(Object.keys(CATEGORY_NAMES)).toHaveLength(14);
  });
});

describe("priceOf and isFree", () => {
  test("amounts", () => {
    expect(priceOf("Billet 150 kr. ved døren")).toBe("150 kr.");
    expect(priceOf("Pris: kr 75")).toBe("75 kr.");
    expect(priceOf("DKK 200 pr. person")).toBe("200 kr.");
    expect(isFree("150 kr.")).toBe(false);
  });
  test("free", () => {
    expect(priceOf("Gratis for alle")).toBe("gratis");
    expect(priceOf("Free entry")).toBe("gratis");
    expect(isFree("Gratis for alle")).toBe(true);
  });
  test("a price wins over free when both are said", () => {
    expect(priceOf("Gratis at komme, mad 80 kr.")).toBe("80 kr.");
    expect(isFree("Gratis at komme, mad 80 kr.")).toBe(false);
  });
  test("nothing", () => {
    expect(priceOf("En hyggelig aften")).toBeNull();
    expect(isFree("En hyggelig aften")).toBeNull();
    expect(isFree(null)).toBeNull();
    expect(priceOf(undefined)).toBeNull();
  });
});

import { resolveCategories, selectEvents, type Occurrence } from "../src/lib/events";

const occ = (o: Partial<Occurrence> & { title: string; start: string }): Occurrence => ({ end: null, details: null, permalink: "https://absaloncph.dk/begivenhed/x/", postId: 1, classNames: [], ...o });

describe("resolveCategories", () => {
  test("slug, label, case and comma lists", () => {
    expect(resolveCategories(["Dans", "boern-familie,YOGA", "Børn & familie"])).toEqual({ slugs: ["dans", "boern-familie", "yoga"] });
    expect(resolveCategories(["fest & koncert"])).toEqual({ slugs: ["fest-koncert"] });
  });
  test("an unknown value is reported", () => {
    expect(resolveCategories(["nonsense", "dans"])).toEqual({ unknown: ["nonsense"] });
  });
});

describe("selectEvents", () => {
  const events = [
    occ({ title: "Sen &amp; fed", start: "2026-11-21T20:00:00", end: "2026-11-21T23:30:00", classNames: ["event-category-fest-koncert"], details: "Billet 120 kr." }),
    occ({ title: "Legestue", start: "2026-11-21T10:00:00", classNames: ["event-category-boern-familie"], details: "Gratis" }),
    occ({ title: "Fællesspisning", start: "2026-11-21T18:00:00", end: "2026-11-21T20:00:00", classNames: ["event-category-spisning"], details: "Kom og spis. 60 kr." }),
    occ({ title: "Udflugt", start: "2026-11-22T11:00:00", classNames: ["event-category-ude-af-huset"] }),
    occ({ title: "Gammel", start: "2026-11-01T11:00:00" }),
  ];
  const base = { from: "2026-11-21", to: "2026-11-22", excludeKids: false, free: false, limit: 40 };

  test("date range, sorted, decoded, shaped", () => {
    const { total, events: out } = selectEvents(events, base);
    expect(total).toBe(4);
    expect(out.map((e) => e.title)).toEqual(["Legestue", "Fællesspisning", "Sen & fed", "Udflugt"]);
    expect(out[2]).toMatchObject({ date: "2026-11-21", time: "20:00", endTime: "23:30", categories: ["Fest & koncert"], price: "120 kr.", free: false, venue: "Folkehuset Absalon", address: "Sønder Boulevard 73, 1720 København V", area: "cph" });
    expect(out[3]).toMatchObject({ venue: null, address: null, area: "unknown", endTime: null });
  });
  test("filters", () => {
    expect(selectEvents(events, { ...base, excludeKids: true }).events.map((e) => e.title)).not.toContain("Legestue");
    expect(selectEvents(events, { ...base, free: true }).events.map((e) => e.title)).toEqual(["Legestue"]);
    expect(selectEvents(events, { ...base, categories: ["spisning"] }).events).toHaveLength(1);
    expect(selectEvents(events, { ...base, fromTime: "18:00" }).events.map((e) => e.time)).toEqual(["18:00", "20:00"]);
    expect(selectEvents(events, { ...base, toTime: "11:00" }).events.map((e) => e.title)).toEqual(["Legestue", "Udflugt"]);
    expect(selectEvents(events, { ...base, query: "kom spis" }).events.map((e) => e.title)).toEqual(["Fællesspisning"]);
  });
  test("limit cuts, total counts all", () => {
    const r = selectEvents(events, { ...base, limit: 2 });
    expect(r.total).toBe(4);
    expect(r.events).toHaveLength(2);
  });
  test("description is the first 200 characters, decoded", () => {
    const r = selectEvents([occ({ title: "T", start: "2026-11-21T10:00:00", details: "a&amp;b" + "x".repeat(300) })], base);
    expect(r.events[0].description).toHaveLength(200);
    expect(r.events[0].description!.startsWith("a&bx")).toBe(true);
  });
});

describe("categoryCounts", () => {
  test("counts occurrences from a date on", async () => {
    const { categoryCounts } = await import("../src/lib/events");
    const c = categoryCounts([occ({ title: "a", start: "2026-11-21T10:00:00", classNames: ["event-category-dans"] }), occ({ title: "b", start: "2026-11-22T10:00:00", classNames: ["event-category-dans", "event-category-yoga"] }), occ({ title: "c", start: "2026-01-01T10:00:00", classNames: ["event-category-dans"] })], "2026-11-21");
    expect(c).toEqual([{ slug: "dans", name: "Dans", count: 2 }, { slug: "yoga", name: "Yoga", count: 1 }]);
  });
});
