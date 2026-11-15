import { describe, expect, test } from "bun:test";
import { apiDate, bookingUrl, clock, kroner } from "../src/lib/links";

describe("kroner", () => {
  test("whole kroner, as wannasport averages prices into fractions", () => {
    expect(kroner(186.66666666666666)).toBe(187);
    expect(kroner(110)).toBe(110);
    expect(kroner(0)).toBe(0);
  });
  test("no price stays null", () => {
    expect(kroner(null)).toBeNull();
    expect(kroner(undefined)).toBeNull();
  });
});

describe("bookingUrl", () => {
  test("the product page for a venue and court", () => {
    expect(bookingUrl("some-venue", "padelbane-inde")).toBe("https://www.wannasport.com/dnk/da/product/some-venue/padelbane-inde");
  });
  test("escapes what is not a plain slug", () => {
    expect(bookingUrl("a b", "c/d")).toBe("https://www.wannasport.com/dnk/da/product/a%20b/c%2Fd");
  });
});

describe("clock", () => {
  test("HH:MM from a local date-time", () => {
    expect(clock("2026-11-16T07:30:00")).toBe("07:30");
    expect(clock("2026-11-16T19:00:00.000Z")).toBe("19:00");
  });
  test("null without a time", () => expect(clock("2026-11-16")).toBeNull());
});

describe("apiDate", () => {
  test("the day's midnight in ISO UTC, as the page sends it", () => {
    expect(apiDate("2026-11-16")).toBe("2026-11-16T00:00:00.000Z");
  });
});
