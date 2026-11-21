/** Culture Box and Hangaren in the planner: club nights, their door age and sold-out nights. Values are planted. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterEvents } from "../../server/src/find-events";
import { fetchDay } from "../fetch-day";
import { planOuting } from "../index";
import { mergeItems } from "../merge";
import * as N from "../normalise";
import { SOURCES } from "../types";
import { DATE, brief, days, ok, titles } from "./helpers";

const stateRoot = mkdtempSync(join(tmpdir(), "planner-clubs-test-"));
process.on("exit", () => rmSync(stateRoot, { recursive: true, force: true }));

const box = (over: Record<string, unknown> = {}) => ({
  id: "11", title: "Planted Box Night", date: DATE, time: "23:00", endDate: "2026-11-22", endTime: "06:00", venue: "Planted Box", address: "Planted Gade 2",
  area: "cph", rooms: [{ name: "Room A", series: null, artists: ["Artist One", "Artist Two"] }, { name: "Room B", series: null, artists: ["Artist Three"] }],
  price: "120 kr.", priceMinDKK: 120, priceMaxDKK: 150, free: false, soldOut: null, ageFrom: null, ticketUrl: "https://tickets.example.test/box",
  url: "https://culture-box.com/event/planted/", detailsRead: true, ...over,
});
const hangar = (over: Record<string, unknown> = {}) => ({
  id: "22", title: "Planted Hangar Night", date: DATE, time: "23:00", endDate: "2026-11-22", endTime: "06:00", venue: "Hangaren", address: "Planted Vej 3",
  area: "cph", artists: ["Artist Four"], priceText: "100-140 kr.", priceMinDKK: 100, priceMaxDKK: 140, free: false, soldOut: null, ageFrom: 20, cancelled: false,
  ticketUrl: "https://tickets.example.test/hangar", url: "https://www.hangaren.dk/events/planted", ...over,
});
const night = (ages: number[]) => brief({ people: ages.map((age) => ({ age })), mood: ["nightlife"], from: "19:00", to: "23:59" });

describe("club nights in the planner", () => {
  test("both are sources", () => {
    expect(SOURCES).toContain("culturebox");
    expect(SOURCES).toContain("hangaren");
  });

  test("culturebox: a night with its lineup, price, house age and own page, indoors", () => {
    const [it] = N.culturebox({ houseAgeFrom: 18, events: [box()] }, DATE);
    expect(it).toMatchObject({
      id: "culturebox:11", source: "culturebox", kind: "event", title: "Planted Box Night", date: DATE, time: "23:00", endTime: "06:00", venue: "Planted Box",
      address: "Planted Gade 2", priceText: "120 kr.", priceMin: 120, priceMax: 150, free: false, ageFrom: 18, categories: ["Natklub"], indoor: true,
      url: "https://culture-box.com/event/planted/", extra: { description: "Artist One, Artist Two, Artist Three", onSale: null },
    });
  });

  test("culturebox: a night's own age limit beats the house limit", () => {
    expect(N.culturebox({ houseAgeFrom: 18, events: [box({ ageFrom: 21 })] }, DATE)[0]!.ageFrom).toBe(21);
  });

  test("hangaren: the price text, the stated age, and indoor stays unknown", () => {
    const [it] = N.hangaren({ events: [hangar()] }, DATE);
    expect(it).toMatchObject({ id: "hangaren:22", source: "hangaren", priceText: "100-140 kr.", priceMin: 100, priceMax: 140, ageFrom: 20, indoor: null, categories: ["Natklub"] });
    expect(it!.extra.description).toBe("Artist Four");
  });

  test("hangaren: an unstated age is not invented", () => {
    expect(N.hangaren({ events: [hangar({ ageFrom: null })] }, DATE)[0]!.ageFrom).toBeNull();
  });

  test("a night belongs to the date it opens, not the morning it ends", () => {
    expect(N.culturebox({ events: [box()] }, "2026-11-22")).toEqual([]);
    expect(N.hangaren({ events: [hangar()] }, "2026-11-22")).toEqual([]);
  });

  test("a free night costs 0", () => {
    expect(N.hangaren({ events: [hangar({ free: true, priceMinDKK: null, priceMaxDKK: null })] }, DATE)[0]).toMatchObject({ free: true, priceMin: 0, priceMax: 0 });
  });

  test("adults asking for a night out get the clubs", () => {
    const rows = [...N.culturebox({ houseAgeFrom: 18, events: [box()] }, DATE), ...N.hangaren({ events: [hangar()] }, DATE)];
    const t = titles(ok(planOuting(night([25, 25]), days(rows)))).join(" | ");
    expect(t).toContain("Planted Box Night");
    expect(t).toContain("Planted Hangar Night");
  });

  test("a sold-out night is never suggested", () => {
    const rows = [...N.culturebox({ houseAgeFrom: 18, events: [box({ title: "Udsolgt Box", soldOut: true })] }, DATE), ...N.hangaren({ events: [hangar()] }, DATE)];
    const t = titles(ok(planOuting(night([25, 25]), days(rows)))).join(" | ");
    expect(t).toContain("Planted Hangar Night");
    expect(t).not.toContain("Udsolgt Box");
  });

  test("the door age holds for the youngest guest: 19 gets the 18+ club, not the 20+ one", () => {
    const rows = [...N.culturebox({ houseAgeFrom: 18, events: [box()] }, DATE), ...N.hangaren({ events: [hangar()] }, DATE)];
    const t = titles(ok(planOuting(night([25, 19]), days(rows)))).join(" | ");
    expect(t).toContain("Planted Box Night");
    expect(t).not.toContain("Planted Hangar Night");
  });

  test("find_events applies the same door age, and nobody under 18 gets a club", () => {
    const rows = mergeItems([...N.culturebox({ houseAgeFrom: 18, events: [box()] }, DATE), ...N.hangaren({ events: [hangar()] }, DATE)]);
    const hits = (audienceAge: number) => filterEvents(rows, { audienceAge }).kept.map((k) => k.source).sort();
    expect(hits(20)).toEqual(["culturebox", "hangaren"]);
    expect(hits(19)).toEqual(["culturebox"]);
    expect(hits(17)).toEqual([]);
  });

  for (const source of ["culturebox", "hangaren"] as const) {
    test(`fetchDay runs ${source}'s real command with one call`, async () => {
      const fake = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
      const r = await fetchDay(source, DATE, { deps: { fetch: fake, stateRoot, retryDelays: [] } });
      expect(r.calls).toBe(1);
      expect(r.errors[0]).toMatchObject({ kind: "network", code: 5, command: "event list" });
    });
  }
});
