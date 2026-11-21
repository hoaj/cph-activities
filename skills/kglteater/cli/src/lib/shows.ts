// Pure helpers for `show list`: turning the calendar's items into rows, and reading a show page's text.
const HOST = "www.kglteater.dk";

/** The theatre's own stages in Københavns Kommune. Dyrehaven, Moesgaard and tours are elsewhere. */
const CPH_STAGES = new Set(["gamle scene", "skuespilhuset", "operaen", "stærekassen"]);

export type Item = {
  startDate: string;
  showName: string;
  showLead?: string | null;
  showUrl: string;
  showId: number;
  category?: string | null;
  canceled: boolean;
  isFree: boolean;
  isTour: boolean;
  minPrice?: number | null;
  fullHouse?: boolean | null;
  tixlySoldOut?: boolean | null;
  tixlySaleStatusText?: string | null;
  tixlyBuyLink?: string | null;
  externalBuyLink?: string | null;
  location?: string | null;
  label?: string | null;
  promotedLabel?: string | null;
  specialMarking?: string | null;
};

export type Row = {
  title: string;
  genre: string | null;
  date: string;
  time: string;
  stage: string | null;
  venue: string | null;
  area: "cph" | "outside";
  priceMinDKK: number | null;
  priceMaxDKK: number | null;
  free: boolean;
  ageFrom: number | null;
  forChildren: boolean;
  availability: "available" | "few" | "soldOut" | "cancelled" | null;
  premiere: boolean;
  description: string | null;
  note: string | null;
  url: string;
  bookingUrl: string | null;
};

const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** `2026-12-05T19:30:00` is local Copenhagen time; read it as written. */
export const localDate = (dateTime: string): string => dateTime.slice(0, 10);
export const localTime = (dateTime: string): string => dateTime.slice(11, 16);

/** True for a date that exists: 2026-02-30 and month 13 do not. */
export function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const areaOf = (location: string | null | undefined, isTour: boolean): "cph" | "outside" =>
  !isTour && location != null && CPH_STAGES.has(location.trim().toLowerCase()) ? "cph" : "outside";

export const isGuidedTour = (genre: string | null | undefined): boolean => genre?.trim().toLowerCase() === "rundvisning";

/** Performances sold only to school classes: the public cannot buy them. */
export const isSchoolOnly = (item: { promotedLabel?: string | null }): boolean => /^\s*kun for skoler\b/i.test(item.promotedLabel ?? "");

export function availability(item: Pick<Item, "canceled" | "fullHouse" | "tixlySoldOut" | "tixlySaleStatusText">): Row["availability"] {
  if (item.canceled || item.tixlySaleStatusText === "Cancelled") return "cancelled";
  if (item.tixlySoldOut || item.fullHouse || item.tixlySaleStatusText === "SoldOut") return "soldOut";
  if (item.tixlySaleStatusText === "FewTickets") return "few";
  if (item.tixlySaleStatusText === "NoStatus") return "available";
  return null; // sold by another seller, or a status this CLI does not know
}

/** The calendar's cheapest ticket: 0 only when the site marks it free, since 0 can also mean no price. */
export function priceMin(item: { isFree: boolean; minPrice?: number | null }): number | null {
  if (item.isFree) return 0;
  return item.minPrice != null && item.minPrice > 0 ? item.minPrice : null;
}

/** An http(s) link, or null. */
export function safeLink(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The path parts of a production page on the site, or null for any other link. */
export function showPathParts(url: string): { section: string; season: string; slug: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== HOST) return null;
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
    return m ? { section: decodeURIComponent(m[1]!), season: decodeURIComponent(m[2]!), slug: decodeURIComponent(m[3]!) } : null;
  } catch {
    return null;
  }
}

/** Reads `120 - 480 kr.`, `1.050 kr.` or `Gratis` from a show page. */
export function parsePriceRange(text: string | null | undefined): { min: number; max: number } | null {
  const s = text?.trim();
  if (!s) return null;
  if (/^gratis\b/i.test(s)) return { min: 0, max: 0 };
  const numbers = (s.match(/\d[\d.]*/g) ?? []).map((n) => Number(n.replace(/\./g, ""))).filter((n) => Number.isFinite(n));
  if (!numbers.length || !/kr/i.test(s)) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

/** Reads the age from `Anbefales fra 9 år`. */
export function parseAge(text: string | null | undefined): number | null {
  const m = text?.match(/fra\s+(\d{1,2})\s*år/i);
  return m ? Number(m[1]) : null;
}

/** True when the production states no age or an age of at most `age`. */
export const fitsAge = (ageFrom: number | null | undefined, age: number): boolean => ageFrom == null || ageFrom <= age;

/** `a,b` and repeated flags as one list of trimmed names. */
export const splitNames = (values: string[] | undefined): string[] =>
  (values ?? []).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);

/** The site's ids for the wanted names: an exact name (any case) first, else a part of one. */
export function resolveNames(wanted: string[], options: { id: string; name: string }[]): { ids: string[] } | { unknown: string[] } {
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const w of wanted) {
    const low = w.toLowerCase();
    const exact = options.filter((o) => o.name.toLowerCase() === low);
    const hits = exact.length ? exact : options.filter((o) => o.name.toLowerCase().includes(low));
    if (!hits.length) unknown.push(w);
    for (const h of hits) ids.add(h.id);
  }
  return unknown.length ? { unknown } : { ids: [...ids] };
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", aelig: "æ", oslash: "ø", aring: "å", AElig: "Æ", Oslash: "Ø", Aring: "Å" };
export const DESCRIPTION_MAX = 500;

/** The calendar's lead as plain text: tags removed, entities decoded, whitespace collapsed, at most 500 characters cut at a word boundary with `…`; null when empty. */
export function leadText(s: string | null | undefined): string | null {
  const text = (s ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= DESCRIPTION_MAX) return text;
  const head = text.slice(0, DESCRIPTION_MAX - 1);
  const cut = head.lastIndexOf(" ");
  return (cut > 0 ? head.slice(0, cut) : head).trimEnd() + "…";
}

export function toRow(item: Item): Row {
  const area = areaOf(item.location, item.isTour);
  const min = priceMin(item);
  return {
    title: item.showName.trim(),
    genre: orNull(item.category),
    date: localDate(item.startDate),
    time: localTime(item.startDate),
    stage: orNull(item.location),
    venue: area === "cph" ? "Det Kongelige Teater" : null,
    area,
    priceMinDKK: min,
    priceMaxDKK: item.isFree ? 0 : null,
    free: item.isFree,
    ageFrom: null,
    forChildren: /^for børn$/i.test(item.label?.trim() ?? ""),
    availability: availability(item),
    premiere: /premiere/i.test(item.specialMarking ?? ""),
    description: leadText(item.showLead),
    note: orNull(item.promotedLabel),
    url: item.showUrl,
    bookingUrl: safeLink(item.externalBuyLink) ?? safeLink(item.tixlyBuyLink),
  };
}

/** Adds what a show page says. The page's range is the production's, so a top below this date's cheapest ticket is ignored. */
export function withDetails(row: Row, page: { priceText: string | null; ageText: string | null }): Row {
  const range = parsePriceRange(page.priceText);
  const top = range && range.max > 0 && (row.priceMinDKK == null || range.max >= row.priceMinDKK) ? range.max : null;
  return { ...row, priceMaxDKK: row.free ? 0 : top, ageFrom: parseAge(page.ageText) };
}
