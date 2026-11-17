import { describe, expect, test } from "bun:test";
import { groupSlots, normaliseTitle } from "../src/lib/slots";

const hit = (title: string, venue: string | null, startsAt: string | null, endsAt: string | null, extra: Record<string, unknown> = {}): any => ({ title, venue, startsAt, endsAt, ...extra });

describe("normaliseTitle", () => {
  test("lower case, no punctuation, single spaces", () => {
    expect(normaliseTitle("  Kom og prøv  spillet: Patata - Game On 2026! ")).toBe("kom og prøv spillet patata game on 2026");
  });
});

describe("groupSlots", () => {
  test("slots of one event on one day become one row with sorted times", () => {
    const out = groupSlots([
      hit("Patata - Game On", "Hall", "2026-11-21T11:30", "2026-11-21T12:00", { id: "b" }),
      hit("Patata - Game On", "Hall", "2026-11-21T11:00", "2026-11-21T11:30", { id: "a" }),
      hit("patata game on", "Hall", "2026-11-21T12:00", "2026-11-21T12:30", { id: "c" }),
    ]);
    expect(out).toEqual([{ title: "Patata - Game On", venue: "Hall", startsAt: "2026-11-21T11:00", endsAt: "2026-11-21T12:30", id: "b", times: ["11:00", "11:30", "12:00"], slots: 3 }]);
  });
  test("a single hit gets one time and one slot", () => {
    expect(groupSlots([hit("A", null, "2026-11-21T19:00", "2026-11-21T21:00")])).toEqual([hit("A", null, "2026-11-21T19:00", "2026-11-21T21:00", { times: ["19:00"], slots: 1 })]);
  });
  test("same title at another venue stays apart; two null venues group", () => {
    expect(groupSlots([hit("A", "X", "2026-11-21T10:00", null), hit("A", "Y", "2026-11-21T10:00", null)])).toHaveLength(2);
    expect(groupSlots([hit("A", null, "2026-11-21T10:00", null), hit("A", null, "2026-11-21T11:00", null)])).toHaveLength(1);
    expect(groupSlots([hit("A", null, "2026-11-21T10:00", null), hit("A", "X", "2026-11-21T11:00", null)])).toHaveLength(2);
  });
  test("same title on another day stays apart", () => {
    const out = groupSlots([hit("A", "X", "2026-11-21T10:00", null), hit("A", "X", "2026-11-22T10:00", null)]);
    expect(out.map((e) => e.slots)).toEqual([1, 1]);
  });
  test("an event with no start time has no times", () => {
    expect(groupSlots([hit("A", "X", null, null)])).toEqual([hit("A", "X", null, null, { times: [], slots: 1 })]);
  });
});
