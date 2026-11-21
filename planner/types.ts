/** Shared types: the normalised Item, the Brief and the planOuting result (contract: hoaj/cph-activities#24). */

export const EVENT_SOURCES = [
  "kulturkbh",
  "billetto",
  "kultunaut",
  "brugbyen",
  "teaterbilletter",
  "absalon",
  "wannasport",
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
export type Source = EventSource | "dmi";
export const SOURCES: readonly Source[] = [...EVENT_SOURCES, "dmi"];

export const SPORTS = ["padel", "tabletennis", "badminton", "squash", "tennis", "basketball"] as const;
export type Sport = (typeof SPORTS)[number];

export const AUDIENCES = ["børn", "unge", "voksne"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type ItemKind = "event" | "show" | "slots";

/** What a source adds beyond the common fields. Every key is optional. */
export interface ItemExtra {
  description?: string;
  alsoAt?: unknown[];
  onSale?: boolean | null;
  slots?: unknown;
  timeMayDiffer?: boolean;
  recurring?: boolean;
  group?: string;
  premiere?: boolean;
  sport?: string;
  perCourt?: boolean;
  courtName?: string;
  fetch?: string;
}

/** One row of any source in one shape. `time` is "HH:MM" or null; prices are DKK. */
export interface Item {
  id: string;
  source: EventSource;
  kind: ItemKind;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  time: string | null;
  endTime: string | null;
  venue: string | null;
  address: string | null;
  area: string;
  priceText: string | null;
  priceMin: number | null;
  priceMax: number | null;
  free: boolean | null;
  ageFrom: number | null;
  audience: string[];
  categories: string[];
  /** true indoors, false outdoors, null unknown. */
  indoor: boolean | null;
  url: string | null;
  /** Free court times (kind "slots") or the several start times of one Billetto event. */
  times?: string[];
  extra: ItemExtra;
}

export interface WeatherVerdict {
  outdoor: "dry" | "showers" | "wet";
  rainMm?: number;
  wetHours?: number;
  dryHours?: number;
  minTemp?: number;
  maxTemp?: number;
  maxGust?: number;
  cold?: boolean;
  windy?: boolean;
  snow?: boolean;
}

/** One dmi forecast (a whole day, or a window of it). */
export interface Forecast {
  verdict: WeatherVerdict;
  day?: { minTemp?: number; maxTemp?: number; meanTemp?: number; precipSum?: number };
  text: string | null;
  warnings: string[];
  hours: { time: string; temp?: number; description?: string; precipMm?: number }[];
}
export interface WeatherDay {
  day: Forecast | null;
  /** The 17:00-23:00 window, used when the brief starts in the evening. */
  evening: Forecast | null;
}

/** What planOuting reads: the dates covered, the weather per date and every normalised row of those dates. */
export interface PlannerDays {
  days: string[];
  weather: Record<string, WeatherDay>;
  items: Item[];
}

export type Mood = "active" | "culture" | "social" | "calm" | "food" | "gaming" | "nightlife";
export const MOODS: readonly Mood[] = ["active", "culture", "social", "calm", "food", "gaming", "nightlife"];

export interface Person {
  label?: string;
  age?: number;
}

export interface Brief {
  people: Person[];
  /** YYYY-MM-DD; default: the first date in `days`. */
  date?: string;
  /** HH:MM. */
  from?: string;
  to?: string;
  mood?: Mood[];
  /** Free text: a kind of thing or a word the title should match. */
  wishes?: string;
  budgetPerPerson?: number;
  indoorOnly?: boolean;
  /** "cph" (default) or a district word the venue or address must contain. */
  area?: string;
  excludeIds?: string[];
}

/** A change to a Brief: set a key, or delete it with null. Applied by `applyPatch`. */
export type BriefPatch = { [K in keyof Brief]?: Brief[K] | null };

export interface NeedsInput {
  status: "needs_input";
  /** "people", "people[i].age" and/or "mood". */
  missing: string[];
  /** One Danish message, at most two questions. */
  ask: string;
  options: { age?: string[]; mood?: Mood[] };
}

export interface SuggestionItem {
  /** "HH:MM", "HH:MM-HH:MM", "HH:MM-HH:MM · N ledige tider" or "tid: se siden". */
  time: string;
  title: string;
  place: string;
  price: string;
  url: string | null;
  sources: EventSource[];
  /** For `excludeIds`. */
  ids: string[];
}

export interface Suggestion {
  /** "aktiv", "kultur", "socialt" or "tråd". */
  kind: string;
  title: string;
  /** Short Danish tags. */
  why: string[];
  /** One item, or 2-4 for a thread. */
  items: SuggestionItem[];
}

export interface NextStep {
  label: string;
  patch: BriefPatch;
}

export interface Shortlist {
  status: "ok";
  /** A Danish weather line, only when the weather decided something or is worth knowing (wet, showers, cold, windy, snow); null on a dry, mild day. */
  weather: string | null;
  /** null when nothing fits, or when only events without a start time do. */
  best: Suggestion | null;
  alternatives: Suggestion[];
  plan?: string[];
  assumptions: string[];
  /** Facet counts of what else matched and is not shown. */
  more: Record<string, number>;
  next: NextStep[];
  stats: { candidates: number; dropped: Record<string, number>; mergedAway: number };
}

export type PlanResult = NeedsInput | Shortlist;
