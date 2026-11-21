import { expect, test } from "bun:test";
import { DayCache, createSourceCounter } from "../../src/cache";
import { H, clock, day, failure, fakeFetchDay, fakeFiler } from "./helpers";

const make = (answer: Parameters<typeof fakeFetchDay>[0], extra: Partial<ConstructorParameters<typeof DayCache>[0]> = {}) => {
  const c = clock();
  const f = fakeFetchDay(answer);
  const filer = fakeFiler();
  const logs: [string, any][] = [];
  const cache = new DayCache({ fetchDay: f.fn, now: c.now, filer: filer.filer, skillVersion: () => "9.9.9", log: (e, x) => logs.push([e, x]), ...extra });
  return { c, f, cache, filer, logs };
};

test("a day is fetched once and served fresh within its TTL", async () => {
  const { c, f, cache } = make((n, s, d) => day(s, d, [`v${n}`]));
  const a = await cache.getDay("kulturkbh", "2026-12-01");
  c.advance(59 * 60_000);
  const b = await cache.getDay("kulturkbh", "2026-12-01");
  expect(f.calls.length).toBe(1);
  expect(a.status.status).toBe("fresh");
  expect(b.status).toMatchObject({ status: "fresh", stale: false, ageSeconds: 59 * 60 });
  expect(b.fetch.items[0]!.title).toBe("v1");
});

test("TTLs: events 1 h, court slots 10 min, weather 1 h", async () => {
  const { c, f, cache } = make((n, s, d) => day(s, d));
  for (const s of ["kultunaut", "wannasport", "dmi"] as const) await cache.getDay(s, "2026-12-01");
  c.advance(11 * 60_000);
  const w = await cache.getDay("wannasport", "2026-12-01");
  const k = await cache.getDay("kultunaut", "2026-12-01");
  const d = await cache.getDay("dmi", "2026-12-01");
  expect(w.status.status).toBe("stale");
  expect(k.status.status).toBe("fresh");
  expect(d.status.status).toBe("fresh");
  c.advance(50 * 60_000);
  expect((await cache.getDay("kultunaut", "2026-12-01")).status.status).toBe("stale");
  expect((await cache.getDay("dmi", "2026-12-01")).status.status).toBe("stale");
  await cache.idle();
  expect(f.calls.filter((x) => x.source === "wannasport").length).toBe(2);
});

test("TTLs are configurable", async () => {
  const { c, cache } = make((n, s, d) => day(s, d), { ttlMs: { kultunaut: 1000 } });
  await cache.getDay("kultunaut", "2026-12-01");
  c.advance(1500);
  expect((await cache.getDay("kultunaut", "2026-12-01")).status.status).toBe("stale");
});

test("stale-while-revalidate: an expired day is served at once while the refresh runs", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { c, f, cache } = make(async (n, s, d) => {
    if (n === 2) await gate;
    return day(s, d, [`v${n}`]);
  });
  await cache.getDay("kulturkbh", "2026-12-01");
  c.advance(2 * H);
  const served = await cache.getDay("kulturkbh", "2026-12-01"); // returns while fetch 2 is still waiting
  expect(served.fetch.items[0]!.title).toBe("v1");
  expect(served.status).toMatchObject({ status: "stale", stale: true, ageSeconds: 7200 });
  expect(served.status.kind).toBeUndefined();
  expect(f.calls.length).toBe(2);
  release();
  await cache.idle();
  const next = await cache.getDay("kulturkbh", "2026-12-01");
  expect(next.fetch.items[0]!.title).toBe("v2");
  expect(next.status.status).toBe("fresh");
});

test("nothing is served past the hard max age of 24 h", async () => {
  const { c, cache } = make((n, s, d) => (n === 1 ? day(s, d) : failure(s, d, { kind: "network", code: 5 })));
  await cache.getDay("kulturkbh", "2026-12-01");
  c.advance(23 * H);
  await cache.getDay("kulturkbh", "2026-12-01");
  await cache.idle();
  const still = await cache.getDay("kulturkbh", "2026-12-01");
  expect(still.status).toMatchObject({ status: "stale", kind: "network" });
  c.advance(2 * H);
  const gone = await cache.getDay("kulturkbh", "2026-12-01");
  expect(gone.status).toMatchObject({ status: "missing", kind: "network", ageSeconds: null });
  expect(gone.fetch.items).toEqual([]);
});

test("single flight: 20 concurrent callers share one upstream fetch", async () => {
  const { f, cache } = make(async (n, s, d) => {
    await Bun.sleep(20);
    return day(s, d);
  });
  const all = await Promise.all(Array.from({ length: 20 }, () => cache.getDay("kultunaut", "2026-12-01")));
  expect(f.calls.length).toBe(1);
  expect(all.every((r) => r.status.status === "fresh" && r.fetch.items.length === 1)).toBe(true);
});

test("single flight also covers the refresh of an expired day", async () => {
  const { c, f, cache } = make(async (n, s, d) => {
    await Bun.sleep(10);
    return day(s, d);
  });
  await cache.getDay("kultunaut", "2026-12-01");
  c.advance(2 * H);
  await Promise.all(Array.from({ length: 20 }, () => cache.getDay("kultunaut", "2026-12-01")));
  await cache.idle();
  expect(f.calls.length).toBe(2);
});

test("brugbyen is keyed by audience; other sources ignore it", async () => {
  const { f, cache } = make((n, s, d) => day(s, d));
  await cache.getDay("brugbyen", "2026-12-01", { audience: "børn" });
  await cache.getDay("brugbyen", "2026-12-01", { audience: "børn" });
  await cache.getDay("brugbyen", "2026-12-01", { audience: "voksne" });
  await cache.getDay("brugbyen", "2026-12-01");
  expect(f.calls.length).toBe(3);
  expect(f.calls[0]!.deps.fetch).toBeFunction();
});

test("LRU: beyond N entries the least recently used day goes first", async () => {
  const { f, cache } = make((n, s, d) => day(s, d), { maxEntries: 3 });
  for (const d of ["2026-12-01", "2026-12-02", "2026-12-03"]) await cache.getDay("kultunaut", d);
  await cache.getDay("kultunaut", "2026-12-01"); // touch: 02 is now the oldest
  await cache.getDay("kultunaut", "2026-12-04"); // evicts 02
  expect(cache.size).toBe(3);
  const before = f.calls.length;
  await cache.getDay("kultunaut", "2026-12-01");
  await cache.getDay("kultunaut", "2026-12-03");
  expect(f.calls.length).toBe(before);
  await cache.getDay("kultunaut", "2026-12-02");
  expect(f.calls.length).toBe(before + 1);
});

test("the default size is 500 entries", async () => {
  const { cache } = make((n, s, d) => day(s, d));
  for (let i = 0; i < 510; i++) await cache.getDay("kultunaut", `d${i}`);
  expect(cache.size).toBe(500);
});

test("getDays returns the planner's days plus one status per source and date", async () => {
  const { cache } = make((n, s, d) => (s === "dmi" ? { ...day(s, d, []), weather: { date: d, summary: "x" } as any } : day(s, d, [`${s}-${d}`])));
  const r = await cache.getDays(["kultunaut", "dmi"], ["2026-12-01", "2026-12-02"]);
  expect(r.days.days).toEqual(["2026-12-01", "2026-12-02"]);
  expect(r.days.items.length).toBe(2);
  expect(Object.keys(r.days.weather)).toEqual(["2026-12-01", "2026-12-02"]);
  expect(r.statuses.map((s) => `${s.source}|${s.date}|${s.status}`).sort()).toEqual([
    "dmi|2026-12-01|fresh", "dmi|2026-12-02|fresh", "kultunaut|2026-12-01|fresh", "kultunaut|2026-12-02|fresh",
  ]);
});

// ---- the cap ----

const capped = (cap: number, requestsPerFetch: number, extra = {}) => {
  const c = clock();
  const upstream: string[] = [];
  const counter = createSourceCounter({ defaultCap: cap, now: c.now });
  const f = fakeFetchDay(async (n, s, d) => {
    for (let i = 0; i < requestsPerFetch; i++) {
      try {
        await f.calls[n - 1]!.deps.fetch("https://example.test/x");
      } catch (e) {
        return failure(s, d, { kind: "network", code: 5, message: (e as Error).message }); // what a skill makes of a refused request
      }
    }
    return day(s, d, [`v${n}`]);
  });
  const cache = new DayCache({ fetchDay: f.fn, now: c.now, counter, fetch: (async (u: any) => (upstream.push(String(u)), new Response("{}"))) as any, ttlMs: { kultunaut: 1 }, ...extra });
  return { c, f, cache, upstream, counter };
};

test("the cap: the 31st upstream request in an hour is not made; the last entry is served as capped", async () => {
  const { c, cache, upstream } = capped(30, 1);
  await cache.getDay("kultunaut", "2026-12-01"); // request 1
  for (let i = 0; i < 29; i++) {
    c.advance(10);
    await cache.getDay("kultunaut", "2026-12-01"); // refresh in the background: requests 2..30
    await cache.idle();
  }
  expect(upstream.length).toBe(30);
  c.advance(10);
  const r = await cache.getDay("kultunaut", "2026-12-01");
  await cache.idle();
  expect(upstream.length).toBe(30);
  expect(r.status).toMatchObject({ status: "capped", stale: true, note: "capped", kind: "capped" });
  expect(r.fetch.items.length).toBe(1);
  // an hour after the first request, the allowance comes back
  c.advance(H);
  await cache.getDay("kultunaut", "2026-12-01");
  await cache.idle();
  expect(upstream.length).toBe(31);
  expect((await cache.getDay("kultunaut", "2026-12-01")).status.status).not.toBe("capped");
});

test("a cap reached in the middle of a day fetch reads as capped, not as a network error", async () => {
  const { c, cache, upstream } = capped(2, 3);
  const r = await cache.getDay("kultunaut", "2026-12-01");
  expect(upstream.length).toBe(2);
  expect(r.status).toMatchObject({ status: "missing", kind: "capped", note: "capped" });
  expect(cache.failureStreaks().kultunaut ?? 0).toBe(0);
  c.advance(H + 1);
  expect((await cache.getDay("kultunaut", "2026-12-01")).status.kind).toBe("capped"); // 3 requests, cap 2 again
});

test("capped with no earlier entry: the source is missing with kind capped, and nothing is fetched", async () => {
  const counter = createSourceCounter({ defaultCap: 0 });
  const f = fakeFetchDay((n, s, d) => day(s, d));
  const cache = new DayCache({ fetchDay: f.fn, counter });
  const r = await cache.getDay("dmi", "2026-12-01");
  expect(f.calls.length).toBe(0);
  expect(r.status).toMatchObject({ status: "missing", kind: "capped", note: "capped", ageSeconds: null });
});

test("caps are per source and can be overridden per source", async () => {
  const counter = createSourceCounter({ defaultCap: 1, caps: { dmi: 5 } });
  expect(counter.cap("kultunaut")).toBe(1);
  expect(counter.cap("dmi")).toBe(5);
  const f = counter.fetchFor("kultunaut", (async () => new Response("{}")) as any);
  await f("https://x.test");
  await expect(f("https://x.test")).rejects.toThrow("cap");
  expect(counter.used("dmi")).toBe(0);
});

test("a billetto day fetch counts one request for the Chrome bootstrap, which deps.fetch never sees", async () => {
  const counter = createSourceCounter({ defaultCap: 30 });
  const f = fakeFetchDay((n, s, d) => day(s, d));
  const cache = new DayCache({ fetchDay: f.fn, counter });
  await cache.getDay("billetto", "2026-12-01");
  expect(counter.used("billetto")).toBe(1);
  await cache.getDay("kultunaut", "2026-12-01");
  expect(counter.used("kultunaut")).toBe(0);
});

// ---- failures ----

const FP = "cph-activities:dmi:GET /NinJo2DmiDk/ninjo2dmidk:zod:city:invalid_type";
const drifting = (s: string, d: string) => failure(s, d, { kind: "drift", code: 3, fingerprint: FP, message: "city was Roskilde-secret-42" });

test("drift: serves the last good day as stale and hands the filer one report per Fingerprint", async () => {
  const { c, cache, filer } = make((n, s, d) => (n === 1 ? day(s, d, ["good"]) : drifting(s, d)), { retryBackoffMs: 0 });
  await cache.getDay("dmi", "2026-12-01");
  c.advance(2 * H);
  const first = await cache.getDay("dmi", "2026-12-01");
  await cache.idle();
  expect(first.fetch.items[0]!.title).toBe("good");
  const again = await cache.getDay("dmi", "2026-12-01");
  await cache.idle();
  expect(again.status).toMatchObject({ status: "stale", stale: true, kind: "drift", staleSince: new Date(c.t).toISOString() });
  for (let i = 0; i < 5; i++) {
    c.advance(10 * 60_000);
    await cache.getDay("dmi", "2026-12-01");
    await cache.idle();
  }
  expect(filer.filed.length).toBe(1);
  expect(filer.filed[0]).toMatchObject({ fingerprint: FP, source: "dmi", skillVersion: "9.9.9" });
  expect(Object.keys(filer.filed[0]!).sort()).toEqual(["at", "fingerprint", "skillVersion", "source"]);
  expect(JSON.stringify(filer.filed)).not.toContain("Roskilde-secret-42");
});

test("drift with no earlier data: missing with kind drift, and the issue is still filed", async () => {
  const { cache, filer } = make((n, s, d) => drifting(s, d));
  const r = await cache.getDay("dmi", "2026-12-01");
  await cache.idle();
  expect(r.status).toMatchObject({ status: "missing", kind: "drift", ageSeconds: null });
  expect(filer.filed.length).toBe(1);
});

test("a failed refresh backs off, so a broken source is not hit on every call", async () => {
  const { c, f, cache } = make((n, s, d) => (n === 1 ? day(s, d) : failure(s, d, { kind: "network", code: 5 })));
  await cache.getDay("kultunaut", "2026-12-01");
  c.advance(2 * H);
  for (let i = 0; i < 5; i++) {
    await cache.getDay("kultunaut", "2026-12-01");
    await cache.idle();
  }
  expect(f.calls.length).toBe(2);
  c.advance(61_000);
  await cache.getDay("kultunaut", "2026-12-01");
  await cache.idle();
  expect(f.calls.length).toBe(3);
});

test("network and timeout: serve stale, file nothing, count a streak per source", async () => {
  const { c, cache, filer } = make((n, s, d) => (n === 1 ? day(s, d) : failure(s, d, { kind: n === 3 ? "timeout" : "network", code: n === 3 ? 0 : 5 })), { retryBackoffMs: 0 });
  await cache.getDay("kultunaut", "2026-12-01");
  c.advance(2 * H);
  let r = await cache.getDay("kultunaut", "2026-12-01");
  await cache.idle();
  for (let i = 0; i < 2; i++) {
    r = await cache.getDay("kultunaut", "2026-12-01");
    await cache.idle();
  }
  r = await cache.getDay("kultunaut", "2026-12-01");
  expect(r.status).toMatchObject({ status: "stale", stale: true, kind: "network" });
  expect(r.fetch.items.length).toBe(1);
  expect(filer.filed).toEqual([]);
  expect(cache.failureStreaks().kultunaut).toBeGreaterThanOrEqual(3);
  expect(cache.failureStreaks().dmi).toBeUndefined();
});

test("a good fetch ends the streak and the stale mark", async () => {
  let fail = true;
  const { c, cache } = make((n, s, d) => (n === 1 || !fail ? day(s, d, [`v${n}`]) : failure(s, d, { kind: "network", code: 5 })), { retryBackoffMs: 0 });
  await cache.getDay("kultunaut", "2026-12-01");
  c.advance(2 * H);
  await cache.getDay("kultunaut", "2026-12-01");
  await cache.idle();
  expect(cache.failureStreaks().kultunaut).toBe(1);
  fail = false;
  await cache.getDay("kultunaut", "2026-12-01");
  await cache.idle();
  const r = await cache.getDay("kultunaut", "2026-12-01");
  expect(r.status).toMatchObject({ status: "fresh", stale: false });
  expect(r.status.staleSince).toBeUndefined();
  expect(cache.failureStreaks().kultunaut).toBe(0);
});

test("no previous data and a network error: missing with kind network", async () => {
  const { cache, filer } = make((n, s, d) => failure(s, d, { kind: "network", code: 5 }));
  const r = await cache.getDay("kultunaut", "2026-12-01");
  expect(r.status).toMatchObject({ status: "missing", kind: "network", stale: false, ageSeconds: null });
  expect(r.fetch.items).toEqual([]);
  expect(filer.filed).toEqual([]);
});

test("input and bug (a missing Chrome): serve stale, log an alert, file nothing", async () => {
  const { c, cache, filer, logs } = make((n, s, d) => (n === 1 ? day(s, d) : failure(s, d, { kind: "input", code: 2, message: "Chrome not found" })));
  await cache.getDay("billetto", "2026-12-01");
  c.advance(2 * H);
  const r = await cache.getDay("billetto", "2026-12-01");
  await cache.idle();
  expect(r.status.status).toBe("stale");
  expect((await cache.getDay("billetto", "2026-12-01")).status.kind).toBe("input");
  expect(logs.some(([e, x]) => e === "source_alert" && x.kind === "input" && x.source === "billetto")).toBe(true);
  expect(filer.filed).toEqual([]);
});

test("a fetchDay that throws is a bug, not a crash", async () => {
  const { cache } = make(() => {
    throw new Error("boom");
  });
  const r = await cache.getDay("kultunaut", "2026-12-01");
  expect(r.status).toMatchObject({ status: "missing", kind: "bug" });
});
