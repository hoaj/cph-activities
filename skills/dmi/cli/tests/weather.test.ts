import { describe, expect, test } from "bun:test";
import { clockFromDigits, describeSymbol, round, isNight, localClock, localDate, precipOf, rowsInWindow, verdict, type Row } from "../src/lib/weather";

const row = (over: Partial<Row> = {}): Row => ({
  localTimeIso: "2026-11-21T12:00:00+01:00",
  temp: 6,
  symbol: 3,
  precip1: 0,
  precip3: null,
  precip6: null,
  precipType: "regn",
  windGust: 5,
  ...over,
});

describe("symbols", () => {
  test("describes the codes and removes the night offset", () => {
    expect(describeSymbol(1)).toBe("klart");
    expect(describeSymbol(2)).toBe("let skyet");
    expect(describeSymbol(3)).toBe("skyet");
    expect(describeSymbol(45)).toBe("tåge");
    expect(describeSymbol(63)).toBe("regn");
    expect(describeSymbol(73)).toBe("sne");
    expect(describeSymbol(81)).toBe("byger");
    expect(describeSymbol(97)).toBe("torden");
    expect(describeSymbol(101)).toBe("klart");
    expect(describeSymbol(160)).toBe("regn");
  });
  test("unknown codes have no description", () => {
    expect(describeSymbol(42)).toBeNull();
    expect(describeSymbol(null)).toBeNull();
  });
  test("isNight is the +100 offset", () => {
    expect(isNight(103)).toBe(true);
    expect(isNight(3)).toBe(false);
  });
});

describe("local time", () => {
  test("takes the local part without conversion", () => {
    expect(localDate("2026-11-21T23:00:00+01:00")).toBe("2026-11-21");
    expect(localClock("2026-11-21T23:30:00+01:00")).toBe("23:30");
    expect(localDate("2026-07-01T00:00:00+02:00")).toBe("2026-07-01");
  });
});

describe("rowsInWindow", () => {
  const series = [
    row({ localTimeIso: "2026-11-20T23:00:00+01:00" }),
    row({ localTimeIso: "2026-11-21T09:00:00+01:00" }),
    row({ localTimeIso: "2026-11-21T14:00:00+01:00" }),
    row({ localTimeIso: "2026-11-21T22:00:00+01:00" }),
    row({ localTimeIso: "2026-11-22T01:00:00+01:00" }),
  ];
  test("whole day", () => {
    expect(rowsInWindow(series, "2026-11-21")).toHaveLength(3);
  });
  test("from and to are inclusive", () => {
    expect(rowsInWindow(series, "2026-11-21", "14:00", "22:00").map((r) => localClock(r.localTimeIso))).toEqual(["14:00", "22:00"]);
    expect(rowsInWindow(series, "2026-11-21", "14:01")).toHaveLength(1);
    expect(rowsInWindow(series, "2026-11-21", undefined, "13:59")).toHaveLength(1);
  });
});

describe("precipOf", () => {
  test("first non-null of precip1, precip3, precip6, else 0", () => {
    expect(precipOf(row({ precip1: 0.4 }))).toBe(0.4);
    expect(precipOf(row({ precip1: null, precip3: 1.2 }))).toBe(1.2);
    expect(precipOf(row({ precip1: null, precip3: null, precip6: 2 }))).toBe(2);
    expect(precipOf(row({ precip1: null }))).toBe(0);
    expect(precipOf(row({ precip1: 0, precip3: 5 }))).toBe(0);
  });
});

describe("verdict", () => {
  const dry = [row(), row({ temp: 9, windGust: 7 })];
  test("dry", () => {
    expect(verdict(dry)).toEqual({ outdoor: "dry", rainMm: 0, wetHours: 0, dryHours: 2, minTemp: 6, maxTemp: 9, maxGust: 7, cold: false, windy: false, snow: false });
  });
  test("showers: a little rain in few rows", () => {
    const v = verdict([row({ precip1: 0.5 }), row(), row(), row()]);
    expect(v.outdoor).toBe("showers");
    expect(v.wetHours).toBe(1);
    expect(v.dryHours).toBe(3);
    expect(v.rainMm).toBe(0.5);
  });
  test("a trace of 0.2 mm or less stays dry", () => {
    expect(verdict([row({ precip1: 0.2 }), row()]).outdoor).toBe("dry");
  });
  test("wet: 2 mm or more in total", () => {
    expect(verdict([row({ precip1: 2 }), row(), row(), row()]).outdoor).toBe("wet");
  });
  test("wet: rain in more than half the rows", () => {
    expect(verdict([row({ precip1: 0.3 }), row({ precip1: 0.3 }), row({ precip1: 0.3 }), row()]).outdoor).toBe("wet");
  });
  test("a row at exactly 0.1 mm is not wet", () => {
    expect(verdict([row({ precip1: 0.1 }), row({ precip1: 0.1 })]).wetHours).toBe(0);
  });
  test("cold, windy and snow flags", () => {
    const v = verdict([row({ temp: 4, windGust: 12, precipType: "sne", precip1: 0.5 }), row({ temp: 5 })]);
    expect(v.cold).toBe(true);
    expect(v.windy).toBe(true);
    expect(v.snow).toBe(true);
    expect(v.minTemp).toBe(4);
    expect(verdict([row({ temp: 5 })]).cold).toBe(false);
    expect(verdict([row({ precipType: "sne", precip1: 0 })]).snow).toBe(false);
  });
  test("null gusts do not count", () => {
    expect(verdict([row({ windGust: null })]).maxGust).toBe(0);
  });
  test("no rows is dry with null temperatures", () => {
    const v = verdict([]);
    expect(v.outdoor).toBe("dry");
    expect(v.minTemp).toBeNull();
    expect(v.maxTemp).toBeNull();
  });
});

describe("clockFromDigits and round", () => {
  test("DMI writes sunrise as H:MM digits without a colon", () => {
    expect(clockFromDigits("747")).toBe("07:47");
    expect(clockFromDigits("1600")).toBe("16:00");
    expect(clockFromDigits("07:47")).toBe("07:47");
    expect(clockFromDigits(null)).toBeNull();
    expect(clockFromDigits("soon")).toBeNull();
  });
  test("round", () => {
    expect(round(0.00022888184, 2)).toBe(0);
    expect(round(5.476166, 1)).toBe(5.5);
    expect(round(null, 1)).toBeNull();
  });
});
