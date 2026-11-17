import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Failure } from "../src/runtime/envelope";
import { Client } from "../src/runtime/call";
import eventList from "../src/commands/event-list";
import filterList from "../src/commands/filter-list";
import listEvents from "../src/operations/listEvents";
import site from "../src/site";
import { fakeFetch, makeDeps, tempHome, type Recorded } from "./helpers";

let home: ReturnType<typeof tempHome>;
beforeEach(() => (home = tempHome()));
afterEach(() => home.cleanup());

const opt = (value: string, label: string) => `<option value="${value}">${label}</option>`;
const FILTERS = `<form>
<select name="categories[]">${opt("", "- Alle -")}${opt("133", "Musik")}${opt("134", "Teater")}</select>
<select name="group[]">${opt("", "- Alle -")}${opt("10", "Børn")}${opt("11", "Unge")}${opt("12", "Voksne")}${opt("13", "Seniorer")}</select>
<select name="district[]">${opt("", "- Alle -")}${opt("49", "Vesterbro")}${opt("50", "Nørrebro")}</select>
</form>`;
const card = (id: number, title: string, dateText: string, dates = "") =>
  `<li class="card-grid-item--wrapper"><div class="card-grid-item" data-node-id="${id}"><a href="/det-sker/e${id}"><div class="ribbon"></div><div class="field--name-contact">Huset</div><h3 class="title">${title}</h3><div class="date-text">${dateText}</div><span class="dates">${dates}</span></a></div></li>`;
const page = (cards: string[], total: number, from = 1) =>
  `<!doctype html><html><body>${FILTERS}<div class="view-events-list">${cards.length ? `<div class="search-resume">Viser ${from}-${from + cards.length - 1} af ${total} resultater</div><div class="view-content"><ul class="card-grid--event">${cards.join("")}</ul></div>` : ""}</div></body></html>`;
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

const run = async (handler: (req: Recorded) => Response, cmd: typeof eventList | typeof filterList, args: Record<string, unknown>) => {
  const f = fakeFetch(handler);
  const { deps } = makeDeps(f.fetch, home.dir);
  const c = new Client(site, deps, { confirm: false });
  const parsed = (cmd.args as any).parse(args);
  const out = (await cmd.run(parsed, { call: (op, vars) => c.call(op, vars), session: { ids: {} }, note: () => {} })) as any;
  return { out, calls: f.calls.map((r) => new URL(r.url)) };
};
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Failure) return e;
    throw e;
  }
  throw new Error("expected a Failure");
};

describe("GET /det-sker", () => {
  test("sends repeated keys, reads events and filters, and an empty page keeps the filters", async () => {
    const f = fakeFetch(() => html(page([card(1, "Koncert", "Man. 16. nov. 2026 Kl. 19.30 - 21.30", "2 andre datoer")], 1)));
    const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
    const r = await c.call(listEvents, { from: "2026-11-16", to: "2026-11-17", categories: ["133", "134"], groups: ["10"], districts: ["49"], free: "1", page: "2" });
    const u = new URL(f.calls[0]!.url);
    expect(u.pathname).toBe("/det-sker");
    expect(u.searchParams.get("dates[min]")).toBe("2026-11-16");
    expect(u.searchParams.get("dates[max]")).toBe("2026-11-17");
    expect(u.searchParams.getAll("categories[]")).toEqual(["133", "134"]);
    expect(u.searchParams.getAll("group[]")).toEqual(["10"]);
    expect(u.searchParams.getAll("district[]")).toEqual(["49"]);
    expect(u.searchParams.get("free")).toBe("1");
    expect(u.searchParams.get("page")).toBe("2");
    expect(r.events[0]).toEqual({ id: "1", href: "/det-sker/e1", title: "Koncert", ribbon: "", venue: "Huset", dateText: "Man. 16. nov. 2026 Kl. 19.30 - 21.30", dates: "2 andre datoer" });
    expect(r.resume).toBe("Viser 1-1 af 1 resultater");
    expect(r.categoryIds).toEqual(["", "133", "134"]);
    expect(r.categoryNames).toEqual(["- Alle -", "Musik", "Teater"]);

    const empty = fakeFetch(() => html(page([], 0)));
    const e = await new Client(site, makeDeps(empty.fetch, home.dir).deps, { confirm: false }).call(listEvents, {});
    expect(e.events).toEqual([]);
    expect(e.districtNames).toEqual(["- Alle -", "Vesterbro", "Nørrebro"]);
  });
  test("rejects a bad date", async () => {
    const f = fakeFetch(() => html(page([], 0)));
    expect((await failure(new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false }).call(listEvents, { from: "16-11-2026" } as any))).kind).toBe("input");
    expect(f.calls.length).toBe(0);
  });
});

describe("filter list", () => {
  test("pairs ids and names and drops the placeholder", async () => {
    const { out } = await run(() => html(page([], 0)), filterList, {});
    expect(out.categories).toEqual([{ id: "133", name: "Musik" }, { id: "134", name: "Teater" }]);
    expect(out.groups.map((g: any) => g.name)).toEqual(["Børn", "Unge", "Voksne", "Seniorer"]);
    expect(out.districts).toEqual([{ id: "49", name: "Vesterbro" }, { id: "50", name: "Nørrebro" }]);
  });
});

describe("event list", () => {
  const one = (req: Recorded) => html(page([card(2, "B sent", "Man. 16. nov. 2026 Kl. 21", "1 anden dato"), card(1, "A tidlig", "Man. 16. nov. 2026 Kl. 10 - 12"), card(3, "C uden tid", "Man. 16. nov. 2026"), card(4, "D periode", "01.10.2026 - 28.02.2027Kl. 10 - 17")], 4));

  test("defaults, sorting, mapping, and ongoing left out", async () => {
    const { out, calls } = await run(one, eventList, { from: "2026-11-16" });
    expect(calls.length).toBe(1);
    expect(calls[0]!.searchParams.get("dates[min]")).toBe("2026-11-16");
    expect(calls[0]!.searchParams.get("dates[max]")).toBe("2026-11-16");
    expect(out.complete).toBe(true);
    expect(out.total).toBe(4);
    expect(out.events.map((e: any) => e.title)).toEqual(["A tidlig", "B sent", "C uden tid"]);
    expect(out.events[1]).toMatchObject({ id: "2", venue: "Huset", date: "2026-11-16", shownDate: "2026-11-16", recurring: true, timeMayDiffer: false, time: "21:00", endTime: null, otherDates: 1, ongoing: false, area: "cph", url: "https://brugbyen.kk.dk/det-sker/e2" });
  });
  test("includeOngoing keeps the period", async () => {
    const { out } = await run(one, eventList, { from: "2026-11-16", includeOngoing: true });
    const d = out.events.find((e: any) => e.title === "D periode");
    expect(d).toMatchObject({ ongoing: true, shownDate: "2026-10-01", endDate: "2027-02-28" });
  });
  test("time window leaves out events without a start time", async () => {
    const { out } = await run(one, eventList, { from: "2026-11-16", fromTime: "20:00" });
    expect(out.events.map((e: any) => e.title)).toEqual(["B sent"]);
  });
  test("names resolve against the first page; groups accept aliases and commas", async () => {
    const { out, calls } = await run(one, eventList, { from: "2026-11-16", category: ["musik"], group: ["youth,Voksne"], district: ["nørrebro"], free: true });
    expect(out.events.length).toBe(3);
    expect(calls.length).toBe(2);
    const last = calls[1]!;
    expect(last.searchParams.getAll("categories[]")).toEqual(["133"]);
    expect(last.searchParams.getAll("group[]")).toEqual(["11", "12"]);
    expect(last.searchParams.getAll("district[]")).toEqual(["50"]);
    expect(last.searchParams.get("free")).toBe("1");
    expect(calls[0]!.searchParams.get("categories[]")).toBeNull();
  });
  test("an id works as well as a name", async () => {
    const { calls } = await run(one, eventList, { from: "2026-11-16", category: ["134"] });
    expect(calls[1]!.searchParams.getAll("categories[]")).toEqual(["134"]);
  });
  test("an unknown name is an input failure listing the names", async () => {
    const f = await failure(run(one, eventList, { from: "2026-11-16", group: ["nonsense"] }));
    expect(f.kind).toBe("input");
    expect(f.message).toContain("Børn");
    expect(f.message).toContain("Seniorer");
  });
  test("to before from, a bad time order and a bad date", async () => {
    expect((await failure(run(one, eventList, { from: "2026-11-16", to: "2026-11-15" }))).kind).toBe("input");
    expect((await failure(run(one, eventList, { from: "2026-11-16", fromTime: "20:00", toTime: "10:00" }))).kind).toBe("input");
  });
  test("pages until a short page, and stops at limit", async () => {
    const make = (p: number, n: number) => Array.from({ length: n }, (_, i) => card(p * 100 + i + 1, `E${p}-${i}`, "Man. 16. nov. 2026 Kl. 10"));
    const handler = (req: Recorded) => {
      const p = Number(new URL(req.url).searchParams.get("page") ?? "0");
      return html(page(p === 0 ? make(0, 21) : p === 1 ? make(1, 21) : make(2, 5), 47, p * 21 + 1));
    };
    const all = await run(handler, eventList, { from: "2026-11-16", limit: 200 });
    expect(all.calls.length).toBe(3);
    expect(all.out.events.length).toBe(47);
    expect(all.out.complete).toBe(true);
    const cut = await run(handler, eventList, { from: "2026-11-16", limit: 10 });
    expect(cut.calls.length).toBe(1);
    expect(cut.out.events.length).toBe(10);
    expect(cut.out.complete).toBe(false);
    expect(cut.out.total).toBe(47);
  });
  test("an empty search returns no events", async () => {
    const { out } = await run(() => html(page([], 0)), eventList, { from: "2026-11-20", category: ["musik"], group: ["børn"], district: ["vesterbro"] });
    expect(out).toEqual({ total: 0, complete: true, events: [] });
  });
});

test("an empty ribbon is null in the command output", async () => {
  const { out } = await run(() => html(page([card(1, "X", "Man. 16. nov. 2026")], 1)), eventList, { from: "2026-11-16" });
  expect(out.events[0].ribbon).toBeNull();
});
