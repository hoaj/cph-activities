// Pure helpers for `show list`: where a production is, which link buys it, and its local time.
// The apex serves the site and its JSON API; www answers every request with a redirect.
const ORIGIN = "https://teaterbilletter.dk";

/** The site's municipality names for Copenhagen as this plugin counts it. */
export const isCopenhagen = (municipality: string | null | undefined): boolean =>
  municipality === "Københavns Kommune" || municipality === "Frederiksberg Kommune";

export const pageUrl = (item: { slug: string; eventNo: number }): string => `${ORIGIN}/forestillinger/${item.slug}-${item.eventNo}`;

/** The ticket seller's page when it is a real http(s) address, else the production's page on the site. */
export function bookingUrl(item: { slug: string; eventNo: number; ticketOperator?: { url?: string | null } | null }): string {
  const raw = item.ticketOperator?.url?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if ((u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") && u.hostname !== "www.https") return u.toString();
    } catch {
      // malformed: fall through
    }
  }
  return pageUrl(item);
}

/** `2026-11-20T19:30:00` is local Copenhagen time; read it as written, with no time-zone conversion. */
export const localDate = (dateTime: string): string => dateTime.slice(0, 10);
export const localTime = (dateTime: string): string => dateTime.slice(11, 16);

/** True when the production has no age limit or the limit is at most `age`. */
export const fitsAge = (ageFrom: number | null | undefined, age: number): boolean => ageFrom == null || ageFrom <= age;

/**
 * Whether a production is filed under `wanted` (lower case): the text is part of its own category or
 * subcategory, or one of `siteNames` (the lower-case names and labels of the site's /api/categories
 * entries that contain the text) is among its mappedCategoryNames.
 */
export function matchesCategory(
  item: { categoryName?: string | null; subCategoryName?: string | null; mappedCategoryNames?: string[] | null },
  wanted: string,
  siteNames: string[],
): boolean {
  const own = [item.categoryName, item.subCategoryName].some((c) => c && c.toLowerCase().includes(wanted));
  const mapped = (item.mappedCategoryNames ?? []).some((m) => siteNames.includes(m.toLowerCase()));
  return own || mapped;
}

/** True when the production has no age limit or its limit is at least `min` (leaves out ones meant for younger children). */
export const fitsMinAgeFrom = (ageFrom: number | null | undefined, min: number): boolean => ageFrom == null || ageFrom >= min;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»" };

/** Plain text of a field that may hold HTML: tags removed, entities decoded, whitespace collapsed. */
export function plainText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export const DESCRIPTION_MAX = 500;

/**
 * One short plain-text description of a production: its teaser, else subtitle, else the start of its
 * description; at most 500 characters, cut at a word boundary with `…`; null when all are empty.
 */
export function showDescription(item: { teaser?: string | null; subtitle?: string | null; description?: string | null }): string | null {
  const text = [item.teaser, item.subtitle, item.description].map(plainText).find(Boolean);
  if (!text) return null;
  if (text.length <= DESCRIPTION_MAX) return text;
  const head = text.slice(0, DESCRIPTION_MAX - 1);
  const cut = head.lastIndexOf(" ");
  return (cut > 0 ? head.slice(0, cut) : head).trimEnd() + "…";
}
