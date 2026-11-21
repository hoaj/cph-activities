/** kglteater in the planner: its rows, its place in merging, and sold-out performances. Values are planted. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchDay } from "../fetch-day";
import { planOuting } from "../index";
import { mergeItems } from "../merge";
import * as N from "../normalise";
import { SOURCES } from "../types";
import { DATE, brief, days, item, ok, titles } from "./helpers";

const stateRoot = mkdtempSync(join(tmpdir(), "planner-kgl-test-"));
process.on("exit", () => rmSync(stateRoot, { recursive: true, force: true }));

const row = (over: Record<string, unknown> = {}) => ({
  title: "Planted Ballet", date: DATE, time: "19:30", area: "cph", free: false, forChildren: false, premiere: true,
  url: "https://www.kglteater.dk/planted/", bookingUrl: "https://tickets.example.test/planted", genre: "Ballet",
  stage: "Planted Stage", venue: "Planted House", priceMinDKK: 175, priceMaxDKK: 650, ageFrom: 8, availability: "available", note: null, ...over,
});

describe("kglteater in the planner", () => {
  test("is a source", () => {
    expect(SOURCES).toContain("kglteater");
  });

  test("a row becomes an indoor show with price, age, genre and the ticket link", () => {
    const [it] = N.kglteater({ shows: [row()] }, DATE);
    expect(it).toMatchObject({
      source: "kglteater", kind: "show", title: "Planted Ballet", date: DATE, time: "19:30", venue: "Planted Stage", address: "Planted House", area: "cph",
      priceText: "175–650 kr.", priceMin: 175, priceMax: 650, free: false, ageFrom: 8, categories: ["Ballet"], indoor: true,
      url: "https://tickets.example.test/planted", extra: { premiere: true, onSale: true },
    });
  });

  test("without --details only the cheapest price is known, and the text says so", () => {
    const [it] = N.kglteater({ shows: [row({ priceMaxDKK: null })] }, DATE);
    expect(it).toMatchObject({ priceText: "fra 175 kr.", priceMin: 175, priceMax: null });
  });

  test("a free performance costs 0, and one for children carries that audience", () => {
    const [it] = N.kglteater({ shows: [row({ free: true, priceMinDKK: null, priceMaxDKK: null, forChildren: true })] }, DATE);
    expect(it).toMatchObject({ free: true, priceMin: 0, priceMax: 0, audience: ["børn"] });
  });

  test("only rows of the asked day, and two performances of a day keep separate ids", () => {
    const rows = N.kglteater({ shows: [row(), row({ time: "14:00" }), row({ date: "2026-11-22" })] }, DATE);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  test("sold out and cancelled are not on sale; an unknown state stays unknown", () => {
    const onSale = (availability: string | null) => N.kglteater({ shows: [row({ availability })] }, DATE)[0]!.extra.onSale;
    expect(onSale("soldOut")).toBe(false);
    expect(onSale("cancelled")).toBe(false);
    expect(onSale("few")).toBe(true);
    expect(onSale(null)).toBeNull();
  });

  test("a sold-out performance is never suggested", () => {
    const rows = [...N.kglteater({ shows: [row({ title: "Udsolgt Ballet", availability: "soldOut" })] }, DATE), item({ title: "Ledig Koncert", categories: ["Musik"] })];
    const t = titles(ok(planOuting(brief(), days(rows)))).join(" | ");
    expect(t).toContain("Ledig Koncert");
    expect(t).not.toContain("Udsolgt Ballet");
  });

  test("merged with Billetto, the theatre's own row leads and gives the price", () => {
    const [kgl] = N.kglteater({ shows: [row()] }, DATE);
    const other = item({ source: "billetto", title: "Planted Ballet", time: "19:30", venue: "Planted Stage", priceMin: 999, priceMax: 999, url: "https://example.test/other" });
    const merged = mergeItems([other, kgl!]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: "kglteater", priceMin: 175 });
    expect(merged[0]!.sources).toEqual(expect.arrayContaining(["kglteater", "billetto"]));
  });

  test("fetchDay runs the skill's real command with one broad call", async () => {
    const urls: string[] = [];
    const fake = (async (input: RequestInfo | URL) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response("down", { status: 503 });
    }) as typeof fetch;
    const r = await fetchDay("kglteater", DATE, { deps: { fetch: fake, stateRoot, retryDelays: [] } });
    expect(r.calls).toBe(1);
    expect(r.errors[0]).toMatchObject({ kind: "network", code: 5, command: "show list" });
    expect(urls.length).toBeGreaterThan(0);
  });
});
