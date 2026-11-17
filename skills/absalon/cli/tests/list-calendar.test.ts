import { describe, expect, test } from "bun:test";
import listCalendar from "../src/operations/listCalendar";

const page = (script: string) => ({ scripts: ["var x = 1;", script] });
const item = { title: "Yoga &amp; ro", start: "2026-11-21T18:00:00", end: "2026-11-21T19:00:00", details: "Gratis", permalink: "https://absaloncph.dk/begivenhed/yoga/", postId: 7, classNames: ["event-category-yoga"] };

describe("GET /kalender/ response", () => {
  test("reads the recurringEvents array out of the piecal script", () => {
    const r = listCalendar.response.safeParse(page(`let piecalAJAX = {a:1};\nrecurringEvents = ${JSON.stringify([item])};`));
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as any).events[0].title).toBe("Yoga &amp; ro");
  });
  test("a page without the array is a Zod failure, not an empty list", () => {
    const r = listCalendar.response.safeParse(page(`let piecalAJAX = {a:1};`));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["recurringEvents"]);
    expect(listCalendar.response.safeParse({ scripts: [] }).success).toBe(false);
  });
  test("an item without a title is a failure", () => {
    const r = listCalendar.response.safeParse(page(`let piecalAJAX = {}; recurringEvents = ${JSON.stringify([{ ...item, title: "" }])};`));
    expect(r.success).toBe(false);
  });
  test("an empty array is an empty list", () => {
    const r = listCalendar.response.safeParse(page(`let piecalAJAX = {}; recurringEvents = [];`));
    expect(r.success).toBe(true);
  });
});
