// Helpers for turning kulturKBH's event rows into the command's output.

/** The last four-digit number in a Danish address, taken as its postcode. */
export const postcodeOf = (...texts: Array<string | null | undefined>): string | null => {
  for (const text of texts) {
    const found = (text ?? "").match(/\b\d{4}\b/g)?.at(-1);
    if (found) return found;
  }
  return null;
};

/**
 * Whether a postcode lies in Copenhagen: Københavns or Frederiksberg Kommune (1800–1999 and 2000 are
 * Frederiksberg). Every other municipality is "outside". No postcode is "unknown": most such rows are
 * central museums and libraries, so the command keeps them unless asked not to.
 */
const CPH_POSTCODES = [2100, 2150, 2200, 2300, 2400, 2450, 2500, 2700, 2720]; // Ø, Nordhavn, N, S, NV, SV, Valby, Brønshøj, Vanløse

export const areaOf = (postcode: string | null): "cph" | "outside" | "unknown" => {
  if (postcode === null) return "unknown";
  const n = Number(postcode);
  if (!Number.isInteger(n) || n < 1000 || n > 9999) return "unknown"; // not a Danish postcode
  if (n >= 1000 && n <= 2000) return "cph"; // København K and V, Frederiksberg (1800–1999, 2000)
  if (CPH_POSTCODES.includes(n)) return "cph";
  return "outside";
};

/** true for a price that says free, false for one with an amount, null when it only points elsewhere. */
export const isFree = (price: string | null | undefined): boolean | null => {
  if (!price) return null;
  if (/gratis|fri entr[eé]|free/i.test(price)) return true;
  if (/\d/.test(price)) return false;
  return null;
};

/** The event's own page, where the user reads more or books; relative links resolve on the origin. */
export const absoluteUrl = (url: string, origin: string): string => new URL(url, origin).toString();

/** slug in a source link (`/kilder/<slug>.html`) → postcode of the source's address; sources with none are left out. */
export const postcodeBySlug = (sources: Array<{ href: string; addr: string | null; name?: string }>): Map<string, string> => {
  const map = new Map<string, string>();
  for (const s of sources) {
    const slug = s.href.match(/\/kilder\/([^/]+?)\.html/)?.[1];
    const postcode = postcodeOf(s.addr);
    if (slug && postcode) map.set(slug, postcode);
  }
  return map;
};

const normTitle = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/**
 * kulturKBH lists one event once per source that announces it. Rows with the same date, time (both none
 * counts as the same) and normalised title become one: the first stays, the others go in `alsoAt`.
 */
export const mergeSameEvents = <T extends { date: string; time: string | null; title: string; venue: string | null; url: string }>(
  events: T[],
): Array<T & { alsoAt: Array<{ venue: string | null; url: string }> }> => {
  const byKey = new Map<string, T & { alsoAt: Array<{ venue: string | null; url: string }> }>();
  for (const e of events) {
    const key = `${e.date}|${e.time ?? ""}|${normTitle(e.title)}`;
    const first = byKey.get(key);
    if (first) first.alsoAt.push({ venue: e.venue, url: e.url });
    else byKey.set(key, { ...e, alsoAt: [] });
  }
  return [...byKey.values()];
};
