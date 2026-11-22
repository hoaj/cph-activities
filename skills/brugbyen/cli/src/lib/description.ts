// An event page's description: what `event show` returns from the page's teaser and body.
import site from "../site";

/** Longest description returned, in characters (the cut `…` counts). */
export const MAX_DESCRIPTION = 500;

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * The teaser if it has text, else the body, whitespace collapsed (the Operation already gives plain text with the
 * tags removed and entities decoded); at most MAX_DESCRIPTION characters, cut at a word boundary with `…`. Null when both are empty.
 */
export function describe(teaser: string | null | undefined, body: string | null | undefined): string | null {
  const text = clean(teaser) || clean(body);
  if (!text) return null;
  if (text.length <= MAX_DESCRIPTION) return text;
  const room = text.slice(0, MAX_DESCRIPTION - 1);
  // Cut at the last space when the text is past it; a single word longer than the limit is cut where it stands.
  const at = text[MAX_DESCRIPTION - 1] === " " ? MAX_DESCRIPTION - 1 : room.lastIndexOf(" ");
  const cut = at > 0 ? room.slice(0, at) : room;
  return `${cut.replace(/[\s,;:.\-–]+$/, "")}…`;
}

/**
 * The slug of an event page from `--url`: a path (`/det-sker/<slug>`) or a full URL on brugbyen.kk.dk. Null when it is
 * another host or not exactly one page under /det-sker/ (the list `/det-sker` itself included).
 */
export function eventSlug(input: string): string | null {
  const origin = new URL(site.origin);
  let url: URL;
  try {
    url = new URL(input.trim(), origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== origin.host) return null;
  const m = /^\/det-sker\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!) || null;
  } catch {
    return null;
  }
}
