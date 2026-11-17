import { describe, expect, test } from "bun:test";
import forecast from "../src/commands/forecast";
import getForecast from "../src/operations/getForecast";
import getTexts from "../src/operations/getTexts";
import { Failure } from "../src/runtime/envelope";
import { copenhagenToday } from "../src/lib/weather";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = copenhagenToday();

function series() {
  const rows = [];
  for (let day = 0; day < 4; day++) {
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      const wet = day === 1 && h >= 14 && h <= 20;
      rows.push({
        time: "x",
        localTimeIso: `${addDays(today, day)}T${hh}:00:00+01:00`,
        temp: 4 + h / 4,
        symbol: wet ? 63 : h < 6 ? 103 : 3,
        precip1: wet ? 0.6 : 0,
        precip3: null,
        precip6: null,
        precipType: "regn",
        windSpeed: 4,
        windGust: 9,
        prec90: h === 9 ? 0.4 : 0,
      });
    }
  }
  return rows;
}

const fake = (opts: { warnings?: unknown[]; calls?: Record<string, unknown>[] } = {}) =>
  (async (op: unknown, vars: Record<string, unknown>) => {
    opts.calls?.push(vars);
    if (op === getForecast)
      return {
        city: "København",
        timezone: "Europe/Copenhagen",
        sunrise: "730",
        sunset: "1600",
        timeserie: series(),
        aggData: [0, 1, 2, 3].map((n) => ({ localTimeIso: `${addDays(today, n)}T00:00:00+01:00`, minTemp: n, meanTemp: n + 2, maxTemp: n + 4, precipSum: n / 2 })),
      };
    if (op === getTexts) return { day0: "I dag", day1: "I morgen", day2: "Overmorgen", day3: "none", day4: "", warnings: opts.warnings ?? [] };
    throw new Error("unexpected op");
  }) as any;

const run = (args: Record<string, unknown>, o?: Parameters<typeof fake>[0]) =>
  forecast.run(forecast.args.parse(args), { call: fake(o), session: { ids: {} }, note() {} }) as Promise<any>;

describe("forecast", () => {
  test("defaults to today, the whole day, Copenhagen", async () => {
    const calls: Record<string, unknown>[] = [];
    const r = await run({}, { calls });
    expect(r.place).toBe("København");
    expect(r.date).toBe(today);
    expect(r.window).toEqual({ from: "00:00", to: "23:59" });
    expect(r.hours).toHaveLength(24);
    expect(r.text).toBe("I dag");
    expect(r.sunrise).toBe("07:30");
    expect(r.sunset).toBe("16:00");
    expect(r.day).toEqual({ minTemp: 0, maxTemp: 4, meanTemp: 2, precipSum: 0 });
    expect(calls).toContainEqual({ cmd: "llj", id: "2618425" });
    expect(calls).toContainEqual({ id: "2618425" });
  });

  test("a wet evening: window, verdict, text, no sun times", async () => {
    const r = await run({ date: addDays(today, 1), fromTime: "14:00", toTime: "22:00" });
    expect(r.hours).toHaveLength(9);
    expect(r.hours[0]).toMatchObject({ time: "14:00", description: "regn", symbol: 63, precipMm: 0.6, precipType: "regn", windMs: 4, gustMs: 9 });
    expect(r.verdict.outdoor).toBe("wet");
    expect(r.text).toBe("I morgen");
    expect(r.sunrise).toBeNull();
    expect(r.sunset).toBeNull();
    expect(r.day.maxTemp).toBe(5);
  });

  test("night symbols are described; rainChanceNote only for a dry hour with prec90", async () => {
    const r = await run({});
    expect(r.hours[0].description).toBe("skyet");
    expect(r.hours[9].rainChanceNote).toBe("possible rain");
    expect(r.hours[10].rainChanceNote).toBeNull();
  });

  test("text is null beyond DMI's text days; day is null without aggData", async () => {
    const r = await run({ date: addDays(today, 3) });
    expect(r.text).toBeNull();
  });

  test("DMI's placeholder text 'none' is no text", async () => {
    expect((await run({ date: addDays(today, 3) })).text).toBeNull();
  });

  test("numbers are rounded", async () => {
    const r = await run({});
    expect(r.hours[1].temp).toBe(4.3);
    expect(r.verdict.minTemp).toBe(4);
  });

  test("warnings: count and their text", async () => {
    const r = await run({}, { warnings: [{ headline: "Kraftig vind" }, { other: 1 }] });
    expect(r.warnings).toEqual({ count: 2, texts: ["Kraftig vind"] });
  });

  test("dates DMI does not cover are input failures naming the covered dates", async () => {
    for (const date of [addDays(today, -1), addDays(today, 20)]) {
      const e = await run({ date }).catch((x) => x);
      expect(e).toBeInstanceOf(Failure);
      expect(e.kind).toBe("input");
      expect(e.message).toContain(today);
      expect(e.message).toContain(addDays(today, 3));
    }
  });

  test("to-time before from-time is an input failure", async () => {
    const e = await run({ fromTime: "20:00", toTime: "18:00" }).catch((x) => x);
    expect(e.kind).toBe("input");
  });

  test("placeId must be digits", () => {
    expect(() => forecast.args.parse({ placeId: "abc" })).toThrow();
  });
});
