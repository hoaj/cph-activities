// Pure helpers over DMI's `timeserie` rows (see operations/getForecast.ts).
export type Row = {
  localTimeIso: string;
  temp?: number | null;
  symbol?: number | null;
  precip1?: number | null;
  precip3?: number | null;
  precip6?: number | null;
  precipType?: string | null;
  windGust?: number | null;
};

export type Verdict = {
  outdoor: "dry" | "showers" | "wet";
  rainMm: number;
  wetHours: number;
  dryHours: number;
  minTemp: number | null;
  maxTemp: number | null;
  maxGust: number;
  cold: boolean;
  windy: boolean;
  snow: boolean;
};

/** DMI adds 100 to a symbol code at night. */
export const isNight = (code: number): boolean => code >= 100;

/** DMI's symbol code in Danish; null for a code this CLI does not know (keep the raw number). */
export function describeSymbol(code: number | null | undefined): string | null {
  if (code == null) return null;
  const c = isNight(code) ? code - 100 : code;
  if (c === 1) return "klart";
  if (c === 2) return "let skyet";
  if (c === 3) return "skyet";
  if (c === 45) return "tåge";
  if (c >= 60 && c <= 69) return "regn";
  if (c >= 70 && c <= 79) return "sne";
  if (c >= 80 && c <= 89) return "byger";
  if (c >= 95 && c <= 99) return "torden";
  return null;
}

// localTimeIso is Copenhagen time already: take its parts, never convert.
export const localDate = (localTimeIso: string): string => localTimeIso.slice(0, 10);
export const localClock = (localTimeIso: string): string => localTimeIso.slice(11, 16);

export function rowsInWindow<T extends { localTimeIso: string }>(rows: T[], date: string, fromTime?: string, toTime?: string): T[] {
  return rows.filter((r) => {
    if (localDate(r.localTimeIso) !== date) return false;
    const t = localClock(r.localTimeIso);
    return (!fromTime || t >= fromTime) && (!toTime || t <= toTime);
  });
}

/** Rain in the row's step: precip1, else precip3, else precip6, else 0. */
export const precipOf = (r: Row): number => r.precip1 ?? r.precip3 ?? r.precip6 ?? 0;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function verdict(rows: Row[]): Verdict {
  const rain = rows.map(precipOf);
  const total = rain.reduce((a, b) => a + b, 0);
  const wetHours = rain.filter((p) => p > 0.1).length;
  const temps = rows.map((r) => r.temp).filter((t): t is number => typeof t === "number");
  const minTemp = temps.length ? Math.min(...temps) : null;
  const maxTemp = temps.length ? Math.max(...temps) : null;
  const maxGust = Math.max(0, ...rows.map((r) => r.windGust ?? 0));
  const outdoor = total >= 2 || wetHours > rows.length / 2 ? "wet" : total > 0.2 ? "showers" : "dry";
  return {
    outdoor,
    rainMm: round1(total),
    wetHours,
    dryHours: rows.length - wetHours,
    minTemp,
    maxTemp,
    maxGust,
    cold: minTemp !== null && minTemp < 5,
    windy: maxGust >= 12,
    snow: rows.some((r) => r.precipType === "sne" && precipOf(r) > 0),
  };
}

/** Today's date in Europe/Copenhagen, YYYY-MM-DD. */
export const copenhagenToday = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

/** Whole days from one YYYY-MM-DD to another. */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** "747" or "1600" (DMI's sunrise and sunset) as "07:47" or "16:00"; an HH:MM stays; anything else is null. */
export function clockFromDigits(v: string | null | undefined): string | null {
  if (!v) return null;
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  if (!/^\d{3,4}$/.test(v)) return null;
  const p = v.padStart(4, "0");
  return `${p.slice(0, 2)}:${p.slice(2)}`;
}

export const round = (n: number | null | undefined, digits: number): number | null => (n == null ? null : Math.round(n * 10 ** digits) / 10 ** digits);
