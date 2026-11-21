// get_weather: the dmi forecast for a day (or a window of it): verdict, temperatures, hours.
import { z } from "zod";
import { readWeather } from "../../planner/weather";
import { tmin } from "../../planner/text";
import { ToolInputError, clock, compact, okWith, copenhagenToday, isoDate, notPast, notesField, ok, sourcesField, type ToolDeps } from "./common";
import { loadDaysFor } from "./days";

export const getWeatherInput = {
  date: isoDate("date").describe("The day, YYYY-MM-DD. DMI forecasts about 10 days ahead."),
  from: clock("from").optional().describe("Start of a window within the day, HH:MM (from 17:00 on, the verdict is for the evening)."),
  to: clock("to").optional().describe("End of the window, HH:MM."),
};
const Args = z.object(getWeatherInput);

export const getWeatherOutput = {
  date: z.string(),
  available: z.boolean().describe("false when DMI has no forecast for this date or the source failed."),
  line: z.string().optional().describe("One Danish line, e.g. 'Lørdag: 4-6 grader, tørt, koldt'."),
  verdict: z.object({
    outdoor: z.enum(["dry", "showers", "wet"]), rainMm: z.number().optional(), minTemp: z.number().optional(), maxTemp: z.number().optional(), maxGust: z.number().optional(),
    cold: z.boolean().optional(), windy: z.boolean().optional(), snow: z.boolean().optional(),
  }).optional().describe("outdoor: whether outdoor plans are fine (dry), risky (showers) or poor (wet)."),
  text: z.string().optional().describe("DMI's own text."),
  warnings: z.array(z.string()).optional(),
  hours: z.array(z.object({ time: z.string(), temp: z.number().optional(), description: z.string().optional(), precipMm: z.number().optional() })).optional(),
  sources: sourcesField,
  notes: notesField,
};

export async function getWeather(deps: ToolDeps, a: z.infer<typeof Args>) {
  const today = (deps.today ?? copenhagenToday)();
  notPast(a.date, today, "date");
  if (a.from && a.to && a.to < a.from) throw new ToolInputError(`to (${a.to}) is before from (${a.from}).`);
  const loaded = await loadDaysFor(deps.cache, [a.date], ["dmi"]);
  const evening = !!a.from && tmin(a.from)! >= 17 * 60;
  const wx = readWeather(loaded.days, a.date, evening);
  const w = loaded.days.weather[a.date];
  const f = w && ((evening && w.evening) || w.day);
  if (!wx.known || !f) return ok({ date: a.date, available: false, sources: loaded.sources, notes: [...loaded.notes, `No forecast for ${a.date}: DMI forecasts about 10 days ahead, or the source failed.`] });
  const from = tmin(a.from) ?? 0;
  const to = tmin(a.to) ?? 24 * 60;
  const hours = f.hours.filter((h) => tmin(h.time)! >= from && tmin(h.time)! <= to);
  const day = f.day ?? {};
  const v = f.verdict;
  return okWith(compact({
    date: a.date, available: true, line: wx.line,
    verdict: { outdoor: v.outdoor, rainMm: v.rainMm, minTemp: day.minTemp ?? v.minTemp, maxTemp: day.maxTemp ?? v.maxTemp, maxGust: v.maxGust, cold: v.cold || undefined, windy: v.windy || undefined, snow: v.snow || undefined },
    text: f.text ?? undefined, warnings: f.warnings, hours,
  }), loaded.sources, [...loaded.notes, ...((a.from || a.to) && !evening ? ["The verdict covers the whole day; the hours are the window."] : [])]);
}
