/** Small text and time helpers, and the Danish keyword lists the planner matches on. */

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

/** "HH:MM" to minutes, null for anything else. */
export const tmin = (t: string | null | undefined): number | null =>
  typeof t === "string" && /^\d\d:\d\d/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null;

export const hhmm = (m: number): string =>
  String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

export function uniq<T>(list: (T | null | undefined | "")[]): T[] {
  return [...new Set(list.filter((x): x is T => x != null && x !== ""))];
}

/** Lower case, emoji and punctuation removed, whitespace collapsed; accents are kept. */
export const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const venueNorm = (v: string | null | undefined): string =>
  norm(String(v ?? "").split(/,|\||\s-\s/)[0]).replace(/^(kulturhuset|spillestedet|teatret) /, "");

/** Same place: one normalised venue name contains the other (the guide skill's rule). */
export function samePlace(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = venueNorm(a);
  const y = venueNorm(b);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
}

export const dayName = (date: string): string => WEEKDAYS[new Date(date + "T12:00:00").getDay()]!;
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Stem match with a unicode-aware left boundary (\b does not know ø, å, æ). */
const stems = (list: string): RegExp => new RegExp("(?<![\\p{L}])(?:" + list + ")", "iu");

export const RX = {
  adult: stems(
    "natklub|club ?night|clubnight|klubaften|natfest|bar(?![\\p{L}])|vinsmagning|ølsmagning|vin(?![\\p{L}])|øl(?![\\p{L}])|wine|beer|cocktail|tasting|party(?![\\p{L}])|afterparty|after party|rave|techno|house ?party|dj(?![\\p{L}])|natteliv",
  ),
  kids: stems(
    "børn|baby|småbørn|familie|tumle|legestue|rytmik|dukketeater|kids|for de mindste|børneteater|børnebio|sansefest|forældre",
  ),
  noise: stems(
    "kursus|forløb|sæsonkort|medlemskab|tilmelding|u\\d{1,2}(?![\\p{L}\\d])|årgang|hold(?![\\p{L}])|holdet|træning|trin \\d|weekendkursus|ugentlig",
  ),
  outdoor: stems(
    "udendørs|udeaktivitet|ude(?![\\p{L}])|torvedag|loppemarked|julemarked|juletræsmarked|byvandring|byens rum|i naturen|ekskursion|løbe|løb(?![\\p{L}])|havn|skøjt|powerwalk|stavgang|fodboldkamp|tur(?![\\p{L}])|rundt i",
  ),
  active: stems(
    "løb(?![\\p{L}])|løbe|running|yoga|padel|fitness|motion|boldspil|fodbold|håndbold|bordtennis|ketcher|badminton|squash|tennis|gymnastik|svøm|klatr|skøjt|kampsport|bevægelse|dans(?!k)|powerwalk|stavgang|sport|bowling|pilates|crossfit|basket",
  ),
  culture: stems(
    "musik|koncert|teater|forestilling|udstilling|foredrag|film|biograf|dokumentar|litteratur|lyrik|oplæsning|opera|ballet|klassisk|jazz|comedy|stand ?up|revy|kunst|museum|performance|heritage|omvisning|show|cabaret|dukketeater|science|fine_art|books|performing|nycirkus|drama|thriller|komedie",
  ),
  social: stems(
    "spisning|fællesspis|banko|quiz|spil(?!lested)|workshop|værksted|keramik|marked|fest|fælles|café|community|food|mad(?![\\p{L}])|hobby|craft|diy|bingo|brætspil|meetup|byfest|loppemarked|julemarked|juletræsmarked|sang|kor(?![\\p{L}])|åbent hus",
  ),
  calm: stems(
    "yoga|meditation|udstilling|omvisning|natur|stille|lyrik|oplæsning|spa(?![\\p{L}])|klassisk|keramik|akvarel|tegning|bibliotek|kirke|gudstjeneste|wellness|mindful",
  ),
  food: stems("spisning|mad(?![\\p{L}])|gastronomi|food|brunch|frokost|middag|smagning|dinner|kaffe|fællesspis"),
  gaming: stems(
    "game(?![sr])|gaming|rollespil|ttrpg|esport|e-sport|brætspil|bordspil|[\\p{L}]*nørd|spillab|arcade|videospil|patata|lan(?![\\p{L}])|quiz|bingo|spil(?!lested)",
  ),
  nightMusic: stems("elektronisk|hip-?hop|rock|electro|disco|metal|pop|fest & koncert|rave|techno|dj(?![\\p{L}])"),
  concerts: /koncert|musik|jazz|klassisk|rock|pop/i,
  theatre: /teater|forestilling|stand up|revy|komedie/i,
};

export const MOOD_DA: Record<string, string> = {
  active: "aktivt",
  culture: "kultur",
  social: "socialt",
  calm: "roligt",
  food: "mad",
  gaming: "gaming",
  nightlife: "natteliv",
};
