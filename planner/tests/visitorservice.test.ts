/** visitorservice in the planner: a market is open for hours, and the same place on the same day is one market. Values are planted. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CAPS } from "../../server/src/cache/config";
import { fetchDay } from "../fetch-day";
import { planOuting } from "../index";
import { buildItinerary } from "../itinerary";
import type { PlanSuggestion } from "../itinerary";
import { mergeItems } from "../merge";
import * as N from "../normalise";
import { SOURCES } from "../types";
import { DATE, brief, days, item, ok, titles } from "./helpers";

const stateRoot = mkdtempSync(join(tmpdir(), "planner-market-test-"));
process.on("exit", () => rmSync(stateRoot, { recursive: true, force: true }));

const row = (over: Record<string, unknown> = {}) => ({
  id: "77", name: "Planted Julemarked", type: "julemarked", date: DATE, endDate: "2026-11-22", time: "10:00", endTime: "17:00",
  days: [{ date: DATE, time: "10:00", endTime: "17:00" }, { date: "2026-11-22", time: "11:00", endTime: "16:00" }], dayByDay: true,
  venue: "Planted Plads", address: "Planted Gade 1", postcode: "1000", district: "Indre By", area: "cph", indoor: null,
  price: "25 kr.", free: false, url: "https://visitorservice.kk.dk/planted", ...over,
});
const market = (over: Record<string, unknown> = {}, date = DATE) => N.visitorservice({ markets: [row(over)] }, date);

describe("visitorservice in the planner", () => {
  test("is a source with room in the hourly cap for one page per market", () => {
    expect(SOURCES).toContain("visitorservice");
    expect(DEFAULT_CAPS.visitorservice).toBe(60);
  });

  test("a row becomes a market with that day's hours, place, price and link", () => {
    const [it] = market({}, "2026-11-22");
    expect(it).toMatchObject({
      id: "visitorservice:77", source: "visitorservice", kind: "event", title: "Planted Julemarked", date: "2026-11-22", time: "11:00", endTime: "16:00",
      venue: "Planted Plads", address: "Planted Gade 1, 1000", area: "cph", priceText: "25 kr.", priceMin: 25, priceMax: 25, free: false,
      categories: ["Julemarked"], indoor: null, url: "https://visitorservice.kk.dk/planted",
    });
  });

  test("the address stands in for a missing venue, and a free market costs 0", () => {
    const [it] = market({ venue: null, free: true, price: null });
    expect(it).toMatchObject({ venue: "Planted Gade 1", free: true, priceMin: 0, priceMax: 0 });
  });

  test("a market not open that day gives no row", () => {
    expect(market({}, "2026-11-25")).toEqual([]);
  });

  test("a market is suggested while it is open, not only at its opening time", () => {
    const rows = () => [...market(), item({ title: "Eftermiddagskoncert", time: "15:00", categories: ["Musik"] })];
    const social = { mood: ["social" as const] };
    expect(titles(ok(planOuting(brief({ ...social, from: "14:00", to: "18:00" }), days(rows())))).join(" | ")).toContain("Planted Julemarked");
    const later = [...market(), item({ title: "Fællesspisning", time: "19:00", categories: ["Mad"] })];
    expect(titles(ok(planOuting(brief({ ...social, from: "17:30", to: "21:00" }), days(later)))).join(" | ")).not.toContain("Planted Julemarked");
  });

  test("in a day plan a market is a visit inside the window that leaves room for the next stop", () => {
    const stop = (over: Record<string, unknown>) => ({ isThread: false, lead: over, members: [over] }) as unknown as PlanSuggestion;
    const steps = buildItinerary(
      [
        stop({ source: "kultunaut", kind: "event", title: "Koncert", time: "15:00", endTime: "16:00", venue: "Hal" }),
        stop({ source: "visitorservice", kind: "event", title: "Planted Julemarked", time: "10:00", endTime: "19:00", venue: "Planted Plads" }),
      ],
      14 * 60,
      21 * 60,
    )!;
    expect(steps.find((s) => s.includes("Planted Julemarked"))).toBe("16:30 Planted Julemarked, åbent til 19:00 (Planted Plads)");
    expect(steps.some((s) => s.startsWith("15:00") && s.includes("Koncert"))).toBe(true);
  });

  test("another source's market at the same place that day is the same market, and these hours lead", () => {
    const other = item({ source: "brugbyen", title: "Jul på pladsen, marked", time: "12:00", venue: "Planted Plads", categories: ["Marked"] });
    const merged = mergeItems([other, ...market()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: "visitorservice", time: "10:00", endTime: "17:00" });
    expect(merged[0]!.sources).toEqual(expect.arrayContaining(["visitorservice", "brugbyen"]));
  });

  test("a concert at the same place stays its own event", () => {
    const concert = item({ source: "kultunaut", title: "Koncert med kor", time: "15:00", venue: "Planted Plads", categories: ["Musik"] });
    expect(mergeItems([concert, ...market()])).toHaveLength(2);
  });

  test("fetchDay runs the skill's real command for that day", async () => {
    const urls: string[] = [];
    const fake = (async (input: RequestInfo | URL) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response("down", { status: 503 });
    }) as typeof fetch;
    const r = await fetchDay("visitorservice", DATE, { deps: { fetch: fake, stateRoot, retryDelays: [] } });
    expect(r.calls).toBe(1);
    expect(r.errors[0]).toMatchObject({ kind: "network", code: 5, command: "market list" });
    expect(decodeURIComponent(urls[0]!)).toContain(`dates[min]=${DATE}`);
    expect(decodeURIComponent(urls[0]!)).toContain(`dates[max]=${DATE}`);
  });
});
