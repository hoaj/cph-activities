// Pure helpers that turn a Christmas market's calendar card and page into the command's row.
import type { MarketPage } from "./market-page";

/** The calendar's category "Julemarked". */
export const CHRISTMAS_MARKET_CATEGORY = "82";

const CPH_POSTCODES = [2100, 2150, 2200, 2300, 2400, 2450, 2500, 2700, 2720]; // Ø, Nordhavn, N, S, NV, SV, Valby, Brønshøj, Vanløse

/** Copenhagen here is Københavns + Frederiksberg Kommune: 1000–2000 and the postcodes above. */
export const isCphPostcode = (postcode: string): boolean => {
  const n = Number(postcode);
  return Number.isInteger(n) && ((n >= 1000 && n <= 2000) || CPH_POSTCODES.includes(n));
};

/** A card's place can be Copenhagen; every other town on the calendar is outside. */
export const placeInCph = (place: string | null): boolean => /k[øo]benhavn|copenhagen|frederiksberg/i.test(place ?? "");

/** The market's page as a slug and which of the site's two URL forms it has; null for any other link. */
export const slugOf = (href: string): { slug: string; nested: boolean } | null => {
  let path: string;
  try {
    path = new URL(href, "https://visitorservice.kk.dk").pathname;
  } catch {
    return null;
  }
  const m = /^\/(?:(eventkalender)\/)?([^/]+)\/?$/.exec(path);
  if (!m || m[2] === "eventkalender") return null;
  try {
    return { slug: decodeURIComponent(m[2]!), nested: m[1] !== undefined };
  } catch {
    return null;
  }
};

/** The number of results in the list's "Viser 1-12 af 20 resultater"; null when the line is missing. */
export const totalOf = (resume: string | null): number | null => {
  const m = /\baf\s+(\d+)\b/.exec(resume ?? "");
  return m ? Number(m[1]) : null;
};

export type Day = { date: string; time: string | null; endTime: string | null };

const clock = (s: string | null | undefined): string | null => {
  const m = /^(\d{2}):(\d{2})/.exec(s ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
};

/** Hours as the page gives them: 00:00–00:00 is no hours, and an end equal to the start is no end. */
const hours = (start: string | null | undefined, end: string | null | undefined) => {
  const time = clock(start);
  const endTime = clock(end);
  if (time === "00:00" && (endTime === null || endTime === "00:00")) return { time: null, endTime: null };
  return { time, endTime: endTime === time ? null : endTime };
};

const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const priceText = (value: string | string[] | boolean | null | undefined): string | null => {
  const parts = (typeof value === "string" ? [value] : Array.isArray(value) ? value : []).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : null;
};

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const realDate = (y: number, mo: number, d: number): string | null => {
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
};

/**
 * The page's visible date line: "Lør. 28. nov. 2030 Kl. 11 - 17", "28. nov. - 20. dec. 2030 Kl. 10 - 21",
 * "28. - 29. nov. 2030" or "13.11.2030 - 30.12.2030 Kl. 10 - 21". Null when it holds no whole date.
 */
export const dateTextOf = (text: string | null): { startDate: string; endDate: string; startTime: string | null; endTime: string | null } | null => {
  if (!text) return null;
  const at = text.search(/\bkl\./i);
  const datePart = at === -1 ? text : text.slice(0, at);
  const timePart = at === -1 ? "" : text.slice(at + 3);

  const parts: Array<{ d: number; mo?: number; y?: number }> = [];
  const numeric = [...datePart.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)];
  if (numeric.length > 0) {
    for (const n of numeric) parts.push({ d: Number(n[1]), mo: Number(n[2]), y: Number(n[3]) });
  } else {
    for (const n of datePart.matchAll(/(\d{1,2})\.(?:\s*(\p{L}{3})\p{L}*\.?)?(?:\s*(\d{4}))?/gu)) {
      const index = n[2] ? MONTHS.indexOf(n[2].toLowerCase()) : -1;
      if (n[2] && index === -1) return null;
      parts.push({ d: Number(n[1]), ...(index >= 0 ? { mo: index + 1 } : {}), ...(n[3] ? { y: Number(n[3]) } : {}) });
    }
  }
  if (parts.length < 1 || parts.length > 2) return null;
  const last = parts.at(-1)!;
  const first = parts[0]!;
  if (last.mo === undefined || last.y === undefined) return null;
  const firstMonth = first.mo ?? last.mo;
  const firstYear = first.y ?? (firstMonth > last.mo ? last.y - 1 : last.y); // a period across New Year
  const startDate = realDate(firstYear, firstMonth, first.d);
  const endDate = realDate(last.y, last.mo, last.d);
  if (!startDate || !endDate || endDate < startDate) return null;

  const t = /^\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*-\s*(\d{1,2})(?:[.:](\d{2}))?)?/.exec(timePart);
  const hhmm = (h: string | undefined, min: string | undefined) => {
    if (h === undefined || Number(h) > 23 || Number(min ?? 0) > 59) return null;
    return `${pad(Number(h))}:${min ?? "00"}`;
  };
  const startTime = t ? hhmm(t[1], t[2]) : null;
  return { startDate, endDate, startTime, endTime: startTime && t ? hhmm(t[3], t[4]) : null };
};

/** The page's calendar entry: its coming open days by date, and its price text. */
const calendarOf = (page: Pick<MarketPage, "settings">) => {
  const entry = Object.values(page.settings.eventCalendar ?? {})[0];
  const occurrences = entry?.event_occurrences;
  return {
    byDate: occurrences && !Array.isArray(occurrences) ? occurrences : {},
    price: priceText(entry?.event_defaults?.price_value),
  };
};

export const priceOf = (page: Pick<MarketPage, "settings">): string | null => calendarOf(page).price;

/** The schema.org schedule, or without one the page's visible date line, as schedule entries. */
const scheduleOf = (page: Pick<MarketPage, "event" | "dateText">) => {
  const schedule = page.event?.eventSchedule;
  if (schedule != null && (!Array.isArray(schedule) || schedule.length > 0)) return Array.isArray(schedule) ? schedule : [schedule];
  const shown = dateTextOf(page.dateText);
  return shown ? [shown] : [];
};

/** Whether the page gives any dates at all, inside the search or not. */
export const hasDates = (page: Pick<MarketPage, "event" | "settings" | "dateText">): boolean =>
  Object.keys(calendarOf(page).byDate).length > 0 || scheduleOf(page).length > 0;

/**
 * The open days inside the search. The page's calendar lists each coming day with its hours. A market
 * with one long period has no such list, only one pair of hours from the schema.org schedule or the
 * page's date line: then
 * `dayByDay` is false, because the page does not say whether it closes on some day.
 */
export const daysIn = (page: Pick<MarketPage, "event" | "settings" | "dateText">, from: string, to: string): { days: Day[]; dayByDay: boolean } => {
  const { byDate } = calendarOf(page);
  const dates = Object.keys(byDate);
  if (dates.length > 0) {
    const days: Day[] = [];
    for (const date of dates.filter((d) => d >= from && d <= to).sort()) {
      // Two openings on one day: from the first opening to the last closing.
      const spans = byDate[date]!.map((o) => hours(o.date.hour_start, o.date.hour_end));
      const opens = spans.map((s) => s.time).filter((t): t is string => t !== null).sort();
      const closes = spans.map((s) => s.endTime).filter((t): t is string => t !== null).sort();
      days.push({ date, time: opens[0] ?? null, endTime: closes.at(-1) ?? null });
    }
    return { days, dayByDay: true };
  }
  const entries = scheduleOf(page);
  const byDay = new Map<string, Day>();
  let dayByDay = entries.length > 0;
  for (const e of entries) {
    const first = e.startDate.slice(0, 10);
    const last = (e.endDate ?? e.startDate).slice(0, 10);
    if (last !== first) dayByDay = false;
    for (let d = first < from ? from : first; d <= last && d <= to; d = nextDay(d)) {
      if (!byDay.has(d)) byDay.set(d, { date: d, ...hours(e.startTime, e.endTime) });
    }
  }
  return { days: [...byDay.values()].sort((x, y) => x.date.localeCompare(y.date)), dayByDay };
};

/** Only days open inside the time window; a day with no hours cannot be said to be. */
export const inWindow = (day: Day, fromTime?: string, toTime?: string): boolean => {
  if (!fromTime && !toTime) return true;
  if (!day.time) return false;
  if (fromTime && (day.endTime ?? day.time) < fromTime) return false;
  if (toTime && day.time > toTime) return false;
  return true;
};

/** true or false only when the page's own text says it, in one way; else null. Never a guess. */
export const indoorOf = (...texts: Array<string | null>): boolean | null => {
  const text = texts.filter(Boolean).join(" ").toLowerCase();
  if (/ikke\s+(?:\p{L}+\s+)?(?:indendørs|udendørs)/u.test(text)) return null;
  const inside = /(?<!\p{L})indendørs/u.test(text);
  const outside = /(?<!\p{L})udendørs/u.test(text);
  return inside === outside ? null : inside;
};

/**
 * Free from the page's price text when it has one. With no price text only a "free" schema.org flag
 * counts: "not free" with no price is what a page with an empty price field says, so that is null.
 */
export const freeOf = (price: string | null, flag: string | boolean | null | undefined): boolean | null => {
  // Only a price that is nothing but "Gratis": "Børn u. 3 Gratis; Voksne 210 kr." is not free.
  if (price && /^(?:gratis|fri entr[eé])\.?$/i.test(price.trim())) return true;
  if (price && /\d/.test(price)) return false;
  if (price) return null;
  return flag === true || (typeof flag === "string" && /true$/i.test(flag)) ? true : null;
};

const TOWN = /^(?:københavn|kobenhavn|copenhagen|frederiksberg)(?:\s+[a-zæøå]{1,2})?$/i;
const STREET = /\p{L}.*\s\d+[a-z]?$/iu;

/**
 * The contact name is "<town>, <venue>", or sometimes "<venue>, <street>, <town>". Splits it into the
 * venue and the address, the page's street line first. A name that is only a town gives neither.
 */
export const placeOf = (contactName: string | null, street: string | null): { venue: string | null; address: string | null } => {
  const parts = (contactName ?? "").split(",").map((p) => p.trim()).filter(Boolean).filter((p) => !TOWN.test(p));
  const inName = parts.find((p) => STREET.test(p)) ?? null;
  const venue = parts.find((p) => p !== inName) ?? null;
  return { venue, address: street?.trim() || inName };
};

/** The page's district; "Udenfor København" (where Frederiksberg's markets are filed) names none. */
export const districtOf = (district: string | null): string | null => (district && !/udenfor/i.test(district) ? district : null);

/** Whether the market lies in Copenhagen: its postcode decides; without one, the card's place and the district. */
export const inCph = (place: string | null, page: Pick<MarketPage, "postcode" | "district">): boolean => {
  const postcode = page.postcode?.match(/\b\d{4}\b/)?.[0];
  if (postcode) return isCphPostcode(postcode);
  if (/frederiksberg/i.test(place ?? "")) return true;
  return placeInCph(place) && !/udenfor/i.test(page.district ?? "");
};
