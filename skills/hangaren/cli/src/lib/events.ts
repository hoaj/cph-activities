// Pure helpers that turn a card on Hangaren's events page into the command's row. Prices, age and
// line-up are free text: a value is read only when the text states it unambiguously, else it is null.

export const VENUE = "Hangaren";
export const ADDRESS = "Refshalevej 185, 1432 København K";
const ORIGIN = "https://www.hangaren.dk";

export type Card = {
  href: string | null;
  title: string | null;
  calendarLink: string | null;
  dates: (string | null)[];
  clocks: (string | null)[];
  lines: string[];
  links: (string | null)[];
};

export type Row = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  venue: string;
  address: string;
  area: "cph";
  artists: string[] | null;
  priceMinDKK: number | null;
  priceMaxDKK: number | null;
  free: boolean | null;
  priceText: string | null;
  soldOut: true | null;
  cancelled: boolean;
  ageFrom: number | null;
  url: string;
  ticketUrl: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isRealDate(s: string): boolean {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** `20261120T220000Z` as a date and time in Copenhagen; null when it is no real moment. */
function copenhagen(stamp: string): { date: string; time: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!m) return null;
  const at = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return null;
  const local = at.toLocaleString("sv-SE", { timeZone: "Europe/Copenhagen" });
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** A shown clock: `11:00 PM`, `23:00` or `23.00`; null for anything else. */
export function clockOf(text: string | null): string | null {
  const m = /^(\d{1,2})[:.](\d{2})(?:\s*([ap])\.?m\.?)?$/i.exec((text ?? "").replace(/\s+/g, " ").trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
  }
  return hour > 23 ? null : `${pad(hour)}:${pad(minute)}`;
}

export type Schedule = { date: string; time: string | null; endDate: string | null; endTime: string | null };

/**
 * When the night is, in Copenhagen time. The card's calendar link holds start and end in UTC, in no
 * language's format, so it comes first; without it, the dates and clocks the card shows.
 */
export function scheduleOf(card: Pick<Card, "calendarLink" | "dates" | "clocks">): Schedule | null {
  const stamps = /dates=(\d{8}T\d{6}Z)(?:\/|%2F)(\d{8}T\d{6}Z)/i.exec(card.calendarLink ?? "");
  if (stamps) {
    const start = copenhagen(stamps[1]!);
    const end = copenhagen(stamps[2]!);
    if (start && end) return { date: start.date, time: start.time, endDate: end.date, endTime: end.time };
  }
  const dates = card.dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && isRealDate(d));
  const date = dates[0];
  if (!date) return null;
  const clocks = card.clocks.map(clockOf);
  const time = clocks[0] ?? null;
  const endTime = clocks.length > 1 ? (clocks.at(-1) ?? null) : null;
  if (!endTime) return { date, time, endDate: null, endTime: null };
  // One date shown and an end at or before the start: the night runs past midnight.
  const endDate = dates.length > 1 ? dates.at(-1)! : time && endTime <= time ? nextDay(date) : date;
  return { date, time, endDate, endTime };
}

const STATED_HOURS = /^(?:(?:opening hours|åbningstid(?:er)?)\s*:?\s*)?(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})$/i;

/**
 * The card's own "Opening hours 23:00-06:00" line beats the calendar's end, which on some nights is a
 * leftover (00:00 for a night that runs to 06:00). It counts only when it starts when the calendar does.
 */
export function withStatedHours(schedule: Schedule, lines: readonly string[]): Schedule {
  for (const line of lines) {
    const m = STATED_HOURS.exec(line.trim());
    if (!m) continue;
    const start = clockOf(m[1]!);
    const end = clockOf(m[2]!);
    if (!start || !end || (schedule.time !== null && start !== schedule.time)) continue;
    return { date: schedule.date, time: start, endTime: end, endDate: end <= start ? nextDay(schedule.date) : schedule.date };
  }
  return schedule;
}

const NUMBER = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?`;
const UNIT = String.raw`(?:kr\b\.?(?:,-)?|DKK\b|,-)`;
const RANGE = new RegExp(String.raw`(?<![\w.:,-])${NUMBER}\s*[-–]\s*${NUMBER}\s*${UNIT}`, "gi");
const AFTER = new RegExp(String.raw`(?<![\w.:,-])${NUMBER}\s*${UNIT}`, "gi");
const BEFORE = new RegExp(String.raw`(?<![\w])(?:kr\.?|DKK)\s*${NUMBER}(?![\d])`, "gi");
const toNumber = (s: string) => Number(s.replace(/\./g, ""));

/** Every amount a line states in kroner. A clock (`23.00:`) or a bare number is no amount. */
export function amountsIn(line: string): number[] {
  const out: number[] = [];
  const rest = line.replace(RANGE, (_whole, low: string, high: string) => {
    out.push(toNumber(low), toNumber(high));
    return " ";
  });
  for (const m of rest.matchAll(AFTER)) out.push(toNumber(m[1]!));
  for (const m of rest.replace(AFTER, " ").matchAll(BEFORE)) out.push(toNumber(m[1]!));
  return out;
}

// A line about something other than getting in: a locker, or the fee for arriving late.
const NOT_ENTRY = /locker|jacket|wardrobe|garderobe|\bfee of\b|\bincur|\bbeer\b|\bdrinks?\b|(?<!\p{L})øl(?!\p{L})/iu;
const TICKET_WORD = /early|\blate\b|door|dør|pre.?sale|phase|release|admission|entr[eé]|billet|ticket|all night|general/i;
const TICKET_HEADING = /^(?:tickets?|billet\p{L}*|entr[eé]|priser?|prices?)(?!\p{L})[^:]{0,20}:$/iu;
const BLOCK_END = /^(?:buy\b|køb\b|info\b)|https?:\/\//i;
const MAX_PRICE_LINE = 120;
const FREE = /(?:^|[\s(])(?:free (?:entry|entrance|admission)|fri entr[eé]|gratis (?:entr[eé]|adgang))(?=$|[\s:.,!)])|^(?:entr[eé]|entrance|admission|tickets?)\s*:\s*(?:free|gratis)\b/i;
const FREE_WINDOW = /\d{1,2}(?:[:.]\d{2})?\s*[-–]\s*\d{1,2}|\b(?:before|until|indtil|før|efter|after)\b/i;
const bare = (line: string) => line.replace(/^[•\-–]\s*/, "");

export type Price = { priceMinDKK: number | null; priceMaxDKK: number | null; free: boolean | null; priceText: string | null };

/**
 * The entry price from the card's lines. Tiers (early bird, door) become a min and a max; lockers
 * and footnotes are never a price. With no stated amount the numbers stay null.
 */
export function priceOf(lines: readonly string[]): Price {
  const kept: string[] = [];
  const amounts: number[] = [];
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (TICKET_HEADING.test(line)) {
      inBlock = true;
      continue;
    }
    if (BLOCK_END.test(line)) inBlock = false;
    if (line.startsWith("*") || line.length > MAX_PRICE_LINE || NOT_ENTRY.test(line)) continue;
    const found = amountsIn(line);
    // "Free entrance: 20-21" is part of what a night costs, so the text keeps it; it is no amount.
    if (found.length === 0 && FREE.test(bare(line))) kept.push(bare(line));
    if (found.length === 0 || !(inBlock || TICKET_WORD.test(line))) continue;
    amounts.push(...found);
    kept.push(bare(line));
  }
  const priceText = kept.length > 0 ? kept.join("; ") : null;
  if (amounts.length > 0) return { priceMinDKK: Math.min(...amounts), priceMaxDKK: Math.max(...amounts), free: false, priceText };
  // Free for the whole night only when the line names no hours; a free first hour leaves the rest unknown.
  if (priceText && !kept.some((l) => FREE_WINDOW.test(l))) return { priceMinDKK: 0, priceMaxDKK: 0, free: true, priceText };
  return { priceMinDKK: null, priceMaxDKK: null, free: null, priceText };
}

// A bare "age" counts only at the start of a line: "started at age 16" in a bio is no limit.
const AGE = /(?:(?:^|[\s:•-])(?:minimum age|min\.? age|age limit|minimumsalder|aldersgrænse)|^[\s•-]*(?:age|alder))\s*:?\s*(\d{2})\s*(?:\+|år\b|years?\b|$)/i;

/** The age limit the card states; null when it states none, or two different ones. */
export function ageOf(lines: readonly string[]): number | null {
  const ages = new Set<number>();
  for (const line of lines) {
    if (line.length > MAX_PRICE_LINE) continue;
    const m = AGE.exec(line);
    if (m && Number(m[1]) >= 13 && Number(m[1]) <= 40) ages.add(Number(m[1]));
  }
  return ages.size === 1 ? [...ages][0]! : null;
}

const STATUS_PREFIX = /^(?:cancell?ed|aflyst|postponed|udskudt)\b/i;
// At the start or as a tag at the end of the title: an act may have the words in its name.
const SOLD_OUT = /^(?:sold[\s-]?out|udsolgt)\b|[-–—:(\[|]\s*(?:sold[\s-]?out|udsolgt)[\s!.)\]]*$/i;
const SOLD_OUT_LINE = /^(?:sold[\s-]?out|udsolgt)[\s!.]*$/i;

export const isCancelled = (title: string): boolean => STATUS_PREFIX.test(title.trim());

/** True only when the title or a line of its own says so. "Even if the presale is sold out" is no such line. */
export const soldOutOf = (title: string, lines: readonly string[]): true | null =>
  SOLD_OUT.test(title.trim()) || lines.some((l) => SOLD_OUT_LINE.test(l.trim())) ? true : null;

const LINEUP_HEADING = /^line[\s-]?up\b\s*:?$/i;
const LINEUP_END = /^(?:vj\b|tickets?\b|billet|info\b|buy\b|køb\b|opening\b|dates?\b|minimum\b|location\b|presale\b)|https?:\/\/|\d\s*(?:kr|dkk)/i;
const MAX_NAME = 40;
const NOTES = /\s*\((?:extra show|ekstra show|all night long)\)/gi;

/**
 * The acts as the page names them: the lines under a "Line-up" heading, else a comma-separated title
 * (after a series name such as "Series: A, B"). A title with no comma may be an act or the night's
 * name, so it gives no list.
 */
export function artistsOf(title: string, lines: readonly string[]): string[] | null {
  const at = lines.findIndex((l) => LINEUP_HEADING.test(l.trim()));
  if (at !== -1) {
    const names: string[] = [];
    for (const raw of lines.slice(at + 1)) {
      const line = raw.trim();
      if (LINEUP_END.test(line) || line.length > MAX_NAME) break;
      const name = line.replace(/:$/, "").trim();
      if (name && !names.includes(name)) names.push(name);
    }
    if (names.length > 0) return names;
  }
  const after = title.includes(":") ? title.slice(title.indexOf(":") + 1) : title;
  if (!after.includes(",")) return null;
  const names = after
    .replace(NOTES, "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return names.length > 1 ? names : null;
}

const TICKET_HOST = /(?:^|\.)(?:ra\.co|billetto\.[a-z]+|tix\.dk|place2book\.com|eventbrite\.[a-z.]+|ticketmaster\.[a-z.]+)$/i;

/** The link to the ticket seller, as a string. This CLI never opens it. */
export function ticketUrlOf(links: readonly (string | null)[]): string | null {
  for (const href of links) {
    if (!href) continue;
    try {
      const u = new URL(href);
      if ((u.protocol === "https:" || u.protocol === "http:") && TICKET_HOST.test(u.hostname)) return href;
    } catch {
      // A relative or broken link is no ticket link.
    }
  }
  return null;
}

/** The event's own page as a clean URL and its id (the path under /events/); null for any other link. */
export function pageOf(href: string | null): { id: string; url: string } | null {
  if (!href) return null;
  try {
    const u = new URL(href, ORIGIN);
    if (u.origin !== ORIGIN) return null;
    const m = /^\/events\/(.+?)\/?$/.exec(u.pathname);
    return m ? { id: m[1]!, url: `${ORIGIN}${u.pathname}` } : null;
  } catch {
    return null;
  }
}

/** One card as a row; null for a card with no title, link or date, which the command counts as unreadable. */
export function toRow(card: Card): Row | null {
  const title = card.title?.trim();
  const page = pageOf(card.href);
  const schedule = scheduleOf(card);
  if (!title || !page || !schedule) return null;
  const { lines } = card;
  return {
    id: page.id,
    title,
    ...withStatedHours(schedule, lines),
    venue: VENUE,
    address: ADDRESS,
    area: "cph",
    artists: artistsOf(title, lines),
    ...priceOf(lines),
    soldOut: soldOutOf(title, lines),
    cancelled: isCancelled(title),
    ageFrom: ageOf(lines),
    url: page.url,
    ticketUrl: ticketUrlOf(card.links),
  };
}

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export type Selection = {
  today: string;
  from: string;
  to: string;
  fromTime?: string;
  toTime?: string;
  maxPrice?: number;
  free: boolean;
  query?: string;
  includeCancelled: boolean;
  limit: number;
};

export function selectEvents(cards: readonly Card[], sel: Selection) {
  const words = fold(sel.query ?? "").split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const rows: Row[] = [];
  let unreadable = 0;
  let oldest: string | null = null;
  for (const card of cards) {
    const row = toRow(card);
    if (!row) {
      unreadable++;
      continue;
    }
    if (oldest === null || row.date < oldest) oldest = row.date;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.date < sel.from || row.date > sel.to) continue;
    if (row.cancelled && !sel.includeCancelled) continue;
    if (sel.fromTime && (row.time === null || row.time < sel.fromTime)) continue;
    if (sel.toTime && (row.time === null || row.time > sel.toTime)) continue;
    if (sel.free && row.free !== true) continue;
    if (sel.maxPrice !== undefined && !(row.priceMinDKK !== null && row.priceMinDKK <= sel.maxPrice)) continue;
    if (words.length > 0) {
      const text = fold([row.title, ...(row.artists ?? [])].join(" "));
      if (!words.every((w) => text.includes(w))) continue;
    }
    rows.push(row);
  }
  rows.sort((a, b) => `${a.date} ${a.time ?? "99:99"}`.localeCompare(`${b.date} ${b.time ?? "99:99"}`));
  // The page keeps only its latest past nights, so a search reaching before them may miss some.
  const reachesBack = oldest !== null && sel.from < oldest && sel.from < sel.today;
  return {
    source: "Hangaren (hangaren.dk)",
    total: rows.length,
    complete: unreadable === 0 && !reachesBack && rows.length <= sel.limit,
    unreadable,
    events: rows.slice(0, sel.limit),
  };
}
