// get_details reads a brugbyen event's description on demand (brugbyen's lists carry none).
import { describe, expect, test } from "bun:test";
import type { runSkill } from "../../planner/fetch-day";
import { createSourceCounter } from "../src/cache";
import { createDescriptionLoader } from "../src/details";
import { connectTools, DATE, fakeDeps, item } from "./helpers";

type Run = typeof runSkill;
const A = "https://brugbyen.kk.dk/det-sker/garn-cafe-0";
const brug = (over: Parameters<typeof item>[0] = {}) => item({ source: "brugbyen", id: `brugbyen:${Math.random().toString(36).slice(2)}`, title: "Garn-café", venue: "Vanløse Bibliotek", url: A, audience: ["voksne"], ...over });
const found = (description: string | null): Awaited<ReturnType<Run>> => ({ ok: true, output: { title: "Garn-café", url: A, description } });
const failed: Awaited<ReturnType<Run>> = { ok: false, error: { kind: "drift", code: 4, command: "event show", message: "gone" } };

function setup(items: ReturnType<typeof item>[], o: { run?: Run; counter?: ReturnType<typeof createSourceCounter>; now?: () => number } = {}) {
  const calls: { argv: string[]; fetch?: typeof fetch }[] = [];
  const run: Run = o.run ?? (async (_s, argv, deps) => (calls.push({ argv, fetch: deps?.fetch }), found("Strik og hækling.")));
  const base = o.run ? (async (s, argv, deps) => (calls.push({ argv, fetch: deps?.fetch }), o.run!(s, argv, deps))) as Run : run;
  const deps = { ...fakeDeps({ items }), descriptions: createDescriptionLoader({ run: base, ...(o.counter ? { counter: o.counter } : {}), ...(o.now ? { now: o.now } : {}) }) };
  return { deps, calls };
}
const idOf = async (call: Awaited<ReturnType<typeof connectTools>>["call"], title: string) => (await call("find_events", { from: DATE })).data.events.find((e: any) => e.title === title).id;

describe("get_details for a brugbyen event", () => {
  test("found: runs `event show --url <path>` and returns the text as description", async () => {
    const e = brug();
    const { deps, calls } = setup([e]);
    const { call } = await connectTools(deps);
    const d = await call("get_details", { id: await idOf(call, "Garn-café") });
    expect(d.data.description).toBe("Strik og hækling.");
    expect(d.data.notes.join(" ")).not.toContain("No description");
    expect(calls.map((c) => c.argv)).toEqual([["event", "show", "--url", "/det-sker/garn-cafe-0"]]);
  });

  test("not found: no description, a note, the call still succeeds", async () => {
    const { deps } = setup([brug()], { run: async () => failed });
    const { call } = await connectTools(deps);
    const d = await call("get_details", { id: await idOf(call, "Garn-café") });
    expect(d.isError).toBe(false);
    expect(d.data.description).toBeUndefined();
    expect(d.data.notes).toContain("brugbyen's page could not be read: no description.");
    expect(d.data.title).toBe("Garn-café");
  });

  test("an empty page gives no description and no failure note", async () => {
    const { deps } = setup([brug()], { run: async () => found(null) });
    const { call } = await connectTools(deps);
    const d = await call("get_details", { id: await idOf(call, "Garn-café") });
    expect(d.data.description).toBeUndefined();
    expect(d.data.notes.join(" ")).not.toContain("could not be read");
  });

  test("capped: the counting fetch refuses, the item comes back with the note", async () => {
    const counter = createSourceCounter({ caps: { brugbyen: 0 } });
    // the skill's own fetch is the counting one: over the cap it throws and runSkill reports a network error
    const run: Run = async (_s, _a, deps) => {
      try {
        await deps!.fetch!("https://brugbyen.kk.dk/det-sker/garn-cafe-0");
      } catch {}
      return { ok: false, error: { kind: "network", code: 5, command: "event show", message: "cap" } };
    };
    const { deps } = setup([brug()], { run, counter });
    const { call } = await connectTools(deps);
    const d = await call("get_details", { id: await idOf(call, "Garn-café") });
    expect(d.isError).toBe(false);
    expect(d.data.description).toBeUndefined();
    expect(d.data.notes).toContain("brugbyen's page could not be read: no description.");
    expect(counter.trips("brugbyen")).toBe(1);
  });

  test("the second call is cached (24 h); a failure is cached for 10 minutes only", async () => {
    let t = 0;
    const { deps, calls } = setup([brug()], { now: () => t });
    const { call } = await connectTools(deps);
    const id = await idOf(call, "Garn-café");
    await call("get_details", { id });
    t += 23 * 3600_000;
    expect((await call("get_details", { id })).data.description).toBe("Strik og hækling.");
    expect(calls.length).toBe(1);
    t += 2 * 3600_000;
    await call("get_details", { id });
    expect(calls.length).toBe(2);

    let ok = false;
    let u = 0;
    const f = setup([brug()], { now: () => u, run: async () => (ok ? found("Nu med tekst.") : failed) });
    const c2 = await connectTools(f.deps);
    const id2 = await idOf(c2.call, "Garn-café");
    expect((await c2.call("get_details", { id: id2 })).data.description).toBeUndefined();
    ok = true;
    u += 5 * 60_000;
    expect((await c2.call("get_details", { id: id2 })).data.description).toBeUndefined();
    expect(f.calls.length).toBe(1);
    u += 6 * 60_000;
    expect((await c2.call("get_details", { id: id2 })).data.description).toBe("Nu med tekst.");
    expect(f.calls.length).toBe(2);
  });

  test("concurrent calls for one id share one request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { deps, calls } = setup([brug()], { run: async () => (await gate, found("Delt.")) });
    const { call } = await connectTools(deps);
    const id = await idOf(call, "Garn-café");
    const all = Promise.all([call("get_details", { id }), call("get_details", { id }), call("get_details", { id })]);
    await new Promise((r) => setTimeout(r, 20));
    release();
    const rs = await all;
    expect(rs.map((r) => r.data.description)).toEqual(["Delt.", "Delt.", "Delt."]);
    expect(calls.length).toBe(1);
  });

  test("other sources and items that already have a description are left alone", async () => {
    const { deps, calls } = setup([
      item({ source: "kultunaut", title: "Jazz", extra: {} }),
      brug({ title: "Med tekst", url: "https://brugbyen.kk.dk/det-sker/x", extra: { description: "Står der allerede." } }),
    ]);
    const { call } = await connectTools(deps);
    const jazz = await call("get_details", { id: await idOf(call, "Jazz") });
    expect(jazz.data.description).toBeUndefined();
    const has = await call("get_details", { id: await idOf(call, "Med tekst") });
    expect(has.data.description).toBe("Står der allerede.");
    expect(calls.length).toBe(0);
  });

  test("a merged item with a brugbyen member uses it only when no other member has a description", async () => {
    const mk = (withText: boolean) => [
      item({ source: "kultunaut", title: "Garn-café", venue: "Vanløse Bibliotek", time: "14:00", extra: withText ? { description: "Fra kultunaut." } : {} }),
      brug({ time: "14:00" }),
    ];
    const a = setup(mk(false));
    const ca = await connectTools(a.deps);
    const da = await ca.call("get_details", { id: await idOf(ca.call, "Garn-café") });
    expect(da.data.links).toHaveLength(2);
    expect(da.data.description).toBe("Strik og hækling.");
    expect(a.calls.length).toBe(1);
    const b = setup(mk(true));
    const cb = await connectTools(b.deps);
    const db = await cb.call("get_details", { id: await idOf(cb.call, "Garn-café") });
    expect(db.data.description).toBe("Fra kultunaut.");
    expect(b.calls.length).toBe(0);
  });
});
