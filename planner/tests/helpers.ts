import type { Brief, Forecast, Item, PlanResult, PlannerDays, Shortlist, Suggestion, WeatherDay } from "../types";

export const DATE = "2026-11-21";
let n = 0;

/** A bare Item; override what a test cares about. */
export function item(over: Partial<Item> = {}): Item {
  n++;
  return {
    id: `t:${n}`, source: "kultunaut", kind: "event", title: `Titel ${n}`, date: DATE, time: "14:00", endTime: null, venue: `Sted ${n}`,
    address: null, area: "cph", priceText: null, priceMin: null, priceMax: null, free: null, ageFrom: null, audience: [], categories: [],
    indoor: null, url: `https://example.test/${n}`, extra: {}, ...over,
  };
}

export const forecast = (outdoor: "dry" | "showers" | "wet", extra: Partial<Forecast["verdict"]> = {}): Forecast => ({
  verdict: { outdoor, ...extra }, day: { minTemp: 8, maxTemp: 12 }, text: null, warnings: [], hours: [],
});
export const weatherOf = (f: Forecast): WeatherDay => ({ day: f, evening: f });

export function days(items: Item[], weather: Forecast | null = forecast("dry")): PlannerDays {
  return { days: [DATE], weather: weather ? { [DATE]: weatherOf(weather) } : {}, items };
}

/** An adult asking for culture: the smallest complete brief. */
export const brief = (over: Partial<Brief> = {}): Brief => ({ people: [{ age: 30 }, { age: 30 }], date: DATE, mood: ["culture"], ...over });

export function ok(r: PlanResult): Shortlist {
  if (r.status !== "ok") throw new Error("expected ok, got " + JSON.stringify(r));
  return r;
}
export const suggestions = (r: Shortlist): Suggestion[] => [...(r.best ? [r.best] : []), ...r.alternatives];
export const titles = (r: Shortlist): string[] => suggestions(r).flatMap((s) => s.items.map((i) => i.title));
