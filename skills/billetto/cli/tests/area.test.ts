import { describe, expect, test } from "bun:test";
import { areaOf, dayBoundary } from "../src/lib/area";

describe("areaOf", () => {
  test("Københavns Kommune postcodes", () => {
    for (const p of ["1000", "1440", "1799", "2100", "2150", "2200", "2300", "2400", "2450", "2500", "2700", "2720"]) expect(areaOf(p)).toBe("cph");
  });
  test("Frederiksberg and other municipalities are outside", () => {
    for (const p of ["1800", "1999", "2000", "2635", "2770", "3050"]) expect(areaOf(p)).toBe("outside");
  });
  test("no postcode or not a number is unknown", () => {
    expect(areaOf(null)).toBe("unknown");
    expect(areaOf("abc")).toBe("unknown");
    expect(areaOf("0")).toBe("unknown");
    expect(areaOf("999")).toBe("unknown");
  });
});

describe("dayBoundary", () => {
  test("winter day: Copenhagen is UTC+1", () => {
    expect(dayBoundary("2026-11-15", false)).toBe(Date.parse("2026-11-14T23:00:00Z") / 1000);
    expect(dayBoundary("2026-11-15", true)).toBe(Date.parse("2026-11-15T23:00:00Z") / 1000);
  });
  test("summer day: Copenhagen is UTC+2", () => {
    expect(dayBoundary("2027-07-01", false)).toBe(Date.parse("2027-06-30T22:00:00Z") / 1000);
    expect(dayBoundary("2027-07-01", true)).toBe(Date.parse("2027-07-01T22:00:00Z") / 1000);
  });
  test("the day clocks go back keeps its own midnight and the next one", () => {
    // 2026-10-25: 03:00 CEST becomes 02:00 CET, so the day is 25 hours long.
    expect(dayBoundary("2026-10-25", false)).toBe(Date.parse("2026-10-24T22:00:00Z") / 1000);
    expect(dayBoundary("2026-10-25", true)).toBe(Date.parse("2026-10-25T23:00:00Z") / 1000);
  });
  test("does not depend on the machine's time zone", () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(dayBoundary("2026-11-15", false)).toBe(Date.parse("2026-11-14T23:00:00Z") / 1000);
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
