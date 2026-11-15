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
 * Whether a postcode lies in Københavns Kommune. Frederiksberg (1800–1999, 2000) and
 * every other municipality are "outside". No postcode is "unknown": most such rows are
 * central museums and libraries, so the command keeps them unless asked not to.
 */
export const areaOf = (postcode: string | null): "cph" | "outside" | "unknown" => {
  if (postcode === null) return "unknown";
  const n = Number(postcode);
  if (n >= 1000 && n <= 1799) return "cph"; // København K and V
  if ([2100, 2150, 2200, 2300, 2400, 2450, 2500].includes(n)) return "cph"; // Ø, Nordhavn, N, S, NV, SV, Valby
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
