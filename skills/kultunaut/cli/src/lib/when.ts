// Parses KultuNaut's date text, e.g. "Ons. 18. nov. 2026 kl. 06.50-07.50, Nørrebrohallen".
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };

export type When = { startDate: string | null; endDate: string | null; startTime: string | null; endTime: string | null; multiDay: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (h: string | undefined, m: string | undefined): string | null => {
  if (h === undefined) return null;
  const hh = Number(h);
  const mm = m === undefined ? 0 : Number(m);
  return hh <= 23 && mm <= 59 ? `${pad(hh)}:${pad(mm)}` : null;
};

const DATE = /(\d{1,2})\.(?!\d)(?:\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\b\.?)?(?:\s*(\d{4})\b)?/gi;
const CLOCK_KL = /(\d{1,2})(?:[.:](\d{2}))?(?:\s*-\s*(\d{1,2})(?:[.:-](\d{2}))?)?/;
const CLOCK_MIN = /(\d{1,2})[.:](\d{2})(?:\s*-\s*(\d{1,2})[.:-](\d{2}))?/;

export function parseWhen(text: string | null, venue: string | null): When {
  const none: When = { startDate: null, endDate: null, startTime: null, endTime: null, multiDay: false };
  if (!text) return none;
  let t = text.trim();
  if (venue && t.endsWith(`, ${venue}`)) t = t.slice(0, -(venue.length + 2));

  // Dates are everything up to the last 4-digit year (or up to "kl." when there is none).
  const years = [...t.matchAll(/\b\d{4}\b/g)];
  const lastYear = years[years.length - 1];
  const dateEnd = lastYear ? lastYear.index! + 4 : (t.search(/\bkl\./i) >= 0 ? t.search(/\bkl\./i) : t.length);
  const head = t.slice(0, dateEnd);
  const tail = t.slice(dateEnd);

  const dates: { d: number; m?: number; y?: number; inheritedY?: boolean }[] = [];
  for (const m of head.matchAll(DATE)) {
    dates.push({ d: Number(m[1]), m: m[2] ? MONTHS[m[2].toLowerCase()] : undefined, y: m[3] ? Number(m[3]) : undefined });
  }
  for (let i = dates.length - 2; i >= 0; i--) {
    const cur = dates[i]!;
    const next = dates[i + 1]!;
    if (cur.m === undefined) cur.m = next.m;
    if (cur.y === undefined && next.y !== undefined) {
      cur.y = next.y;
      if (cur.m !== undefined && next.m !== undefined && cur.m > next.m) cur.y -= 1;
    }
  }
  const iso = (x: (typeof dates)[number] | undefined) =>
    x && x.m !== undefined && x.y !== undefined ? `${x.y}-${pad(x.m)}-${pad(x.d)}` : null;
  const startDate = iso(dates[0]);
  const endDate = iso(dates[dates.length - 1]);

  let c: RegExpMatchArray | null = null;
  const kl = tail.match(/\bkl\.\s*/i);
  if (kl) c = tail.slice(kl.index! + kl[0].length).match(CLOCK_KL);
  else c = tail.match(CLOCK_MIN);
  const startTime = c ? hhmm(c[1], c[2]) : null;
  const endTime = c && startTime ? hhmm(c[3], c[4]) : null;

  return { startDate, endDate, startTime, endTime, multiDay: startDate !== null && endDate !== startDate };
}
