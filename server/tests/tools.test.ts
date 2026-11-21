import { describe, expect, test } from "bun:test";
import { DATE, TODAY, connectTools, fakeDeps, forecast, item } from "./helpers";

const events = () => [
  item({ id: "k:1", source: "kultunaut", title: "Jazzkoncert i Huset", time: "20:00", categories: ["Musik", "Jazz"], priceMin: 150, priceMax: 150, priceText: "150 kr.", indoor: true, venue: "Huset", extra: { description: "Lang beskrivelse".repeat(20) } }),
  item({ id: "b:1", source: "billetto", title: "Jazzkoncert i Huset", time: "20:15", categories: ["music"], priceMin: 140, priceMax: 140, priceText: "140 kr.", venue: "Huset", url: "https://billetto.test/jazz" }),
  item({ id: "k:2", source: "kultunaut", title: "Gratis foredrag om byen", time: "11:00", categories: ["Foredrag"], free: true, priceMin: 0, venue: "Biblioteket" }),
  item({ id: "a:1", source: "absalon", title: "Fællesspisning", time: "18:00", categories: ["Mad"], priceMin: 60, priceText: "60 kr.", venue: "Absalon" }),
  item({ id: "k:3", source: "kultunaut", title: "Standup aften", time: null, categories: ["Komedie"], venue: "Teatret" }),
  item({ id: "w:1", source: "wannasport", kind: "slots", title: "padel – Bane inde 1", venue: "DGI Byen", indoor: true, times: ["10:00", "14:00", "18:00"], priceMin: 200, priceMax: 400, priceText: "200–400 kr. pr. bane", categories: ["padel"], extra: { sport: "padel", perCourt: true, courtName: "Bane inde 1" } }),
  item({ id: "w:2", source: "wannasport", kind: "slots", title: "badminton – Bane 3", venue: "Hal 9", times: ["09:00"], priceMin: 100, priceMax: 100, categories: ["badminton"], extra: { sport: "badminton", courtName: "Bane 3" } }),
];

describe("plan_outing", () => {
  test("needs_input without a date fetches nothing", async () => {
    const deps = fakeDeps({ items: events() });
    const { call } = await connectTools(deps);
    const r = await call("plan_outing", { brief: { people: [{ age: 31 }, { label: "lillebror" }] } });
    expect(r.isError).toBe(false);
    expect(r.data.status).toBe("needs_input");
    expect(r.data.ask).toContain("lillebror");
    expect(r.data.missing).toEqual(["people[1].age", "mood"]);
    expect(deps.calls).toEqual([]);
  });

  test("needs_input with a date may check the weather, and only the weather", async () => {
    const deps = fakeDeps({ items: events() });
    const { call } = await connectTools(deps);
    const r = await call("plan_outing", { brief: { people: [], date: DATE } });
    expect(r.data.status).toBe("needs_input");
    await new Promise((res) => setTimeout(res, 5));
    expect(deps.calls.flatMap((c) => c.sources)).toEqual(["dmi"]);
  });

  test("a complete brief gives a shortlist with sources, no weather on a dry day, and next steps with patches", async () => {
    const deps = fakeDeps({ items: events() });
    const { call } = await connectTools(deps);
    const r = await call("plan_outing", { brief: { people: [{ age: 30 }, { age: 30 }], date: DATE, mood: ["culture"] } });
    expect(r.data.status).toBe("ok");
    expect(r.data.weather).toBeNull();
    expect(r.data.best.items[0].url).toMatch(/^https:/);
    expect(r.data.sources.map((s: any) => s.source).sort()).toEqual(["absalon", "billetto", "brugbyen", "dmi", "kglteater", "kultunaut", "kulturkbh", "teaterbilletter", "wannasport"]);
    expect(r.data.sources.every((s: any) => s.status === "fresh")).toBe(true);
    expect(Array.isArray(r.data.next)).toBe(true);
    for (const step of r.data.next) expect(typeof step.patch).toBe("object");
    expect(JSON.parse(r.text)).toEqual(r.data);
    expect(r.text).not.toContain("\n");
  });

  test("a wet day puts the weather in the answer", async () => {
    const { call } = await connectTools(fakeDeps({ items: events(), weather: forecast("wet", { rainMm: 6 }) }));
    const r = await call("plan_outing", { brief: { people: [{ age: 30 }], date: DATE, mood: ["culture"] } });
    expect(r.data.weather).toMatch(/regn/);
  });

  test("ids of a suggestion can be opened with get_details", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const r = await call("plan_outing", { brief: { people: [{ age: 30 }], date: DATE, wishes: "jazz" } });
    const id = r.data.best.items[0].ids[0];
    const d = await call("get_details", { id });
    expect(d.isError).toBe(false);
    expect(d.data.title).toContain("Jazz");
    expect(d.data.links.map((l: any) => l.source).sort()).toEqual(["billetto", "kultunaut"]);
  });

  test("bad input is a tool error with a message that says what to fix", async () => {
    const { call } = await connectTools(fakeDeps());
    const bad = await call("plan_outing", { brief: { people: [{ age: 200 }], mood: ["culture"] } });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("age must be at most 120");
    const past = await call("plan_outing", { brief: { people: [{ age: 20 }], date: "2026-11-01", mood: ["culture"] } });
    expect(past.isError).toBe(true);
    expect(past.text).toContain(`in the past (today is ${TODAY})`);
    const fmt = await call("plan_outing", { brief: { people: [], date: "28/11" } });
    expect(fmt.text).toContain("YYYY-MM-DD");
  });
});

describe("find_events", () => {
  test("rows are compact, merged and carry facets", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const r = await call("find_events", { from: DATE });
    expect(r.data.total).toBe(4); // the two jazz rows merge; slots are no events
    const jazz = r.data.events.find((e: any) => e.title.includes("Jazz"));
    expect(jazz.sources.sort()).toEqual(["billetto", "kultunaut"]);
    expect(JSON.stringify(r.data.events)).not.toContain("Lang beskrivelse");
    expect(Object.keys(jazz)).not.toContain("description");
    expect(r.data.facets.bySource.kultunaut).toBe(3);
    expect(r.data.facets.byTimeOfDay).toEqual({ morning: 1, evening: 2, unknown: 1 });
    expect(r.data.facets.byPriceBand).toMatchObject({ free: 1, "101-300": 1, "1-100": 1, unknown: 1 });
    expect(r.data.facets.byCategory.foredrag).toBe(1);
    expect(r.data.events.map((e: any) => e.time)).toEqual(["11:00", "18:00", "20:15", undefined]);
  });

  test("only event sources are asked", async () => {
    const deps = fakeDeps({ items: events() });
    const { call } = await connectTools(deps);
    await call("find_events", { from: DATE });
    expect(deps.calls[0]!.sources).not.toContain("wannasport");
    expect(deps.calls[0]!.sources).not.toContain("dmi");
  });

  test("limit and cursor page through everything once", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await call("find_events", { from: DATE, limit: 3, ...(cursor ? { cursor } : {}) });
      expect(r.data.total).toBe(4);
      seen.push(...r.data.events.map((e: any) => e.id));
      cursor = r.data.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(2);
    expect(new Set(seen).size).toBe(4);
  });

  test("a cursor of another search, or a broken one, is a corrective error", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const first = await call("find_events", { from: DATE, limit: 1 });
    const other = await call("find_events", { from: DATE, query: "jazz", cursor: first.data.nextCursor });
    expect(other.isError).toBe(true);
    expect(other.text).toContain("different search");
    expect((await call("find_events", { from: DATE, cursor: "xyz" })).text).toContain("not valid");
  });

  test("filters: query, category, free, price, time", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const titles = async (a: Record<string, unknown>) => (await call("find_events", { from: DATE, ...a })).data.events.map((e: any) => e.title);
    expect(await titles({ query: "jazz" })).toEqual(["Jazzkoncert i Huset"]);
    expect(await titles({ categories: ["FOREDRAG"] })).toEqual(["Gratis foredrag om byen"]);
    expect(await titles({ free: true })).toEqual(["Gratis foredrag om byen"]);
    expect((await titles({ maxPricePerPerson: 100 })).sort()).toEqual(["Fællesspisning", "Gratis foredrag om byen", "Standup aften"].sort());
    expect(await titles({ fromTime: "18:00", toTime: "19:00" })).toEqual(["Fællesspisning"]);
    const r = await call("find_events", { from: DATE, fromTime: "00:00" });
    expect(r.data.notes.join(" ")).toContain("without a start time");
  });

  test("audienceAge hands brugbyen's group to the cache; excludeKids drops children's events", async () => {
    const deps = fakeDeps({ items: [...events(), item({ source: "kultunaut", title: "Børneteater", audience: ["børn"], categories: ["Børn"] })] });
    const { call } = await connectTools(deps);
    const kids = await call("find_events", { from: DATE, audienceAge: 7 });
    expect(kids.data.events.map((e: any) => e.title)).toEqual(["Børneteater"]);
    expect(deps.calls[0]!.audience).toBe("børn");
    const adults = await call("find_events", { from: DATE, excludeKids: true });
    expect(adults.data.events.map((e: any) => e.title)).not.toContain("Børneteater");
  });

  test("input validation: limit, range, dates, order", async () => {
    const { call } = await connectTools(fakeDeps());
    expect((await call("find_events", { from: DATE, limit: 51 })).text).toContain("limit is at most 50");
    expect((await call("find_events", { from: DATE, to: "2026-12-20" })).text).toContain("longer than 7 days");
    expect((await call("find_events", { from: "2026-11-01" })).text).toContain("in the past");
    expect((await call("find_events", { from: DATE, to: "2026-11-27" })).text).toContain("before from");
    expect((await call("find_events", { from: DATE, fromTime: "9am" })).text).toContain("HH:MM");
    expect((await call("find_events", {})).isError).toBe(true);
  });
});

describe("source statuses", () => {
  test("a missing, stale and capped source are named in sources and notes", async () => {
    const deps = fakeDeps({
      items: events(),
      statuses: { billetto: { status: "missing", kind: "network", ageSeconds: null }, kultunaut: { status: "stale", kind: "drift", ageSeconds: 7200, stale: true }, absalon: { status: "capped", kind: "capped", ageSeconds: 1800, stale: true } },
    });
    const { call } = await connectTools(deps);
    const r = await call("find_events", { from: DATE });
    const by = Object.fromEntries(r.data.sources.map((s: any) => [s.source, s]));
    expect(by.billetto).toEqual({ source: "billetto", status: "missing", kind: "network" });
    expect(by.kultunaut).toEqual({ source: "kultunaut", status: "stale", kind: "drift", ageMinutes: 120 });
    expect(by.absalon).toMatchObject({ status: "capped", kind: "capped", ageMinutes: 30 });
    expect(by.kulturkbh.status).toBe("fresh");
    const notes = r.data.notes.join(" ");
    expect(notes).toContain("billetto is missing");
    expect(notes).toContain("kultunaut is stale (drift)");
    expect(notes).toContain("absalon is capped");
    expect(notes).not.toContain("kulturkbh");
    expect(r.data.events.some((e: any) => e.sources.includes("billetto"))).toBe(false);

    const p = await call("plan_outing", { brief: { people: [{ age: 30 }], date: DATE, mood: ["culture"] } });
    expect(p.data.sources.find((s: any) => s.source === "billetto").status).toBe("missing");
    expect(p.data.notes.join(" ")).toContain("billetto is missing");
  });

  test("the worst status of several days wins", async () => {
    const deps = fakeDeps({ items: events() });
    const real = deps.cache.getDays.bind(deps.cache);
    deps.cache.getDays = async (s, d, o) => {
      const r = await real(s, d, o);
      r.statuses = r.statuses.map((x, i) => (x.source === "absalon" ? { ...x, status: i % 2 ? "stale" : "fresh", ageSeconds: 600, stale: !!(i % 2) } : x)) as any;
      return r;
    };
    const { call } = await connectTools(deps);
    const r = await call("find_events", { from: DATE, to: "2026-11-29" });
    expect(r.data.sources.find((s: any) => s.source === "absalon").status).toBe("stale");
  });
});

describe("find_activity_slots", () => {
  test("courts of the sport with free times in the window, per court and per person", async () => {
    const deps = fakeDeps({ items: events() });
    const { call } = await connectTools(deps);
    const r = await call("find_activity_slots", { sport: "padel", date: DATE, from: "12:00", players: 4 });
    expect(r.data.total).toBe(1);
    expect(r.data.courts[0]).toMatchObject({ venue: "DGI Byen", times: ["14:00", "18:00"], pricePerCourt: "200-400", pricePerPerson: "50-100", indoor: true });
    expect(r.data.players).toBe(4);
    expect(deps.calls[0]!.sources).toEqual(["wannasport"]);
    const d = await call("get_details", { id: r.data.courts[0].id });
    expect(d.data.slots).toEqual(["10:00", "14:00", "18:00"]);
    expect(d.data.perCourt).toBe(true);
  });

  test("a window with no times says so; a bad sport lists the valid ones", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const none = await call("find_activity_slots", { sport: "padel", date: DATE, from: "19:00" });
    expect(none.data.courts).toEqual([]);
    expect(none.data.notes.join(" ")).toContain("none has a free start time");
    const bad = await call("find_activity_slots", { sport: "golf", date: DATE });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain("padel");
  });
});

describe("get_weather", () => {
  test("verdict, line and the hours of the window", async () => {
    const { call } = await connectTools(fakeDeps({ weather: forecast("wet", { rainMm: 5, cold: true }) }));
    const r = await call("get_weather", { date: DATE, from: "17:00", to: "23:00" });
    expect(r.data.available).toBe(true);
    expect(r.data.verdict).toMatchObject({ outdoor: "wet", cold: true, minTemp: 8, maxTemp: 12 });
    expect(r.data.line).toMatch(/aften: .*regn/);
    expect(r.data.hours.map((h: any) => h.time)).toEqual(["18:00", "20:00"]);
  });
  test("no forecast: available false and a note, not an error", async () => {
    const { call } = await connectTools(fakeDeps({ weather: null }));
    const r = await call("get_weather", { date: DATE });
    expect(r.isError).toBe(false);
    expect(r.data.available).toBe(false);
    expect(r.data.notes.join(" ")).toContain("No forecast");
  });
});

describe("get_details and list_options", () => {
  test("an id from find_events gives the full item with every source's link and the description", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const list = await call("find_events", { from: DATE, query: "jazz" });
    const d = await call("get_details", { id: list.data.events[0].id });
    expect(d.data).toMatchObject({ title: "Jazzkoncert i Huset", venue: "Huset", date: DATE });
    expect(d.data.description).toContain("Lang beskrivelse");
    expect(d.data.links).toHaveLength(2);
    // a second source's id opens the same item
    expect((await call("get_details", { id: "b:1" })).data.title).toBe("Jazzkoncert i Huset");
  });
  test("an unknown id is an error that says how to get a valid one", async () => {
    const { call } = await connectTools(fakeDeps({ items: events() }));
    const r = await call("get_details", { id: "nope" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Unknown id "nope"');
    expect(r.text).toContain("repeat the search");
    expect((await call("get_details", {})).isError).toBe(true);
  });
  test("list_options returns the lists and their statuses", async () => {
    const { call } = await connectTools(fakeDeps());
    const r = await call("list_options");
    expect(r.data.sports).toContain("padel");
    expect(r.data.brugbyen.districts).toEqual(["Vesterbro"]);
    expect(r.data.sources).toHaveLength(2);
  });
});

describe("every tool", () => {
  test("is read-only (but send_feedback) and open-world, has an output schema, and the text equals the structured content", async () => {
    const { client, call } = await connectTools(fakeDeps({ items: events() }));
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["find_activity_slots", "find_events", "get_details", "get_weather", "list_options", "plan_outing", "send_feedback"]);
    for (const t of tools.filter((t) => t.name !== "send_feedback")) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
      expect(t.outputSchema).toBeTruthy();
      expect(t.description!.length).toBeGreaterThan(100);
      expect(t.description).toContain("Example");
    }
    const r = await call("list_options");
    expect(JSON.parse(r.text)).toEqual(r.data);
  });
  test("an unexpected failure is a plain tool error and is logged without the input", async () => {
    const deps = fakeDeps();
    deps.cache.getDays = async () => { throw new Error("boom"); };
    const logs: string[] = [];
    const { call } = await connectTools(deps, { log: (e, f) => logs.push(e + JSON.stringify(f)) });
    const r = await call("get_weather", { date: DATE });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("failed internally");
    expect(logs.join(" ")).toContain("boom");
  });
  test("over the link's limit the call is an error result", async () => {
    const { call } = await connectTools(fakeDeps(), { perHour: 1 });
    await call("list_options");
    expect((await call("list_options")).text).toContain("Limit reached");
  });
});
