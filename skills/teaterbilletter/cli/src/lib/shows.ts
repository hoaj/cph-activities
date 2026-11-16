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
