import { expect, test } from "bun:test";
import { cacheOptionsFromEnv } from "../../src/cache";

test("defaults: cap 30 an hour, no overrides", () => {
  const o = cacheOptionsFromEnv({});
  expect(o.counter!.cap("kultunaut")).toBe(30);
  expect(o.ttlMs).toEqual({});
});

test("SOURCE_CAP_PER_HOUR and per-source overrides", () => {
  const o = cacheOptionsFromEnv({ SOURCE_CAP_PER_HOUR: "12", SOURCE_CAP_PER_HOUR_BILLETTO: "5" });
  expect(o.counter!.cap("kultunaut")).toBe(12);
  expect(o.counter!.cap("billetto")).toBe(5);
});

test("TTL variables map to events, court slots and weather", () => {
  const o = cacheOptionsFromEnv({ CACHE_TTL_EVENTS_S: "120", CACHE_TTL_SLOTS_S: "30", CACHE_TTL_WEATHER_S: "60", CACHE_MAX_ENTRIES: "7", CACHE_MAX_AGE_S: "99" });
  expect(o.ttlMs!.kultunaut).toBe(120_000);
  expect(o.ttlMs!.wannasport).toBe(30_000);
  expect(o.ttlMs!.dmi).toBe(60_000);
  expect(o.maxEntries).toBe(7);
  expect(o.maxAgeMs).toBe(99_000);
});

test("a bad number stops the server at start", () => {
  expect(() => cacheOptionsFromEnv({ SOURCE_CAP_PER_HOUR: "lots" })).toThrow("SOURCE_CAP_PER_HOUR");
});
