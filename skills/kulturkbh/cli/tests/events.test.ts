import { describe, expect, test } from "bun:test";
import { absoluteUrl, areaOf, isFree, mergeSameEvents, postcodeBySlug, postcodeOf } from "../src/lib/events";

describe("postcodeOf", () => {
  test("takes the last four-digit number of the first text that has one", () => {
    expect(postcodeOf("Gade 12, 1415 København K")).toBe("1415");
    expect(postcodeOf("Vej 2000, 2100 København Ø")).toBe("2100");
    expect(postcodeOf(null, "Sted, 2635 Ishøj")).toBe("2635");
    expect(postcodeOf("", undefined)).toBeNull();
    expect(postcodeOf("Et museum")).toBeNull();
  });
});

describe("areaOf", () => {
  test("splits Københavns and Frederiksberg Kommune from the rest", () => {
    expect(areaOf("1415")).toBe("cph");
    expect(areaOf("2450")).toBe("cph");
    expect(areaOf("2700")).toBe("cph"); // Brønshøj
    expect(areaOf("2720")).toBe("cph"); // Vanløse
    expect(areaOf("0")).toBe("unknown");
    expect(areaOf("2000")).toBe("cph");
    expect(areaOf("1850")).toBe("cph");
    expect(areaOf("2635")).toBe("outside");
    expect(areaOf(null)).toBe("unknown");
  });
});

describe("isFree", () => {
  test("a word that says free", () => {
    expect(isFree("Gratis")).toBe(true);
    expect(isFree("Fri entré")).toBe(true);
    expect(isFree("Free")).toBe(true);
  });
  test("an amount", () => expect(isFree("120 kr.")).toBe(false));
  test("a pointer elsewhere or nothing", () => {
    expect(isFree("Se billetsiden")).toBeNull();
    expect(isFree(null)).toBeNull();
    expect(isFree("")).toBeNull();
  });
});

describe("absoluteUrl", () => {
  test("keeps an absolute link and resolves a relative one on the origin", () => {
    expect(absoluteUrl("https://example.org/e/1", "https://kulturkbh.dk")).toBe("https://example.org/e/1");
    expect(absoluteUrl("/side.html", "https://kulturkbh.dk")).toBe("https://kulturkbh.dk/side.html");
  });
});

describe("postcodeBySlug", () => {
  test("maps the slug in /kilder/<slug>.html to the postcode of the source's address", () => {
    const map = postcodeBySlug([
      { href: "/kilder/arken.html", name: "ARKEN", addr: "Skovvej 100, 2635 Ishøj" },
      { href: "/kilder/nomad.html", name: "Nomad", addr: null },
      { href: "https://kulturkbh.dk/kilder/dr.html", name: "DR", addr: "Emil Holms Kanal 20, 1432 København K" },
      { href: "/andet", name: "x", addr: "Vej 1, 2100 København Ø" },
    ]);
    expect(map.get("arken")).toBe("2635");
    expect(map.get("dr")).toBe("1432");
    expect(map.has("nomad")).toBe(false);
    expect(map.size).toBe(2);
  });
});

describe("mergeSameEvents", () => {
  const ev = (o: Partial<{ date: string; time: string | null; title: string; venue: string | null; url: string }>) => ({
    date: "2026-11-20", time: "19:00" as string | null, title: "Poetry Slam", venue: "A" as string | null, url: "https://x/a", ...o,
  });
  test("same date, time and normalised title become one with alsoAt for the others", () => {
    const out = mergeSameEvents([ev({}), ev({ title: "poetry  slam!", venue: "B", url: "https://x/b" }), ev({ title: "Other" })]);
    expect(out).toHaveLength(2);
    expect(out[0].alsoAt).toEqual([{ venue: "B", url: "https://x/b" }]);
    expect(out[0].url).toBe("https://x/a");
    expect(out[1].alsoAt).toEqual([]);
  });
  test("a different time or date keeps them apart; two null times are the same", () => {
    expect(mergeSameEvents([ev({}), ev({ time: "20:00" })])).toHaveLength(2);
    expect(mergeSameEvents([ev({}), ev({ date: "2026-11-21" })])).toHaveLength(2);
    expect(mergeSameEvents([ev({ time: null }), ev({ time: null, url: "https://x/b" })])).toHaveLength(1);
    expect(mergeSameEvents([ev({ time: null }), ev({})])).toHaveLength(2);
  });
});
