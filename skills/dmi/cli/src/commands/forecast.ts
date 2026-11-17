import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import getForecast from "../operations/getForecast";
import getTexts from "../operations/getTexts";
import { clockFromDigits, copenhagenToday, round, daysBetween, describeSymbol, localClock, localDate, precipOf, rowsInWindow, verdict } from "../lib/weather";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const COPENHAGEN = "2618425";

// Warnings are untyped on the site; show a text when an item carries one.
const warningText = (w: unknown): string | null => {
  if (typeof w === "string") return w;
  if (!w || typeof w !== "object") return null;
  for (const k of ["text", "title", "headline"]) {
    const v = (w as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
};

const roundedVerdict = (rows: Parameters<typeof verdict>[0]) => {
  const v = verdict(rows);
  return { ...v, minTemp: round(v.minTemp, 1), maxTemp: round(v.maxTemp, 1), maxGust: round(v.maxGust, 1)! };
};

export default defineCommand({
  name: "forecast",
  summary: "DMI's weather forecast for a day or a few hours, up to about 10 days ahead, hour by hour, with a dry/showers/wet verdict (outdoor or indoor?), temperature, wind, DMI's own text and warnings",
  args: z.object({
    date: isoDate.optional().describe("the day, YYYY-MM-DD (default: today in Copenhagen)"),
    fromTime: hhmm.optional().describe("start of the window, HH:MM (default: the whole day)"),
    toTime: hhmm.optional().describe("end of the window, HH:MM (default: the whole day)"),
    placeId: z.string().regex(/^\d+$/, "a GeoNames id, digits only").default(COPENHAGEN).describe("GeoNames id of the place (default 2618425, Copenhagen; Frederiksberg uses Copenhagen's)"),
  }),
  uses: [getForecast, getTexts],
  run: async (args, { call }) => {
    if (args.fromTime && args.toTime && args.toTime < args.fromTime) inputFailure("--to-time is before --from-time.");
    const today = copenhagenToday();
    const date = args.date ?? today;
    const [f, texts] = await Promise.all([call(getForecast, { cmd: "llj", id: args.placeId }), call(getTexts, { id: args.placeId })]);

    const dates = [...new Set(f.timeserie.map((r) => localDate(r.localTimeIso)))].sort();
    const last = dates[dates.length - 1] ?? today;
    if (date < today || date > last) inputFailure(`--date ${date} is outside DMI's forecast: it covers ${today} to ${last}.`);

    const rows = rowsInWindow(f.timeserie, date, args.fromTime, args.toTime);
    const agg = f.aggData.find((a) => localDate(a.localTimeIso) === date);
    const n = daysBetween(today, date);
    const raw = n >= 0 && n <= 5 ? ((texts as Record<string, string | null | undefined>)[`day${n}`] ?? null) : null;
    // DMI fills a day it has no text for with "none" or "".
    const text = raw && raw.trim() && raw.trim().toLowerCase() !== "none" ? raw : null;
    const warnings = texts.warnings ?? [];
    return {
      place: f.city,
      date,
      window: { from: args.fromTime ?? "00:00", to: args.toTime ?? "23:59" },
      verdict: roundedVerdict(rows),
      day: agg ? { minTemp: round(agg.minTemp, 1), maxTemp: round(agg.maxTemp, 1), meanTemp: round(agg.meanTemp, 1), precipSum: round(agg.precipSum, 1) } : null,
      text,
      warnings: { count: warnings.length, texts: warnings.map(warningText).filter((t): t is string => t !== null) },
      sunrise: date === today ? clockFromDigits(f.sunrise) : null,
      sunset: date === today ? clockFromDigits(f.sunset) : null,
      hours: rows.map((r) => {
        const precipMm = round(precipOf(r), 2)!;
        return {
          time: localClock(r.localTimeIso),
          temp: round(r.temp, 1),
          description: describeSymbol(r.symbol),
          symbol: r.symbol ?? null,
          precipMm,
          precipType: r.precipType ?? null,
          windMs: round(r.windSpeed, 1),
          gustMs: round(r.windGust, 1),
          rainChanceNote: (r.prec90 ?? 0) > 0 && precipMm === 0 ? "possible rain" : null,
        };
      }),
    };
  },
});
