import { describe, expect, test } from "bun:test";
import { needsInput, planOuting } from "../index";
import { brief, days, item } from "./helpers";

describe("needs_input", () => {
  test("no people: asks who and how old", () => {
    const r = needsInput({ people: [], mood: ["culture"] });
    expect(r?.missing).toEqual(["people"]);
    expect(r?.ask).toContain("Hvem skal med");
  });
  test("a person without an age: names them, asks once", () => {
    const r = needsInput(brief({ people: [{ age: 30 }, { label: "lillebror" }] }));
    expect(r?.missing).toEqual(["people[1].age"]);
    expect(r?.ask).toBe("Hvor gammel er lillebror?");
    expect(r?.options.age).toContain("13-17");
    expect(r?.options.mood).toBeUndefined();
  });
  test("several without an age: one question naming all", () => {
    const r = needsInput(brief({ people: [{ label: "a" }, { label: "b" }, { label: "c" }] }));
    expect(r?.ask).toBe("Hvor gammel er a, b og c?");
  });
  test("no mood and no wishes: asks what, with mood options", () => {
    const r = needsInput({ people: [{ age: 30 }] });
    expect(r?.missing).toEqual(["mood"]);
    expect(r?.options.mood).toEqual(["active", "culture", "social", "gaming"]);
  });
  test("budget, times and indoor-only alone do not count as a what", () => {
    for (const extra of [{ budgetPerPerson: 100 }, { from: "10:00", to: "16:00" }, { indoorOnly: true }, { budgetPerPerson: 0 }]) {
      expect(needsInput({ people: [{ age: 30 }], ...extra })?.missing).toEqual(["mood"]);
    }
  });
  test("wishes alone are a what; an empty mood list and blank wishes are not", () => {
    expect(needsInput({ people: [{ age: 30 }], wishes: "jazz" })).toBeNull();
    expect(needsInput({ people: [{ age: 30 }], mood: [], wishes: "  " })?.missing).toEqual(["mood"]);
  });
  test("age and what both missing: two questions, never more", () => {
    const r = needsInput({ people: [{ label: "x" }] })!;
    expect(r.missing).toEqual(["people[0].age", "mood"]);
    expect(r.ask.match(/\?/g)).toHaveLength(2);
  });
  test("an age of 0 is an age", () => {
    expect(needsInput({ people: [{ age: 0 }], mood: ["calm"] })).toBeNull();
  });
  test("planOuting returns it before it reads any data", () => {
    const r = planOuting({ people: [{ age: 30 }] }, days([item()]));
    expect(r.status).toBe("needs_input");
  });
});
