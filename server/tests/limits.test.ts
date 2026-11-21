import { expect, test } from "bun:test";
import { slidingLimiter } from "../src/limits";

const H = 3600_000;

test("allows 60 calls an hour, then refuses with the time the oldest call leaves the window", () => {
  let now = 1_000_000_000_000;
  const l = slidingLimiter({ now: () => now });
  for (let i = 0; i < 60; i++) {
    expect(l.take("anna")).toEqual({ ok: true });
    now += 1000;
  }
  const r = l.take("anna");
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.window).toBe("hour");
    expect(r.limit).toBe(60);
    expect(r.resetsAt).toBe(1_000_000_000_000 + H);
  }
  now = 1_000_000_000_000 + H;
  expect(l.take("anna")).toEqual({ ok: true });
});

test("a refused call does not use up the allowance", () => {
  let now = 0;
  const l = slidingLimiter({ perHour: 2, perDay: 10, now: () => now });
  l.take("a");
  l.take("a");
  for (let i = 0; i < 5; i++) expect(l.take("a").ok).toBe(false);
  now = H;
  expect(l.take("a").ok).toBe(true);
  expect(l.take("a").ok).toBe(true);
  expect(l.take("a").ok).toBe(false);
});

test("300 calls a day, with the day's reset", () => {
  let now = 0;
  const l = slidingLimiter({ now: () => now });
  // 50 calls in each of six hours: never more than 60 in an hour, 300 in the day.
  for (let h = 0; h < 6; h++) {
    for (let i = 0; i < 50; i++) expect(l.take("a").ok).toBe(true);
    now += H;
  }
  const r = l.take("a");
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.window).toBe("day");
    expect(r.limit).toBe(300);
    expect(r.resetsAt).toBe(24 * H);
  }
  now = 24 * H;
  expect(l.take("a").ok).toBe(true);
});

test("links count separately", () => {
  const l = slidingLimiter({ perHour: 1, perDay: 5, now: () => 0 });
  expect(l.take("a").ok).toBe(true);
  expect(l.take("a").ok).toBe(false);
  expect(l.take("b").ok).toBe(true);
});
