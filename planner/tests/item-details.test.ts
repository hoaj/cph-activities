import { describe, expect, test } from "bun:test";
import { planOuting } from "../index";
import { brief, days, item, ok, suggestions } from "./helpers";

describe("suggestion items carry what decides whether they fit", () => {
  test("description, categories and ageFrom come from the merged item; null and [] when the sources have none", () => {
    const r = ok(planOuting(brief(), days([
      item({ title: "Jazzkoncert", time: "20:00", categories: ["Musik", "Jazz"], ageFrom: 16, extra: { description: "Kvartet spiller standards." }, venue: "Huset" }),
      item({ title: "Foredrag om byen", time: "11:00", categories: ["Foredrag"], venue: "Biblioteket" }),
    ])));
    const items = suggestions(r).flatMap((s) => s.items);
    const jazz = items.find((i) => i.title === "Jazzkoncert")!;
    expect(jazz).toMatchObject({ description: "Kvartet spiller standards.", categories: ["Musik", "Jazz"], ageFrom: 16 });
    const talk = items.find((i) => i.title === "Foredrag om byen")!;
    expect(talk).toMatchObject({ description: null, categories: ["Foredrag"], ageFrom: null });
  });
});
