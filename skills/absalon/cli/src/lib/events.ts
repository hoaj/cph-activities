// Pure helpers for the Absalon calendar: entity decoding, categories and prices.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  oslash: "ø", aring: "å", aelig: "æ", Oslash: "Ø", Aring: "Å", AElig: "Æ",
};

/** Decodes the entities the calendar's titles and texts use, once (so `&amp;amp;` is `&amp;`). */
export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+));/g, (whole, dec, hex, name) => {
    if (name) return NAMED[name] ?? whole;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
    try {
      return String.fromCodePoint(code);
    } catch {
      return whole;
    }
  });
}

export const CATEGORY_NAMES: Record<string, string> = {
  bevaegelse: "Bevægelse",
  vaerksteder: "Værksteder",
  dans: "Dans",
  yoga: "Yoga",
  "boern-familie": "Børn & familie",
  keramik: "Keramik",
  spisning: "Spisning",
  "banko-quiz-spil": "Banko, quiz & spil",
  "alt-det-andet": "Alt det andet",
  "fest-koncert": "Fest & koncert",
  "ude-af-huset": "Ude af huset",
  markeder: "Markeder",
  "viden-snak": "Viden & snak",
  filmvisning: "Filmvisning",
};

/** Category slugs from the `event-category-<slug>` classes. */
export function categoriesOf(classNames: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const c of classNames ?? []) {
    const m = /^event-category-(.+)$/.exec(c);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export const categoryName = (slug: string): string => CATEGORY_NAMES[slug] ?? slug;

const AMOUNT = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?`;
const AFTER = new RegExp(String.raw`(?<![\w])${AMOUNT}\s*(?:kr\b\.?|,-|DKK\b)`, "i");
const BEFORE = new RegExp(String.raw`(?<![\w])(?:kr\b\.?|DKK\b)\s*${AMOUNT}(?![\d])`, "i");

/** The first amount in the text as `NNN kr.`, "gratis" when it says free (and names no amount), else null. */
export function priceOf(details: string | null | undefined): string | null {
  if (!details) return null;
  const hits = [AFTER.exec(details), BEFORE.exec(details)].filter((m): m is RegExpExecArray => m !== null);
  if (hits.length) {
    const m = hits.sort((a, b) => a.index - b.index)[0];
    return `${m[1]}${m[2] ? "," + m[2] : ""} kr.`;
  }
  return /\b(?:gratis|free|fri entr[eé])\b/i.test(details) ? "gratis" : null;
}

/** true for free, false for an amount, null when the text says neither. */
export function isFree(details: string | null | undefined): boolean | null {
  const p = priceOf(details);
  return p === null ? null : p === "gratis";
}

export const VENUE = "Folkehuset Absalon";
export const ADDRESS = "Sønder Boulevard 73, 1720 København V";
const KIDS = "boern-familie";
const AWAY = "ude-af-huset";

/** One occurrence as the calendar page carries it (the fields the command reads). */
export type Occurrence = {
  title: string;
  start: string;
  end?: string | null;
  details?: string | null;
  permalink: string;
  postId: number;
  classNames?: string[] | null;
};

const norm = (s: string) => s.trim().toLowerCase();

/** Category slugs for the user's values (slug or Danish label, any case, comma lists); `unknown` lists what matched nothing. */
export function resolveCategories(values: readonly string[]): { slugs: string[] } | { unknown: string[] } {
  const slugs: string[] = [];
  const unknown: string[] = [];
  for (const raw of values.flatMap((v) => v.split(",")).map(norm).filter(Boolean)) {
    const slug = Object.keys(CATEGORY_NAMES).find((s) => s === raw || norm(CATEGORY_NAMES[s]) === raw);
    if (!slug) unknown.push(raw);
    else if (!slugs.includes(slug)) slugs.push(slug);
  }
  return unknown.length ? { unknown } : { slugs };
}

export type Selection = {
  from: string;
  to: string;
  categories?: string[];
  excludeKids: boolean;
  free: boolean;
  fromTime?: string;
  toTime?: string;
  query?: string;
  limit: number;
};

export function selectEvents(rows: readonly Occurrence[], sel: Selection) {
  const words = sel.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const events = rows
    .map((e) => {
      const slugs = categoriesOf(e.classNames);
      const away = slugs.includes(AWAY);
      const details = e.details ? decodeEntities(e.details) : null;
      const title = decodeEntities(e.title);
      return {
        slugs,
        text: `${title} ${details ?? ""}`.toLowerCase(),
        out: {
          title,
          date: e.start.slice(0, 10),
          time: e.start.slice(11, 16) || null,
          endTime: e.end ? e.end.slice(11, 16) || null : null,
          categories: slugs.map(categoryName),
          price: priceOf(details),
          free: isFree(details),
          venue: away ? null : VENUE,
          address: away ? null : ADDRESS,
          area: away ? "unknown" : "cph",
          description: details ? details.slice(0, 200) : null,
          url: e.permalink,
        },
      };
    })
    .filter(({ out }) => out.date >= sel.from && out.date <= sel.to)
    .filter(({ slugs }) => !sel.categories?.length || slugs.some((s) => sel.categories!.includes(s)))
    .filter(({ slugs }) => !sel.excludeKids || !slugs.includes(KIDS))
    .filter(({ out }) => !sel.free || out.free === true)
    .filter(({ out }) => !sel.fromTime || (out.time ?? "") >= sel.fromTime)
    .filter(({ out }) => !sel.toTime || (out.time ?? "") <= sel.toTime)
    .filter(({ text }) => words.every((w) => text.includes(w)))
    .map(({ out }) => out)
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  return { total: events.length, events: events.slice(0, sel.limit) };
}

/** Occurrences per category from `from` on, most first. */
export function categoryCounts(rows: readonly Occurrence[], from: string) {
  const counts = new Map<string, number>();
  for (const e of rows) {
    if (e.start.slice(0, 10) < from) continue;
    for (const s of categoriesOf(e.classNames)) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts].map(([slug, count]) => ({ slug, name: categoryName(slug), count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}
