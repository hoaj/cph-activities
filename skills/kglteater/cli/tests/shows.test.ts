import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "../src/runtime/call";
import { Failure } from "../src/runtime/envelope";
import genreList from "../src/commands/genre-list";
import showList from "../src/commands/show-list";
import stageList from "../src/commands/stage-list";
import { areaOf, availability, fitsAge, isRealDate, isSchoolOnly, parseAge, parsePriceRange, priceMin, resolveNames, safeLink, showPathParts, splitNames, toRow, withDetails, type Item } from "../src/lib/shows";
import site from "../src/site";
import { fakeFetch, makeDeps, tempHome, type Recorded } from "./helpers";

const SHOW = "https://www.kglteater.dk/ballet/1111/planted-show/";
const item = (o: Partial<Item> = {}): Item => ({
  startDate: "2030-03-05T19:30:00",
  showName: "Planted show",
  showUrl: SHOW,
  showId: 1,
  category: "Ballet",
  canceled: false,
  isFree: false,
  isTour: false,
  minPrice: 111,
  fullHouse: false,
  tixlySoldOut: false,
  tixlySaleStatusText: "NoStatus",
  tixlyBuyLink: "https://tickets.example.test/planted",
  externalBuyLink: "",
  location: "Operaen",
  label: null,
  promotedLabel: null,
  specialMarking: null,
  ...o,
});

describe("rows", () => {
  test("area: the theatre's Copenhagen stages only, never a tour", () => {
    for (const s of ["Gamle Scene", "Skuespilhuset", "Operaen", "Stærekassen", " operaen "]) expect(areaOf(s, false)).toBe("cph");
    expect(areaOf("Operaen", true)).toBe("outside");
    expect(areaOf("Dyrehaven", false)).toBe("outside");
    expect(areaOf("Moesgaard", false)).toBe("outside");
    expect(areaOf(null, false)).toBe("outside");
  });
  test("availability", () => {
    const a = (o: Partial<Item>) => availability(item(o));
    expect(a({})).toBe("available");
    expect(a({ tixlySaleStatusText: "FewTickets" })).toBe("few");
    expect(a({ tixlySoldOut: true })).toBe("soldOut");
    expect(a({ fullHouse: true })).toBe("soldOut");
    expect(a({ canceled: true, tixlySoldOut: true })).toBe("cancelled");
    expect(a({ tixlySaleStatusText: "" })).toBeNull();
  });
  test("a zero price counts only when the site marks it free", () => {
    expect(priceMin({ isFree: true, minPrice: 0 })).toBe(0);
    expect(priceMin({ isFree: false, minPrice: 0 })).toBeNull();
    expect(priceMin({ isFree: false, minPrice: null })).toBeNull();
    expect(priceMin({ isFree: false, minPrice: 222 })).toBe(222);
  });
  test("school-only performances are recognised", () => {
    expect(isSchoolOnly({ promotedLabel: "KUN FOR SKOLER" })).toBe(true);
    expect(isSchoolOnly({ promotedLabel: "Husk rabat til skoler" })).toBe(false);
    expect(isSchoolOnly({ promotedLabel: null })).toBe(false);
  });
  test("toRow keeps the page link, and the other seller's link first", () => {
    const r = toRow(item({ externalBuyLink: "https://seller.example.test/x", specialMarking: "1. Forpremiere", label: "For børn" }));
    expect(r).toMatchObject({ title: "Planted show", date: "2030-03-05", time: "19:30", venue: "Det Kongelige Teater", area: "cph", priceMinDKK: 111, priceMaxDKK: null, ageFrom: null, premiere: true, forChildren: true, url: SHOW, bookingUrl: "https://seller.example.test/x" });
    expect(toRow(item()).bookingUrl).toBe("https://tickets.example.test/planted");
    expect(toRow(item({ isTour: true, location: null })).venue).toBeNull();
  });
  test("safeLink takes http(s) only", () => {
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("not a url")).toBeNull();
    expect(safeLink("")).toBeNull();
  });
  test("isRealDate", () => {
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
  });
});

describe("show page text", () => {
  test("price ranges", () => {
    expect(parsePriceRange(" 100 - 200 kr. ")).toEqual({ min: 100, max: 200 });
    expect(parsePriceRange("1.050 kr.")).toEqual({ min: 1050, max: 1050 });
    expect(parsePriceRange("Gratis")).toEqual({ min: 0, max: 0 });
    expect(parsePriceRange("Se billetsiden")).toBeNull();
    expect(parsePriceRange(null)).toBeNull();
  });
  test("age", () => {
    expect(parseAge("Anbefales fra 9 år")).toBe(9);
    expect(parseAge("For alle")).toBeNull();
    expect(parseAge(null)).toBeNull();
  });
  test("fitsAge: no stated age fits", () => {
    expect(fitsAge(null, 5)).toBe(true);
    expect(fitsAge(9, 9)).toBe(true);
    expect(fitsAge(9, 8)).toBe(false);
  });
  test("withDetails ignores a top below this date's cheapest ticket", () => {
    const row = toRow(item({ minPrice: 300 }));
    expect(withDetails(row, { priceText: "100 - 500 kr.", ageText: "Anbefales fra 7 år" })).toMatchObject({ priceMinDKK: 300, priceMaxDKK: 500, ageFrom: 7 });
    expect(withDetails(row, { priceText: "100 - 200 kr.", ageText: null }).priceMaxDKK).toBeNull();
    expect(withDetails(toRow(item({ minPrice: null })), { priceText: "Gratis", ageText: null }).priceMaxDKK).toBeNull();
  });
  test("showPathParts takes the site's three-part pages only", () => {
    expect(showPathParts(SHOW)).toEqual({ section: "ballet", season: "1111", slug: "planted-show" });
    expect(showPathParts("https://elsewhere.example.test/ballet/1111/x/")).toBeNull();
    expect(showPathParts("https://www.kglteater.dk/ballet/")).toBeNull();
    expect(showPathParts("nonsense")).toBeNull();
  });
});

describe("names", () => {
  const options = [{ id: "1", name: "Ballet" }, { id: "2", name: "Dans" }, { id: "3", name: "Foredrag og talks" }];
  test("exact first, then a part, any case", () => {
    expect(resolveNames(["BALLET", "talks"], options)).toEqual({ ids: ["1", "3"] });
    expect(resolveNames(["nope"], options)).toEqual({ unknown: ["nope"] });
  });
  test("splitNames takes commas and repeats", () => {
    expect(splitNames(["a, b", "c"])).toEqual(["a", "b", "c"]);
    expect(splitNames(undefined)).toEqual([]);
  });
});

describe("commands", () => {
  let home: ReturnType<typeof tempHome>;
  beforeEach(() => (home = tempHome()));
  afterEach(() => home.cleanup());

  const button = (id: string, name: string) => `<button data-id="${id}" data-name="${name}"></button>`;
  const CALENDAR = `<!doctype html><html><body><div id="filter-all-category-grid">${button("10", "Ballet")}${button("11", "Opera")}${button("12", "Rundvisning")}</div><div id="filter-all-location-grid">${button("20", "Operaen")}${button("21", "Moesgaard")}</div></body></html>`;
  const SHOW_PAGE = `<!doctype html><html><body><main data-testid="show-page"><p data-testid="show-page-production-price-value">100 - 500 kr.</p><p data-testid="show-page-min-age">Anbefales fra 9 år</p></main></body></html>`;
  const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  const run = async (pages: Item[][], cmd: typeof showList | typeof genreList | typeof stageList, args: Record<string, unknown>) => {
    const f = fakeFetch((req: Recorded) => {
      const u = new URL(req.url);
      if (u.pathname === "/api/calendar/activities") {
        const n = Number(u.searchParams.get("page"));
        return json({ items: pages[n - 1] ?? [], hasMore: n < pages.length });
      }
      if (u.pathname === "/kalender/") return html(CALENDAR);
      return html(SHOW_PAGE);
    });
    const { deps } = makeDeps(f.fetch, home.dir);
    const c = new Client(site, deps, { confirm: false });
    const out = (await cmd.run((cmd.args as any).parse(args), { call: (op: any, vars: any) => c.call(op, vars), session: { ids: {} }, note: () => {} } as any)) as any;
    return { out, urls: f.calls.map((r) => new URL(r.url)) };
  };
  const days = { from: "2030-03-05", to: "2030-03-06" };

  test("a plain list reads only the calendar, and sends the dates", async () => {
    const { out, urls } = await run([[item()]], showList, days);
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.get("startDate")).toBe("2030-03-05");
    expect(urls[0]!.searchParams.get("endDate")).toBe("2030-03-06");
    expect(out).toMatchObject({ source: "Det Kongelige Teater (kglteater.dk)", total: 1, complete: true });
    expect(out.shows[0].url).toBe(SHOW);
  });

  test("leaves out guided tours, school-only, cancelled and places outside Copenhagen", async () => {
    const { out } = await run([[item({ category: "Rundvisning" }), item({ promotedLabel: "KUN FOR SKOLER" }), item({ canceled: true }), item({ isTour: true, location: null }), item({ location: "Moesgaard" }), item({ showName: "Kept" })]], showList, days);
    expect(out.shows.map((s: any) => s.title)).toEqual(["Kept"]);
  });

  test("--include-outside and --include-cancelled bring them back", async () => {
    const { out } = await run([[item({ location: "Moesgaard" }), item({ canceled: true })]], showList, { ...days, includeOutside: true, includeCancelled: true });
    expect(out.shows.map((s: any) => [s.area, s.availability])).toEqual([["outside", "available"], ["cph", "cancelled"]]);
  });

  test("--genre and --stage filter on the site, by its ids", async () => {
    const { out, urls } = await run([[item({ location: "Moesgaard" })]], showList, { ...days, genre: ["ballet,opera"], stage: ["moesgaard"] });
    const api = urls.find((u) => u.pathname === "/api/calendar/activities")!;
    expect(api.searchParams.getAll("category")).toEqual(["10", "11"]);
    expect(api.searchParams.getAll("location")).toEqual(["21"]);
    expect(out.shows).toHaveLength(1); // naming a stage outside Copenhagen asks for it
  });

  test("--genre rundvisning asks for the guided tours", async () => {
    const { out } = await run([[item({ category: "Rundvisning" })]], showList, { ...days, genre: ["rundvisning"] });
    expect(out.shows).toHaveLength(1);
  });

  test("--free asks the site and --max-price compares the cheapest ticket", async () => {
    const free = await run([[item({ isFree: true, minPrice: 0 })]], showList, { ...days, free: true });
    expect(free.urls[0]!.searchParams.get("price")).toBe("free");
    expect(free.out.shows[0]).toMatchObject({ free: true, priceMinDKK: 0, priceMaxDKK: 0 });
    const capped = await run([[item({ minPrice: 100, showName: "Cheap" }), item({ minPrice: 300 }), item({ minPrice: null })]], showList, { ...days, maxPrice: 200 });
    expect(capped.out.shows.map((s: any) => s.title)).toEqual(["Cheap"]);
  });

  test("time window", async () => {
    const { out } = await run([[item({ startDate: "2030-03-05T12:00:00" }), item({ startDate: "2030-03-05T19:30:00", showName: "Evening" })]], showList, { ...days, fromTime: "18:00", toTime: "20:00" });
    expect(out.shows.map((s: any) => s.title)).toEqual(["Evening"]);
  });

  test("stops paging at --limit and says the list is not complete", async () => {
    const { out, urls } = await run([[item(), item()], [item()]], showList, { ...days, limit: 2 });
    expect(urls).toHaveLength(1);
    expect(out).toMatchObject({ total: 2, complete: false });
  });

  test("--details reads each production's page once, adding the top price and age", async () => {
    const { out, urls } = await run([[item(), item({ startDate: "2030-03-06T19:30:00" })]], showList, { ...days, details: true });
    expect(urls.filter((u) => u.pathname === "/ballet/1111/planted-show/")).toHaveLength(1);
    expect(out.shows[1]).toMatchObject({ priceMinDKK: 111, priceMaxDKK: 500, ageFrom: 9 });
    expect(out.showsWithoutDetails).toBe(0);
  });

  test("reads at most 10 show pages a run and counts the rest", async () => {
    const many = Array.from({ length: 12 }, (_, i) => item({ showId: i + 1, showUrl: `https://www.kglteater.dk/ballet/1111/planted-${i}/` }));
    const { out, urls } = await run([many], showList, { ...days, details: true });
    expect(urls.filter((u) => u.pathname.startsWith("/ballet/"))).toHaveLength(10);
    expect(out.showsWithoutDetails).toBe(2);
    expect(out.shows[11].ageFrom).toBeNull();
  });

  test("--age keeps productions at or under it", async () => {
    const { out } = await run([[item()]], showList, { ...days, age: 8 });
    expect(out.shows).toEqual([]);
    const fits = await run([[item()]], showList, { ...days, age: 9 });
    expect(fits.out.shows).toHaveLength(1);
  });

  test("bad input is exit 2, before any list call", async () => {
    const fails = async (args: Record<string, unknown>) => {
      try {
        await run([[item()]], showList, args);
      } catch (e) {
        expect(e).toBeInstanceOf(Failure);
        expect((e as Failure).kind).toBe("input");
        return;
      }
      throw new Error("expected a Failure");
    };
    await fails({ from: "2030-03-06", to: "2030-03-05" });
    await fails({ ...days, fromTime: "20:00", toTime: "18:00" });
    await fails({ ...days, genre: ["no-such-genre"] });
    await fails({ ...days, stage: ["no-such-stage"] });
    expect(() => (showList.args as any).parse({ from: "2030-02-30" })).toThrow();
  });

  test("genre list and stage list", async () => {
    const g = await run([], genreList, {});
    expect(g.out.genres).toEqual([{ name: "Ballet", inDefaultList: true }, { name: "Opera", inDefaultList: true }, { name: "Rundvisning", inDefaultList: false }]);
    const s = await run([], stageList, {});
    expect(s.out.stages).toEqual([{ name: "Operaen", area: "cph" }, { name: "Moesgaard", area: "outside" }]);
  });
});
