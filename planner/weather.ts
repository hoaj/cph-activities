import type { PlannerDays, WeatherVerdict } from "./types";
import { cap, dayName } from "./text";

export interface WeatherRead {
  /** One Danish line: "Lørdag: 4–6 grader, tørt, koldt". */
  line: string;
  verdict: WeatherVerdict;
  /** false when the data holds no forecast for the date. */
  known: boolean;
}

export function readWeather(days: PlannerDays, date: string, evening: boolean): WeatherRead {
  const w = days.weather?.[date];
  const f = w && ((evening && w.evening) || w.day);
  if (!f) return { line: `Ingen vejrudsigt for ${date} i datagrundlaget.`, verdict: { outdoor: "dry" }, known: false };
  const v = f.verdict ?? { outdoor: "dry" };
  const d = f.day ?? {};
  const bits: string[] = [];
  if (d.minTemp != null && d.maxTemp != null) bits.push(`${Math.round(d.minTemp)}–${Math.round(d.maxTemp)} grader`);
  bits.push(v.outdoor === "wet" ? "regn" + (v.rainMm ? ` (${Math.round(v.rainMm)} mm)` : "") : v.outdoor === "showers" ? "byger" : "tørt");
  if (v.snow) bits.push("sne");
  if (v.cold) bits.push("koldt");
  if (v.windy) bits.push("blæsende" + (v.maxGust ? ` (stød ${Math.round(v.maxGust)} m/s)` : ""));
  return { line: `${cap(dayName(date))}${evening ? " aften" : ""}: ${bits.join(", ")}`, verdict: v, known: true };
}
