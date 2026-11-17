// PROTOTYPE, throwaway: captures real public event data once for the plan_outing prototype (ticket #24).
// Run: bun server/prototype/snapshot.prototype.ts   (spawns each skill's CLI from source)
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../skills");
const DAYS = ["2026-11-18", "2026-11-21", "2026-11-22"];
const SPORTS = ["padel", "tabletennis", "badminton", "squash", "tennis", "basketball"];

function cli(skill: string, args: string[]): Promise<any> {
  return new Promise((res) => {
    const p = spawn("bun", ["src/main.ts", ...args], {
      cwd: `${ROOT}/${skill}/cli`,
      env: { ...process.env, SITE_CLI_NONINTERACTIVE: "1" },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    const t = setTimeout(() => p.kill(), 240000);
    p.on("close", () => {
      clearTimeout(t);
      try { res(JSON.parse(out)); } catch { console.error("FAIL", skill, args.join(" ")); res(null); }
    });
  });
}

async function pool<T>(jobs: (() => Promise<T>)[], n: number) {
  const out: T[] = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); }
  }));
  return out;
}

const cut = (s: any, n = 200) => (typeof s === "string" ? (s.length > n ? s.slice(0, n - 1) + "…" : s) : "");
const num = (x: any) => (typeof x === "number" ? x : null);
function parsePrice(text: string | null): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };
  const ns = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(",", ".")));
  if (!ns.length || !/kr|dkk/i.test(text)) return { min: null, max: null };
  return { min: Math.min(...ns), max: Math.max(...ns) };
}
const hhmm = (s?: string | null) => (s && /^\d\d:\d\d/.test(s) ? s.slice(0, 5) : null);

type Item = any;
const base = (o: Partial<Item>): Item => ({
  id: "", source: "", kind: "event", title: "", date: "", time: null, endTime: null, venue: null, address: null,
  area: "cph", priceText: null, priceMin: null, priceMax: null, free: null, ageFrom: null, audience: [],
  categories: [], indoor: null, url: null, extra: {}, ...o,
});

const items: Item[] = [];
const weather: Record<string, any> = {};
const raw: Record<string, number> = {};
const add = (src: string, list: Item[]) => { raw[src] = (raw[src] ?? 0) + list.length; items.push(...list); };

const jobs: (() => Promise<void>)[] = [];
for (const D of DAYS) {
  jobs.push(async () => {
    const r = await cli("kulturkbh", ["event", "list", "--from", D, "--to", D, "--limit", "300", "--include-outside"]);
    add("kulturkbh", (r?.events ?? []).map((e: any, i: number) => {
      const p = parsePrice(e.price);
      return base({
        id: `kulturkbh:${D}:${i}:${e.title}`, source: "kulturkbh", title: e.title, date: e.date, time: hhmm(e.time),
        venue: e.venue?.split(",")[0] ?? null, address: e.venue ?? null, area: e.area ?? "cph", priceText: e.price ?? null,
        priceMin: e.free ? 0 : p.min, priceMax: e.free ? 0 : p.max, free: e.free ?? null, categories: [e.type].filter(Boolean),
        indoor: ["film", "teater", "udstilling", "foredrag", "litteratur"].includes(e.type) ? true : null,
        url: e.url, extra: { description: cut(e.description), alsoAt: e.alsoAt ?? [] },
      });
    }));
  });
  jobs.push(async () => {
    const r = await cli("billetto", ["event", "search", "--from", D, "--to", D, "--limit", "300"]);
    add("billetto", (r?.events ?? []).filter((e: any) => !e.ongoing).map((e: any) => base({
      id: `billetto:${e.id}`, source: "billetto", title: e.title, date: (e.startsAt ?? D).slice(0, 10), time: hhmm(e.startsAt?.slice(11)),
      endTime: e.endsAt && e.endsAt.slice(0, 10) === e.startsAt?.slice(0, 10) ? hhmm(e.endsAt.slice(11)) : null,
      venue: e.venue ?? null, address: e.address ?? null, priceText: e.priceRange ?? null, priceMin: e.free ? 0 : num(e.price),
      priceMax: e.free ? 0 : (parsePrice(e.priceRange).max ?? num(e.price)), free: e.free ?? null,
      categories: [e.category, e.subcategory].filter(Boolean), url: e.url,
      times: e.times ?? undefined, extra: { description: cut(e.description), onSale: e.onSale, slots: e.slots },
    })));
  });
  const kn = async (extra: string[], tag: string) => {
    const r = await cli("kultunaut", ["event", "list", "--from", D, "--limit", "200", ...extra]);
    add("kultunaut", (r?.events ?? []).filter((e: any) => !e.ongoing).map((e: any) => {
      const genres = String(e.genre ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return base({
        id: `kultunaut:${e.id}`, source: "kultunaut", title: e.title, date: e.date, time: hhmm(e.time), endTime: hhmm(e.endTime),
        venue: e.venue ?? null, area: e.area ?? "cph", categories: genres,
        audience: genres.some((g) => /børn/i.test(g)) ? ["børn"] : [],
        indoor: genres.some((g) => /biograf|film|teater|udstilling|foredrag/i.test(g)) ? true : null,
        url: e.url, extra: { description: cut(e.description), fetch: tag },
      });
    }));
  };
  jobs.push(() => kn([], "all"), () => kn(["--from-time", "17:00"], "evening"));
  for (const g of ["børn", "unge", "voksne"]) {
    jobs.push(async () => {
      const r = await cli("brugbyen", ["event", "list", "--from", D, "--limit", "200", "--group", g]);
      add("brugbyen", (r?.events ?? []).map((e: any) => base({
        id: `brugbyen:${e.id}`, source: "brugbyen", title: e.title, date: e.date ?? D, time: hhmm(e.time), endTime: hhmm(e.endTime),
        venue: e.venue ?? null, area: e.area ?? "cph", audience: [g], url: e.url,
        extra: { timeMayDiffer: !!e.timeMayDiffer, recurring: !!e.recurring, group: g },
      })));
    });
  }
  jobs.push(async () => {
    const r = await cli("teaterbilletter", ["show", "list", "--from", D, "--limit", "300"]);
    add("teaterbilletter", (r?.shows ?? []).filter((e: any) => e.date === D).map((e: any, i: number) => base({
      id: `teaterbilletter:${D}:${i}:${e.title}`, source: "teaterbilletter", kind: "show", title: e.title, date: e.date, time: hhmm(e.time),
      venue: e.venue ?? null, address: e.address ?? null, area: e.area ?? "cph",
      priceText: e.priceMinDKK != null ? `${e.priceMinDKK}–${e.priceMaxDKK} kr.` : null, priceMin: num(e.priceMinDKK), priceMax: num(e.priceMaxDKK),
      free: e.priceMaxDKK === 0, ageFrom: num(e.ageFrom),
      audience: (e.ageFrom != null && e.ageFrom <= 12) || /børn/i.test(e.subCategory ?? "") ? ["børn"] : [],
      categories: [e.category, e.subCategory].filter(Boolean), indoor: true, url: e.bookingUrl ?? e.url, extra: { premiere: !!e.premiere },
    })));
  });
  jobs.push(async () => {
    const r = await cli("absalon", ["event", "list", "--from", D, "--limit", "300"]);
    add("absalon", (r?.events ?? []).filter((e: any) => e.date === D).map((e: any, i: number) => {
      const cats: string[] = e.categories ?? [];
      return base({
        id: `absalon:${D}:${i}:${e.title}`, source: "absalon", title: e.title, date: e.date, time: hhmm(e.time), endTime: hhmm(e.endTime),
        venue: e.venue ?? null, address: e.address ?? null, priceText: e.price ?? null, free: e.free ?? null,
        priceMin: e.free ? 0 : parsePrice(e.price).min, priceMax: e.free ? 0 : parsePrice(e.price).max,
        audience: cats.some((c) => /børn/i.test(c)) ? ["børn", "familie"] : [], categories: cats,
        indoor: cats.some((c) => /ude-af-huset/i.test(c)) ? false : null, url: e.url, extra: { description: cut(e.description) },
      });
    }));
  });
  for (const s of SPORTS) {
    jobs.push(async () => {
      const r = await cli("wannasport", ["slot", "search", "--sport", s, "--date", D, "--limit", "10"]);
      const list: Item[] = [];
      for (const v of r?.venues ?? []) for (const c of v.courts ?? []) {
        const inde = /inde/i.test(c.name) && !/udend|ude\b/i.test(c.name) ? true : /udend|\bude\b/i.test(c.name) ? false : null;
        list.push(base({
          id: `wannasport:${D}:${s}:${v.venue}:${c.name}`, source: "wannasport", kind: "slots", title: `${r.sport ?? s} – ${c.name}`,
          date: D, venue: v.venue, area: v.area ?? "cph", priceText: c.priceMinDKK != null ? `${c.priceMinDKK}–${c.priceMaxDKK} kr. pr. bane` : null,
          priceMin: num(c.priceMinDKK), priceMax: num(c.priceMaxDKK), free: false, categories: [s], indoor: inde,
          times: c.times ?? [], url: c.url, extra: { sport: s, perCourt: true, courtName: c.name },
        }));
      }
      add("wannasport", list);
    });
  }
  jobs.push(async () => {
    const all = await cli("dmi", ["forecast", "--date", D]);
    const eve = await cli("dmi", ["forecast", "--date", D, "--from-time", "17:00", "--to-time", "23:00"]);
    const slim = (f: any) => f && { verdict: f.verdict, day: f.day, text: f.text, warnings: f.warnings?.texts ?? [],
      hours: (f.hours ?? []).map((h: any) => ({ time: h.time, temp: h.temp, description: h.description, precipMm: h.precipMm })) };
    weather[D] = { day: slim(all), evening: slim(eve) };
  });
}
await pool(jobs, 4);

// brugbyen: merge the three group fetches by id
const seen = new Map<string, Item>(); const out: Item[] = [];
for (const it of items) {
  if (it.source === "brugbyen" || it.source === "kultunaut") {
    const k = it.id + "|" + it.date;
    const prev = seen.get(k);
    if (prev) { prev.audience = [...new Set([...prev.audience, ...it.audience])]; continue; }
    seen.set(k, it);
  }
  out.push(it);
}
const counts: Record<string, number> = {};
for (const it of out) counts[`${it.source} ${it.date}`] = (counts[`${it.source} ${it.date}`] ?? 0) + 1;
const bySource: Record<string, number> = {};
for (const it of out) bySource[it.source] = (bySource[it.source] ?? 0) + 1;
writeFileSync(resolve(import.meta.dir, "snapshot.json"), JSON.stringify({ capturedAt: new Date().toISOString(), days: DAYS, weather, counts, bySource, items: out }));
console.log(bySource, counts);
