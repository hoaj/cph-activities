/** The five walkthroughs of the prototype (hoaj/cph-activities#24) against its recorded snapshot of real public data. */
import { describe, expect, test } from "bun:test";
import snapshot from "../fixtures/snapshot.json";
import { applyPatch, planOuting, shownIds } from "../index";
import type { Brief, PlannerDays } from "../types";
import { ok, suggestions, titles } from "./helpers";

const data = snapshot as unknown as PlannerDays;
const all = (r: ReturnType<typeof ok>) => suggestions(r).flatMap((s) => s.items);

describe("recorded snapshot", () => {
  test("holds the three recorded days with rows from every event source", () => {
    expect(data.days).toEqual(["2026-11-18", "2026-11-21", "2026-11-22"]);
    const sources = new Set(data.items.map((i) => i.source));
    for (const s of ["kulturkbh", "billetto", "kultunaut", "brugbyen", "teaterbilletter", "absalon", "wannasport"]) expect(sources.has(s as never)).toBe(true);
  });
});

describe("1 lillebror without an age", () => {
  const first: Brief = { people: [{ label: "mig", age: 31 }, { label: "lillebror" }], date: "2026-11-21" };
  test("asks first: the age and the what, two questions with options", () => {
    const r = planOuting(first, data);
    if (r.status !== "needs_input") throw new Error("expected needs_input");
    expect(r.missing).toEqual(["people[1].age", "mood"]);
    expect(r.ask).toContain("Hvor gammel er lillebror?");
    expect(r.ask.match(/\?/g)).toHaveLength(2);
    expect(r.options.age?.length).toBeGreaterThan(1);
    expect(r.options.mood).toContain("active");
  });
  test("with 17, active and gaming: no club nights or kids' events, a gaming thread, indoor padel, outdoors left out for the cold", () => {
    const r = ok(planOuting({ ...first, people: [{ label: "mig", age: 31 }, { label: "lillebror", age: 17 }], mood: ["active", "gaming"], budgetPerPerson: 300 }, data));
    expect(r.weather).toContain("koldt");
    expect(r.best?.kind).toBe("tråd");
    expect(r.best?.items.length).toBeGreaterThanOrEqual(2);
    expect(r.best?.items.map((i) => i.title).join(" ")).toMatch(/game on|spil/i);
    const padel = suggestions(r).find((s) => s.kind === "aktiv");
    expect(padel?.items[0]!.title).toMatch(/padel/i);
    expect(padel?.items[0]!.place).toMatch(/inde/i);
    expect(titles(r).join(" ")).not.toMatch(/natklub|klubaften|natfest|børneteater/i);
    expect(r.assumptions.join(" ")).toContain("koldt");
    expect(new Set(suggestions(r).map((s) => s.kind)).size).toBeGreaterThanOrEqual(2);
  });
});

describe("2 rainy date evening", () => {
  const brief: Brief = { people: [{ age: 31 }, { age: 31 }], date: "2026-11-18", from: "18:00", to: "23:00", mood: ["culture"] };
  test("says rain, leaves outdoors out, gives different kinds and an evening plan", () => {
    const r = ok(planOuting(brief, data));
    expect(r.weather).toMatch(/regn/);
    expect(r.assumptions.join(" ")).toContain("Regn: udendørs er sorteret fra.");
    expect(r.best).not.toBeNull();
    expect(r.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(titles(r).join(" ")).not.toMatch(/udendørs|julemarked|havn/i);
    expect(r.plan?.length).toBeGreaterThanOrEqual(2);
    expect(all(r).every((i) => i.time === "tid: se siden" || i.time >= "18:00")).toBe(true);
  });
  test("the first next step is one call with a patched brief", () => {
    const r = ok(planOuting(brief, data));
    const step = r.next[0]!;
    expect(step.label).toMatch(/[A-Za-zæøå]/);
    const again = planOuting(applyPatch(brief, step.patch), data);
    expect(again.status).toBe("ok");
    expect(JSON.stringify(step.patch)).not.toBe("{}");
  });
});

describe("3 free family Sunday", () => {
  const first: Brief = { people: [{ age: 35 }, { age: 34 }, { age: 4 }, { age: 7 }], date: "2026-11-22", from: "10:00", to: "16:00", budgetPerPerson: 0 };
  test("a budget and times alone are not a what: asks", () => {
    expect(planOuting(first, data).status).toBe("needs_input");
  });
  test("only kids' and family things, only free, nothing late; an unpriced brugbyen row says so", () => {
    const r = ok(planOuting({ ...first, mood: ["culture", "social"] }, data));
    expect(r.best).not.toBeNull();
    // nothing with a known price; an unknown price is kept and says so, ranked after the sure ones
    expect(all(r).every((i) => i.price === "gratis" || i.price.startsWith("gratis?") || i.price === "pris ikke oplyst")).toBe(true);
    // the sure free ones come first: the unpriced brugbyen rows ("gratis?") follow and are counted
    expect(all(r).some((i) => i.price === "gratis")).toBe(true);
    expect(r.assumptions.join(" ")).toMatch(/har ingen pris oplyst og er med/);
    expect(all(r).every((i) => i.time === "tid: se siden" || (i.time >= "10:00" && i.time < "16:00"))).toBe(true);
    expect(r.assumptions.join(" ")).toContain("Gratis-brief");
    expect(r.best!.why.join(" ")).toContain("for børn");
  });
  test("show others hides what was shown", () => {
    const brief: Brief = { ...first, mood: ["culture", "social"] };
    const r = ok(planOuting(brief, data));
    const shown = new Set(shownIds(r));
    expect(shown.size).toBeGreaterThan(0);
    const again = ok(planOuting({ ...brief, excludeIds: [...shown] }, data));
    expect(all(again).flatMap((i) => i.ids).some((id) => shown.has(id))).toBe(false);
  });
});

describe("4 a 17-year-old wants to go out", () => {
  const brief: Brief = { people: [{ label: "mig", age: 31 }, { label: "lillebror", age: 17 }], date: "2026-11-21", from: "20:00", to: "02:00", mood: ["nightlife"] };
  test("late concerts and shows, and says clubs and bars were left out because of the age", () => {
    const r = ok(planOuting(brief, data));
    expect(r.best).not.toBeNull();
    expect(titles(r).join(" ")).not.toMatch(/natfest|club ?night|klubaften|\bbar\b|18\+/i);
    expect(all(r).every((i) => i.time >= "19:00")).toBe(true);
    const text = r.assumptions.join(" ");
    expect(text).toContain("under 18");
    expect(text).toContain("klubber, barer");
  });
  test("with two adults the parties are back", () => {
    const r = ok(planOuting({ ...brief, people: [{ age: 31 }, { age: 31 }] }, data));
    expect(titles(r).join(" ")).toMatch(/natfest|party|back to business/i);
    expect(r.assumptions.join(" ")).not.toContain("under 18");
  });
});

describe("5 indoors only, low price", () => {
  const brief: Brief = { people: [{ label: "mig", age: 31 }], date: "2026-11-21", mood: ["active"], indoorOnly: true, budgetPerPerson: 100 };
  test("indoor courts under 100 kr. per person with the court split between two", () => {
    const r = ok(planOuting(brief, data));
    expect(r.best).not.toBeNull();
    for (const s of suggestions(r)) {
      expect(s.why.join(" ")).not.toContain("udendørs");
      for (const i of s.items.filter((x) => x.sources[0] === "wannasport")) {
        expect(i.place).not.toMatch(/udend|\bude\b/i);
        const pp = /ca\. (\d+)(?:–\d+)? kr\. pr\. person/.exec(i.price);
        expect(Number(pp?.[1])).toBeLessThanOrEqual(100);
      }
    }
    expect(r.assumptions).toContain("Banepris delt på 2 personer.");
  });
  test("without the limits more comes back, outdoors still out in the cold", () => {
    const loose = ok(planOuting({ ...brief, ...{}, indoorOnly: undefined, budgetPerPerson: undefined }, data));
    expect(loose.stats.candidates).toBeGreaterThan(ok(planOuting(brief, data)).stats.candidates);
    expect(loose.assumptions.join(" ")).toContain("koldt");
  });
});
