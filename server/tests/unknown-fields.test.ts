// hoaj/cph-activities#53: a filter never removes an event only because the field it looks at is missing.
import { describe, expect, test } from "bun:test";
import snapshot from "../../planner/fixtures/snapshot.json";
import type { Item } from "../../planner/types";
import { DATE, connectTools, fakeDeps, item } from "./helpers";

const find = async (items: Item[], args: Record<string, unknown> = {}) => (await connectTools(fakeDeps({ items }))).call("find_events", { from: DATE, ...args });
const titles = (r: { data: any }) => r.data.events.map((e: any) => e.title as string);
const fitOf = (r: { data: any }, t: string) => r.data.events.find((e: any) => e.title === t);

describe("categories", () => {
  const items = () => [
    item({ title: "Jazz fit", categories: ["Jazz"], time: "20:00" }),
    item({ title: "Foredrag nofit", categories: ["Foredrag"], time: "10:00" }),
    item({ source: "brugbyen", title: "Uden kategori", categories: [], time: "09:00" }),
  ];
  test("fits is kept and yes, does not fit is dropped, an empty list is unknown, kept and ranked after", async () => {
    const r = await find(items(), { categories: ["jazz"] });
    expect(titles(r)).toEqual(["Jazz fit", "Uden kategori"]); // the unknown one is earlier in time but ranked after
    expect(fitOf(r, "Jazz fit")).toMatchObject({ fit: "yes", unknown: [] });
    expect(fitOf(r, "Uden kategori")).toMatchObject({ fit: "unknown", unknown: ["category"] });
    expect(r.data.notes.join(" ")).toContain("1 events have no category and are kept; judge them from the description.");
    expect(r.data.facets.byFit).toEqual({ yes: 1, unknown: 1 });
    expect(r.data.facets.unknownBy).toEqual({ category: 1, price: 0, age: 0, time: 0 });
  });
  test("no category filter: nothing is unknown and no fit note", async () => {
    const r = await find(items());
    expect(r.data.events.every((e: any) => e.fit === "yes" && e.unknown.length === 0)).toBe(true);
    expect(r.data.facets.byFit).toEqual({ yes: 3, unknown: 0 });
    expect(r.data.notes.join(" ")).not.toContain("no category");
  });
});

describe("free", () => {
  const items = () => [
    item({ source: "kultunaut", title: "Pris ukendt", time: "09:00" }),
    item({ source: "billetto", title: "Gratis flag", free: true, time: "12:00" }),
    item({ source: "billetto", title: "Gratis nul", priceMin: 0, time: "13:00" }),
    item({ source: "billetto", title: "Koster", priceMin: 80, time: "10:00" }),
    item({ source: "billetto", title: "Koster flag", free: false, time: "11:00" }),
  ];
  test("free:true keeps free and unknown price, drops known cost; unknown ranks after the confirmed free ones", async () => {
    const r = await find(items(), { free: true });
    expect(titles(r)).toEqual(["Gratis flag", "Gratis nul", "Pris ukendt"]);
    expect(fitOf(r, "Pris ukendt")).toMatchObject({ fit: "unknown", unknown: ["price"], free: null, price: null });
    expect(fitOf(r, "Gratis flag").fit).toBe("yes");
    expect(r.data.notes.join(" ")).toContain("1 events have no price listed and are kept (price unknown, not zero).");
    expect(r.data.facets.unknownBy.price).toBe(1);
  });
  test("maxPricePerPerson: unknown price is kept, marked and ranked after the confirmed ones", async () => {
    const r = await find(items(), { maxPricePerPerson: 100 });
    expect(titles(r).slice(-2).sort()).toEqual(["Koster flag", "Pris ukendt"]); // costs money, amount not listed: unknown too
    expect(fitOf(r, "Gratis flag").fit).toBe("yes");
    expect(fitOf(r, "Pris ukendt")).toMatchObject({ fit: "unknown", unknown: ["price"] });
    expect(titles(r)).toContain("Koster"); // 80 <= 100 fits
    expect((await find(items(), { maxPricePerPerson: 50 })).data.events.map((e: any) => e.title)).not.toContain("Koster");
  });
  test("free and maxPricePerPerson together count one event once", async () => {
    const r = await find(items(), { free: true, maxPricePerPerson: 100 });
    expect(r.data.facets.unknownBy.price).toBe(1);
    expect(r.data.facets.byFit).toEqual({ yes: 2, unknown: 1 });
  });
});

describe("time window", () => {
  const items = () => [
    item({ title: "Tidlig", time: "09:00" }),
    item({ title: "Passer", time: "18:30" }),
    item({ title: "Uden tid", time: null }),
  ];
  test("a start-less event is kept and unknown, a known start outside is dropped", async () => {
    const r = await find(items(), { fromTime: "18:00", toTime: "20:00" });
    expect(titles(r)).toEqual(["Passer", "Uden tid"]);
    expect(fitOf(r, "Uden tid")).toMatchObject({ fit: "unknown", unknown: ["time"] });
    expect(r.data.notes.join(" ")).toContain("1 events have no start time and are kept.");
    expect(r.data.facets.unknownBy.time).toBe(1);
  });
  test("a market still matches by its opening hours and a start-less one is unknown", async () => {
    const r = await find([item({ source: "visitorservice", title: "Julemarked", time: "10:00", endTime: "20:00" }), item({ title: "Tidlig", time: "09:00" })], { fromTime: "18:00" });
    expect(titles(r)).toEqual(["Julemarked"]);
    expect(fitOf(r, "Julemarked").fit).toBe("yes");
  });
});

describe("audienceAge and excludeKids", () => {
  const items = () => [
    item({ title: "Ukendt alder", time: "10:00", categories: ["Foredrag"] }),
    item({ title: "Børneteater", time: "15:00", audience: ["børn"], categories: ["Børn"] }),
    item({ title: "Voksen 18+", time: "10:00", categories: ["Musik"], extra: { description: "Kun 18+" } }),
    item({ title: "Klubaften", time: "23:00", categories: ["Musik"] }),
    item({ title: "Fra 12 år", time: "10:00", ageFrom: 12, categories: ["Film"] }),
  ];
  test("under 10: children's events fit, adult and too-old ones are dropped, no age signal is unknown and ranked after", async () => {
    const r = await find(items(), { audienceAge: 6 });
    expect(titles(r)).toEqual(["Børneteater", "Ukendt alder"]);
    expect(fitOf(r, "Børneteater")).toMatchObject({ fit: "yes", unknown: [] });
    expect(fitOf(r, "Ukendt alder")).toMatchObject({ fit: "unknown", unknown: ["age"] });
    expect(r.data.notes.join(" ")).toContain("1 events have no age information and are kept.");
    expect(r.data.facets.unknownBy.age).toBe(1);
  });
  test("an event with an audience that leaves out children is dropped for under 10", async () => {
    const r = await find([item({ title: "For voksne", audience: ["voksne"] }), item({ title: "Ingen", audience: [] })], { audienceAge: 6 });
    expect(titles(r)).toEqual(["Ingen"]);
  });
  test("age 10 and over: no age signal is not unknown and nothing is dropped for lack of it", async () => {
    const r = await find(items(), { audienceAge: 30 });
    expect(titles(r)).toContain("Ukendt alder");
    expect(fitOf(r, "Ukendt alder").fit).toBe("yes");
    expect(titles(r)).not.toContain("Børneteater");
  });
  test("under 18 still drops 18+ and a club's door age", async () => {
    const r = await find([item({ title: "Over 18", extra: { description: "Aldersgrænse: 18" } }), item({ source: "culturebox", title: "Klub", ageFrom: 18 }), item({ title: "Fin" })], { audienceAge: 16 });
    expect(titles(r)).toEqual(["Fin"]);
  });
  test("excludeKids drops detected children's events only", async () => {
    const r = await find(items(), { excludeKids: true });
    expect(titles(r)).not.toContain("Børneteater");
    expect(titles(r)).toContain("Ukendt alder");
  });
});

describe("query stays strict", () => {
  test("words that are not there drop the event, and unknown fields do not rescue it", async () => {
    const r = await find([item({ title: "Jazz", categories: [] }), item({ title: "Rock", categories: [] })], { query: "jazz" });
    expect(titles(r)).toEqual(["Jazz"]);
  });
});

describe("strict", () => {
  const items = () => [
    item({ title: "Sikker", categories: ["Jazz"], free: true, time: "12:00" }),
    item({ title: "Uden kategori", categories: [], free: true, time: "11:00" }),
    item({ title: "Uden pris", categories: ["Jazz"], time: "10:00" }),
  ];
  test("strict:true drops the unknown ones and says how many", async () => {
    const r = await find(items(), { categories: ["jazz"], free: true, strict: true });
    expect(titles(r)).toEqual(["Sikker"]);
    expect(r.data.total).toBe(1);
    expect(r.data.notes.join(" ")).toContain("strict: 2 events with missing information were dropped (category 1, price 1).");
    expect(r.data.notes.join(" ")).not.toContain("are kept");
    expect(r.data.facets.byFit).toEqual({ yes: 1, unknown: 0 });
  });
  test("without strict the same search keeps them", async () => {
    expect(titles(await find(items(), { categories: ["jazz"], free: true }))).toEqual(["Sikker", "Uden pris", "Uden kategori"]);
  });
  test("a strict search says nothing when nothing was unknown", async () => {
    const r = await find([item({ title: "A", categories: ["Jazz"] })], { categories: ["jazz"], strict: true });
    expect(r.data.notes.join(" ")).not.toContain("strict");
  });
  test("the cursor belongs to the strict flag", async () => {
    const { call } = await connectTools(fakeDeps({ items: items() }));
    const first = await call("find_events", { from: DATE, limit: 1 });
    const other = await call("find_events", { from: DATE, strict: true, cursor: first.data.nextCursor });
    expect(other.isError).toBe(true);
    expect(other.text).toContain("different search");
  });
});

describe("notes and facets count all matches, not the page", () => {
  const many = () => Array.from({ length: 12 }, (_, i) => item({ title: `E${String(i).padStart(2, "0")}`, time: `1${i % 10}:00`, ...(i % 2 ? { free: true } : {}) }));
  test("notes and facets cover every matching event while the page is small", async () => {
    const r = await find(many(), { free: true, limit: 3 });
    expect(r.data.events).toHaveLength(3);
    expect(r.data.total).toBe(12);
    expect(r.data.notes.join(" ")).toContain("6 events have no price listed and are kept");
    expect(r.data.facets.byFit).toEqual({ yes: 6, unknown: 6 });
    expect(r.data.facets.unknownBy.price).toBe(6);
  });
  test("paging keeps the ranking stable: all fitting first, then the unknown, each once", async () => {
    const { call } = await connectTools(fakeDeps({ items: many() }));
    const seen: any[] = [];
    let cursor: string | undefined;
    do {
      const r = await call("find_events", { from: DATE, free: true, limit: 5, ...(cursor ? { cursor } : {}) });
      seen.push(...r.data.events);
      cursor = r.data.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(12);
    expect(new Set(seen.map((e) => e.id)).size).toBe(12);
    expect(seen.map((e) => e.fit)).toEqual([...Array(6).fill("yes"), ...Array(6).fill("unknown")]);
  });
  test("the row and the text carry fit and unknown, and the text equals the structured content", async () => {
    const r = await find(many(), { free: true });
    for (const e of r.data.events) expect(Object.keys(e)).toEqual(expect.arrayContaining(["fit", "unknown"]));
    expect(JSON.parse(r.text)).toEqual(r.data);
  });
});

describe("the tool says so", () => {
  test("find_events describes unknowns, strict and the input", async () => {
    const { client } = await connectTools(fakeDeps());
    const t = (await client.listTools()).tools.find((x) => x.name === "find_events")!;
    expect(t.description).toContain("unknown");
    expect(t.description).toContain("strict");
    expect(Object.keys((t.inputSchema as any).properties)).toContain("strict");
  });
});

describe("the guidance", () => {
  test("instructions say a missing field is not a no, within the length limits; plan_outing says so too", async () => {
    const { INSTRUCTIONS } = await import("../src/instructions");
    expect(INSTRUCTIONS.length).toBeLessThan(4096);
    expect(INSTRUCTIONS).toContain("a missing field is not a no");
    expect(INSTRUCTIONS.slice(0, 512)).not.toContain("unknown");
    const { client } = await connectTools(fakeDeps());
    const d = (await client.listTools()).tools.find((x) => x.name === "plan_outing")!.description!;
    expect(d).toContain("missing field never drops an event");
  });
});

describe("regression: realistic rows from the live sources (recorded snapshot)", () => {
  const day = "2026-11-21";
  const real = (snapshot as unknown as { items: Item[] }).items.filter((i) => i.date === day && i.kind !== "slots");
  const run = async (args: Record<string, unknown>) => (await connectTools(fakeDeps({ items: real }))).call("find_events", { from: day, limit: 50, ...args });
  const sources = (r: { data: any }) => new Set(r.data.events.flatMap((e: any) => e.sources as string[]));

  test("the snapshot has the shapes: brugbyen without category, kultunaut and absalon without price", () => {
    expect(real.filter((i) => i.source === "brugbyen").every((i) => i.categories.length === 0)).toBe(true);
    expect(real.filter((i) => ["kultunaut", "brugbyen", "absalon"].includes(i.source)).every((i) => i.free == null && i.priceMin == null)).toBe(true);
  });
  test("categories musik + free + age 6 still lists brugbyen and kultunaut events", async () => {
    const r = await run({ categories: ["musik"], free: true, audienceAge: 6, limit: 50 });
    const s = sources(r);
    expect(s.has("brugbyen")).toBe(true);
    expect(s.has("kultunaut")).toBe(true);
    expect(r.data.facets.byFit.unknown).toBeGreaterThan(0);
    expect(r.data.facets.unknownBy.category).toBeGreaterThan(0);
    expect(r.data.facets.unknownBy.price).toBeGreaterThan(0);
  });
  test("categories børn + free + age 6 keeps brugbyen, kultunaut and absalon events", async () => {
    const r = await run({ categories: ["børn"], free: true, audienceAge: 6 });
    const s = sources(r);
    for (const src of ["brugbyen", "kultunaut", "absalon"]) expect(s.has(src)).toBe(true);
    expect(r.data.notes.join(" ")).toMatch(/no category and are kept/);
    expect(r.data.notes.join(" ")).toMatch(/no price listed and are kept/);
  });
  test("strict drops those without a category or price", async () => {
    const r = await run({ categories: ["børn"], free: true, audienceAge: 6, strict: true });
    const loose = await run({ categories: ["børn"], free: true, audienceAge: 6 });
    expect(r.data.total).toBeLessThan(loose.data.total);
    expect(r.data.events.every((e: any) => e.fit === "yes")).toBe(true);
    expect(r.data.facets.byFit.unknown).toBe(0);
    expect(r.data.events.every((e: any) => e.categories.length > 0)).toBe(true);
    expect(r.data.notes.join(" ")).toContain("strict:");
  });
});
