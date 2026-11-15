import { expect, test } from "bun:test";
import { firstPageAtOrAfter } from "../src/lib/paging";

const PAGES = 60;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// 60 pages of 12 events, 06:00 -> 23:00 rising; the first page starts with nulls; the last page is not full.
function day() {
  const fetched: number[] = [];
  const pageTimes = (p: number): Array<string | null> => {
    const base = 360 + Math.floor((p * 1020) / PAGES);
    const n = p === PAGES - 1 ? 5 : 12;
    return Array.from({ length: n }, (_, i) => (p === 0 && i < 3 ? null : hhmm(Math.min(base + Math.floor((i * 1020) / PAGES / 12), 1380))));
  };
  const fetchPage = async (p: number) => {
    fetched.push(p);
    const times = p >= PAGES ? [] : pageTimes(p);
    return { times, full: times.length === 12 };
  };
  const last = (p: number) => [...pageTimes(p)].reverse().find((t) => t !== null) ?? null;
  return { fetched, fetchPage, last };
}

test("06:00 and a time on page 0 stay on page 0", async () => {
  const d = day();
  expect((await firstPageAtOrAfter(d.fetchPage, "06:00")).page).toBe(0);
  expect((await firstPageAtOrAfter(day().fetchPage, d.last(0)!)).page).toBe(0);
});

test("20:00 lands on the first page whose last time is >= 20:00", async () => {
  const d = day();
  const r = await firstPageAtOrAfter(d.fetchPage, "20:00");
  let expected = 0;
  while (d.last(expected)! < "20:00") expected++;
  expect(r.page).toBe(expected);
  expect(r.probes).toBeLessThanOrEqual(14);
  expect(new Set(d.fetched).size).toBe(d.fetched.length);
  expect(r.cache.has(r.page)).toBe(true);
  expect(r.probes).toBe(d.fetched.length);
});

test("a time later than every event lands on the last page", async () => {
  const d = day();
  const r = await firstPageAtOrAfter(d.fetchPage, "23:59");
  expect(r.page).toBe(PAGES - 1);
  expect(r.probes).toBeLessThanOrEqual(14);
  expect(new Set(d.fetched).size).toBe(d.fetched.length);
});

test("every start time finds its page within 14 probes", async () => {
  for (let m = 360; m <= 1380; m += 7) {
    const d = day();
    const t = hhmm(m);
    const r = await firstPageAtOrAfter(d.fetchPage, t);
    expect(r.probes).toBeLessThanOrEqual(14);
    expect(r.page === 0 || d.last(r.page - 1)! < t).toBe(true);
    expect(d.last(r.page)! >= t || r.page === PAGES - 1).toBe(true);
  }
});

// KultuNaut's real shape: a timed run, an untimed block, a second timed run, then multi-day rows (times null).
test("a list of several runs lands in the first run, at the page of the time", async () => {
  const run = (from: number, to: number, pages: number) => Array.from({ length: pages }, (_, p) => hhmm(from + Math.floor(((to - from) * p) / (pages - 1))));
  const lasts = [...run(420, 1260, 28), null, null, ...run(690, 1320, 12)]; // pages 0-27, 28-29 untimed, 30-41
  const fetched: number[] = [];
  const fetchPage = async (p: number) => {
    fetched.push(p);
    if (p >= 42) return { times: [] as Array<string | null>, full: false };
    return { times: lasts[p] === null ? Array(12).fill(null) : [lasts[p] as string], full: true };
  };
  const r = await firstPageAtOrAfter(fetchPage, "20:00");
  let expected = 0;
  while (lasts[expected] === null || lasts[expected]! < "20:00") expected++;
  expect(r.page).toBe(expected);
  expect(r.probes).toBeLessThanOrEqual(14);
  expect(new Set(fetched).size).toBe(fetched.length);
});
