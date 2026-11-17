// Reads the date text of a brugbyen event card and its two small counters.
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const pad = (n: number | string) => String(n).padStart(2, "0");

export type DateText = { startDate: string | null; endDate: string | null; startTime: string | null; endTime: string | null };

const clock = (h: string, m: string | undefined) => {
  const hh = Number(h);
  const mm = m === undefined ? 0 : Number(m);
  return hh > 23 || mm > 59 ? null : `${pad(hh)}:${pad(mm)}`;
};

/** `Man. 16. nov. 2026 Kl. 19.30 - 21.30` (an occurrence) or `01.10.2026 - 28.02.2027Kl. 10 - 17` (a period). */
export function parseDateText(text: string | null): DateText {
  const none: DateText = { startDate: null, endDate: null, startTime: null, endTime: null };
  if (!text) return none;
  const klAt = text.search(/kl\./i);
  const datePart = klAt === -1 ? text : text.slice(0, klAt);
  const timePart = klAt === -1 ? "" : text.slice(klAt + 3);

  let startDate: string | null = null;
  let endDate: string | null = null;
  const numeric = [...datePart.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)];
  if (numeric.length > 0) {
    const iso = (m: RegExpMatchArray) => `${m[3]}-${pad(m[2]!)}-${pad(m[1]!)}`;
    startDate = iso(numeric[0]!);
    endDate = iso(numeric[numeric.length - 1]!);
  } else {
    const m = datePart.match(/(\d{1,2})\.\s*([a-zæøå]{3})\.?\s*(\d{4})/i);
    const month = m ? MONTHS.indexOf(m[2]!.toLowerCase()) : -1;
    if (m && month !== -1) startDate = endDate = `${m[3]}-${pad(month + 1)}-${pad(m[1]!)}`;
  }
  if (!startDate) return none;

  const t = timePart.match(/^\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*-\s*(\d{1,2})(?:[.:](\d{2}))?)?/);
  const startTime = t ? clock(t[1]!, t[2]) : null;
  const endTime = startTime && t && t[3] !== undefined ? clock(t[3], t[4]) : null;
  return { startDate, endDate, startTime, endTime };
}

/** `14 andre datoer` -> 14, `1 anden dato` -> 1, nothing -> 0. */
export function otherDates(text: string | null): number {
  const m = text?.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** `Viser 1-21 af 27 resultater` -> 27. */
export function totalOf(resume: string | null): number | null {
  const m = resume?.match(/\baf\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * The day an event occurs within the search. brugbyen's own date filter guarantees an event occurs in the
 * searched period, but a recurring event shows its first upcoming date: on a one-day search the day is the
 * searched one; on a period it is the shown date when that lies in it, else unknown (null).
 * `timeMayDiffer`: the shown time belongs to the shown date, which is another day than `date`.
 */
export function occurrence(o: { from: string; to: string; shownDate: string | null; otherDates: number }): { date: string | null; recurring: boolean; timeMayDiffer: boolean } {
  const date = o.from === o.to ? o.from : o.shownDate !== null && o.shownDate >= o.from && o.shownDate <= o.to ? o.shownDate : null;
  const recurring = o.otherDates > 0;
  return { date, recurring, timeMayDiffer: recurring && o.shownDate !== date };
}
