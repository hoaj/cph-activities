// Pure helpers for Culture Box's calendar: dates, opening hours, prices, lineup and rows.

export const VENUE = "Culture Box";
export const ADDRESS = "Kronprinsessegade 54, 1306 København K";
/** The site's About page: "18+ on all in-house events"; any other event says so on its own page. */
export const HOUSE_AGE_FROM = 18;

const MONTHS: Record<string, number> = {
  january: 1, januar: 1, february: 2, februar: 2, march: 3, marts: 3, april: 4, may: 5, maj: 5, june: 6, juni: 6,
  july: 7, juli: 7, august: 8, september: 9, october: 10, oktober: 10, november: 11, december: 12,
};

/** `2026-03-07` from a heading such as `SAT 7 MARCH 2026`; null when it names no real date. */
export function dateOf(text: string | null | undefined): string | null {
  const m = /(\d{1,2})\.?[\s-]+([\p{L}]+)[\s-]+(\d{4})/u.exec(text ?? "");
  if (!m) return null;
  const month = MONTHS[m[2]!.toLowerCase()];
  if (!month) return null;
  const iso = `${m[3]}-${String(month).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** `22:00` from `10PM`, `10.30 pm` or `22:00`. A bare number is ambiguous and reads as null. */
export function clockOf(text: string): string | null {
  const twelve = /(?<![\d:.])(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (twelve) {
    const h = Number(twelve[1]);
    const min = Number(twelve[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return null;
    const hour = (h % 12) + (twelve[3]!.toLowerCase() === "pm" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  const full = /(?<![\d:.])([01]?\d|2[0-3])[.:]([0-5]\d)(?![\d])/.exec(text);
  return full ? `${full[1]!.padStart(2, "0")}:${full[2]}` : null;
}

/** Opening and closing time from `10PM – 8AM`; closing is null for an open end (`10PM – late`). */
export function hoursOf(text: string | null | undefined): { time: string | null; endTime: string | null } {
  const [start, end] = (text ?? "").split(/\s*(?:–|—|-|\bto\b)\s*/i);
  const time = start ? clockOf(start) : null;
  return { time, endTime: time && end ? clockOf(end) : null };
}

/** The calendar day after `date`. */
export function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The date a night closes: the next day when the closing time is not after the opening time. */
export function endDateOf(date: string, time: string | null, endTime: string | null): string | null {
  if (!time || !endTime) return null;
  return endTime <= time ? nextDay(date) : date;
}

const AMOUNT = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+)(?:,\d{1,2})?`;
const AMOUNT_AFTER = new RegExp(String.raw`(?<![\w.,])${AMOUNT}\s*(?:DKK\b|kr\b\.?|,-)`, "gi");
const AMOUNT_BEFORE = new RegExp(String.raw`(?:DKK|kr\.?)\s*${AMOUNT}(?![\d])`, "gi");
const FREE = /\b(?:free|gratis|fri entr[eé])\b/i;

export type Price = { price: string | null; priceMinDKK: number | null; priceMaxDKK: number | null; free: boolean | null };

/**
 * The price from a card's entrance line. Only amounts the text marks as kroner count; free is true
 * only when it says free and names no amount; a line with neither is all null.
 */
export function priceOf(entrance: string | null | undefined): Price {
  const price = (entrance ?? "").replace(/^\s*entrance\b[:\s]*/i, "").trim() || null;
  if (!price) return { price: null, priceMinDKK: null, priceMaxDKK: null, free: null };
  const hits = [...price.matchAll(AMOUNT_AFTER), ...price.matchAll(AMOUNT_BEFORE)];
  const amounts = hits.map((m) => Number(m[1]!.replace(/[.,]/g, ""))).filter((n) => Number.isFinite(n));
  if (amounts.length) return { price, priceMinDKK: Math.min(...amounts), priceMaxDKK: Math.max(...amounts), free: false };
  if (FREE.test(price)) return { price, priceMinDKK: 0, priceMaxDKK: 0, free: true };
  return { price, priceMinDKK: null, priceMaxDKK: null, free: null };
}

/** true when the entrance line or a button says sold out; null when nothing does. Never reads the description. */
export function soldOutOf(texts: readonly (string | null | undefined)[]): true | null {
  return texts.some((t) => /\bsold[\s-]?out\b|\budsolgt\b/i.test(t ?? "")) ? true : null;
}

// Event texts are full of numbers ("20+ years behind the decks", "10 YEARS OF ..."): only a limit stated as one counts.
const AGE_PATTERNS = [
  /(?<!\bno\s)\b(?:age\s+limit|age\s+restriction|minimum\s+age|min\.?\s*age|aldersgr(?:æ|ae)nse)\D{0,12}(\d{2})\b/i,
  /\b(\d{2})\s*\+\s*(?:only|event)\b/i,
  /\b(?:must\s+be|aged?|from)\s+(\d{2})\s*(?:years|år)?\s*(?:and|or|og|eller)\s*(?:older|over|ældre|derover)\b/i,
];

/** An age limit the text states in so many words, or null. */
export function ageFromOf(text: string | null | undefined): number | null {
  for (const re of AGE_PATTERNS) {
    const m = re.exec(text ?? "");
    if (m) {
      const age = Number(m[1]);
      if (age >= 13 && age <= 30) return age;
    }
  }
  return null;
}

/** The slug of a link to one night's page on the site, or null. */
export function slugOf(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link, "https://culture-box.com");
    if (u.hostname !== "culture-box.com" && u.hostname !== "www.culture-box.com") return null;
    return /^\/event\/([^/]+)\/?$/.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** An http(s) link, or null. */
export function safeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type RoomBlock = { name: string | null; lines: string[]; heading: string | null };
export type Room = { name: string | null; series: string | null; artists: string[] };

const unColon = (s: string) => s.replace(/\s*:\s*$/, "").trim();

/** One room: its name, the night's series when the site sets it apart in bold, and one lineup entry per line. */
export function roomOf(block: RoomBlock): Room {
  const name = block.name?.trim() || null;
  const lines = [...block.lines];
  if (name && lines[0] === name) lines.shift();
  let series: string | null = null;
  if (block.heading && lines[0] && unColon(lines[0]) === unColon(block.heading)) series = unColon(lines.shift()!);
  return { name, series, artists: [...new Set(lines.map(unColon).filter(Boolean))] };
}

/** The site gives a night no title, only its date: the series names, else each room's first lineup line. */
export function titleOf(rooms: readonly Room[]): string {
  const uniq = (xs: string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const series = uniq(rooms.flatMap((r) => (r.series ? [r.series] : [])));
  if (series.length) return series.join(" / ");
  const first = uniq(rooms.flatMap((r) => (r.artists[0] ? [r.artists[0]] : [])));
  return first.length ? first.join(" / ") : "Club night at Culture Box";
}

export type Card = { heading: string | null; link: string | null; rooms: RoomBlock[]; facts: (string | null)[] };

export type Night = Price & {
  id: string;
  title: string;
  date: string;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  venue: string;
  address: string;
  area: "cph";
  rooms: Room[];
  soldOut: true | null;
  ageFrom: number | null;
  url: string;
  ticketUrl: string | null;
  detailsRead: boolean;
};

/** One card as a row, or null when it has no date or no link to its own page. Any other gap is a null field. */
export function toNight(card: Card, origin: string): Night | null {
  const id = slugOf(card.link);
  const date = dateOf(card.heading) ?? dateOf(id);
  if (!id || !date) return null;
  const facts = card.facts.filter((f): f is string => !!f);
  const entrance = facts.find((f) => /^\s*entrance\b/i.test(f)) ?? facts.find((f) => /\bDKK\b/i.test(f)) ?? null;
  const hoursLine = facts.filter((f) => f !== entrance).find((f) => hoursOf(f).time !== null) ?? null;
  const { time, endTime } = hoursOf(hoursLine);
  const rooms = card.rooms.map(roomOf).filter((r) => r.name || r.series || r.artists.length);
  return {
    id,
    title: titleOf(rooms),
    date,
    time,
    endDate: endDateOf(date, time, endTime),
    endTime,
    venue: VENUE,
    address: ADDRESS,
    area: "cph",
    rooms,
    ...priceOf(entrance),
    soldOut: soldOutOf([entrance]),
    ageFrom: null,
    url: `${origin}/event/${id}/`,
    ticketUrl: null,
    detailsRead: false,
  };
}

export type EventPage = { article: string; buttons: { label: string | null; href: string | null }[]; notes: string | null };

/** A row with what only its page says: the ticket link, a sold-out button and a stated age limit. */
export function withPage(night: Night, page: EventPage): Night {
  const ticket = page.buttons.find((b) => /\b(?:tickets?|billet(?:ter)?)\b/i.test(b.label ?? ""));
  return {
    ...night,
    ticketUrl: safeLink(ticket?.href),
    soldOut: night.soldOut ?? soldOutOf(page.buttons.map((b) => b.label)),
    ageFrom: ageFromOf(page.notes),
    detailsRead: true,
  };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Whether every word of the query is in the night's title, room names, series or artists (any case, accents ignored). */
export function matchesQuery(night: Night, query: string | undefined): boolean {
  const words = fold(query ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold([night.title, ...night.rooms.flatMap((r) => [r.name ?? "", r.series ?? "", ...r.artists])].join(" "));
  return words.every((w) => text.includes(w));
}

export type Selection = { from: string; to: string; fromTime?: string; toTime?: string; maxPrice?: number; free: boolean; query?: string };

/** The nights inside the selection, soonest first. A time or price filter leaves out a night that does not state it. */
export function selectNights(nights: readonly Night[], sel: Selection): Night[] {
  return nights
    .filter((n) => n.date >= sel.from && n.date <= sel.to)
    .filter((n) => !sel.fromTime || (n.time !== null && n.time >= sel.fromTime))
    .filter((n) => !sel.toTime || (n.time !== null && n.time <= sel.toTime))
    .filter((n) => !sel.free || n.free === true)
    .filter((n) => sel.maxPrice === undefined || (n.priceMinDKK !== null && n.priceMinDKK <= sel.maxPrice))
    .filter((n) => matchesQuery(n, sel.query))
    .sort((a, b) => `${a.date} ${a.time ?? "99:99"}`.localeCompare(`${b.date} ${b.time ?? "99:99"}`));
}
