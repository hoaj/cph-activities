// hoaj/cph-activities#53 in plan_outing: a missing category, price, age, time or place is not a reason to drop an event.
import { describe, expect, test } from "bun:test";
import { planOuting } from "../plan";
import { brief, days, item, ok, suggestions, titles } from "./helpers";

const all = (r: ReturnType<typeof ok>) => suggestions(r).flatMap((s) => s.items);
const said = (r: ReturnType<typeof ok>) => r.assumptions.join(" | ");

describe("budget: an unknown price is kept and ranked after the confirmed ones", () => {
  const rows = () => [
    item({ title: "Koncert uden pris", categories: ["Musik"], time: "15:00" }),
    item({ title: "Koncert med pris", categories: ["Musik"], time: "19:00", priceMin: 80, priceText: "80 kr." }),
    item({ title: "Dyr koncert", categories: ["Musik"], time: "17:00", priceMin: 400, priceText: "400 kr." }),
  ];
  test("budget > 0: the priced one leads even though the unpriced is earlier and the dear one is dropped", () => {
    const r = ok(planOuting(brief({ budgetPerPerson: 100 }), days(rows())));
    expect(titles(r)).toEqual(["Koncert med pris", "Koncert uden pris"]);
    expect(r.best!.items[0]!.title).toBe("Koncert med pris");
    expect(r.stats.dropped["over budget"]).toBe(1);
    expect(said(r)).toContain("1 begivenheder har ingen pris oplyst og er med (pris ukendt, ikke 0)");
  });
  test("budget 0: free first, an unknown price kept (brugbyen as a guess), a known price dropped", () => {
    const r = ok(planOuting(brief({ budgetPerPerson: 0 }), days([
      item({ title: "Gratis foredrag", categories: ["Foredrag"], free: true, priceMin: 0 }),
      item({ title: "Foredrag for kendte", categories: ["Foredrag"], priceMin: 50 }),
      item({ title: "Foredrag lagt som koster", categories: ["Foredrag"], free: false }),
      item({ title: "Foredrag i biblioteket", source: "brugbyen", categories: ["Foredrag"] }),
      item({ title: "Foredrag fra kultunaut", categories: ["Foredrag"] }),
    ])));
    expect(titles(r)).toEqual(["Gratis foredrag", "Foredrag i biblioteket", "Foredrag fra kultunaut"]);
    expect(all(r).find((i) => i.title === "Foredrag i biblioteket")!.price).toBe("gratis? (pris ikke oplyst)");
    expect(r.stats.dropped["koster penge"]).toBe(2);
    expect(said(r)).toContain("2 begivenheder har ingen pris oplyst og er med (pris ukendt, ikke 0)");
  });
  test("no budget: nothing is unknown and no sentence", () => {
    expect(said(ok(planOuting(brief(), days(rows()))))).not.toContain("ingen pris oplyst og er med");
  });
});

describe("small children: an event with no age signal is kept after the recognised children's events", () => {
  const kid = { people: [{ age: 30 }, { age: 5 }] };
  const rows = () => [
    item({ title: "Rockkoncert", time: "11:00", categories: ["Musik"] }),
    item({ title: "Børneteater: Prinsessen", time: "13:00", categories: ["Teater"], audience: ["børn"] }),
    item({ title: "Klubaften med dj", time: "11:30", categories: ["Musik"] }),
    item({ title: "Koncert fra 12 år", time: "12:00", categories: ["Musik"], extra: { description: "Fra 12 år" } }),
    item({ title: "Børnekoncert sent", time: "19:30", categories: ["Musik"], audience: ["børn"] }),
  ];
  test("kids first, unknown after, adult, too old and late dropped", () => {
    const r = ok(planOuting(brief(kid), days(rows())));
    expect(titles(r)).toEqual(["Børneteater: Prinsessen", "Rockkoncert"]);
    expect(r.best!.items[0]!.title).toBe("Børneteater: Prinsessen");
    expect(r.stats.dropped["ikke for små børn"]).toBe(1); // from 12 years
    expect(r.stats.dropped["18+ / natteliv for voksne"]).toBe(1);
    expect(r.stats.dropped["for sent for små børn"]).toBe(1);
    expect(said(r)).toContain("1 begivenheder har ingen aldersoplysning og er med");
    const rock = all(r).find((i) => i.title === "Rockkoncert")!;
    expect(suggestions(r).find((s) => s.items[0] === rock)!.why.join(" ")).toContain("alder ikke oplyst");
    expect(suggestions(r).find((s) => s.items[0]!.title === "Børneteater: Prinsessen")!.why.join(" ")).toContain("for børn, passer til 5 år");
  });
  test("courts are still not for small children", () => {
    const court = item({ source: "wannasport", kind: "slots", title: "Padel – Bane 1", venue: "Hal", priceMin: 100, priceMax: 100, times: ["10:00"], indoor: true, extra: { sport: "padel" } });
    expect(ok(planOuting(brief({ ...kid, mood: ["active"] }), days([court]))).stats.dropped["ikke for små børn"]).toBe(1);
  });
});

describe("no start time: kept for small children and evenings, never the best bet alone", () => {
  const untimed = () => item({ title: "Jazz koncert uden tid", time: null, categories: ["Musik"], venue: "Hus U" });
  test("an evening brief keeps it as an alternative with no best bet, and says how many", () => {
    const r = ok(planOuting(brief({ from: "18:00" }), days([untimed()])));
    expect(r.best).toBeNull();
    expect(r.alternatives).toHaveLength(1);
    expect(r.stats.dropped["uden tid"]).toBeUndefined();
    expect(said(r)).toContain("1 begivenheder har ingen starttid og er med");
  });
  test("with a timed event the timed one is the best bet and the untimed follows", () => {
    const timed = item({ title: "Udstilling", time: "19:00", categories: ["Udstilling"], venue: "Hus E" });
    const r = ok(planOuting(brief({ from: "18:00", wishes: "jazz koncert udstilling" }), days([untimed(), timed])));
    expect(r.best!.items[0]!.title).toBe("Udstilling");
    expect(titles(r)).toContain("Jazz koncert uden tid");
  });
  test("small children: a children's event without a time is kept, after the timed one", () => {
    const kids = item({ title: "Børneteater uden tid", time: null, categories: ["Børn"], audience: ["børn"] });
    const timed = item({ title: "Børneteater kl 11", time: "11:00", categories: ["Børn"], audience: ["børn"] });
    const r = ok(planOuting(brief({ people: [{ age: 30 }, { age: 4 }], mood: ["culture"], wishes: "børneteater" }), days([kids, timed])));
    expect(titles(r)).toEqual(["Børneteater kl 11", "Børneteater uden tid"]);
  });
  test("a time that is known and outside the window is still dropped", () => {
    const r = ok(planOuting(brief({ from: "18:00" }), days([item({ title: "Formiddag", time: "10:00", categories: ["Musik"] })])));
    expect(r.stats.dropped["uden for tidsrum"]).toBe(1);
  });
});

describe("mood: an event with no category and nothing to read a mood from is kept after the matches", () => {
  test("no categories: kept after the matching ones; categories that match no mood: dropped", () => {
    const r = ok(planOuting(brief({ mood: ["culture"] }), days([
      item({ title: "Dagens program", source: "brugbyen", categories: [], time: "10:00" }),
      item({ title: "Teaterstykke", categories: ["Teater"], time: "19:00" }),
      item({ title: "Rengøring", categories: ["Erhverv"], time: "12:00" }),
    ])));
    expect(titles(r)).toEqual(["Teaterstykke", "Dagens program"]);
    expect(r.stats.dropped["andet humør"]).toBe(1);
    expect(said(r)).toContain("1 begivenheder har ingen kategori og er med");
  });
  test("wishes stay strict: words that are not there drop the event", () => {
    const r = ok(planOuting(brief({ mood: [], wishes: "jazz" }), days([item({ title: "Rock", categories: [] }), item({ title: "Jazz aften", categories: [] })])));
    expect(titles(r)).toEqual(["Jazz aften"]);
    expect(r.stats.dropped["andet humør"]).toBe(1);
  });
});

describe("area: an event with no venue or address is kept", () => {
  test("unknown place kept after the matching one, another known place dropped", () => {
    const r = ok(planOuting(brief({ area: "Vesterbro" }), days([
      item({ title: "Uden sted", categories: ["Musik"], venue: null, address: null, time: "14:00" }),
      item({ title: "På Vesterbro", categories: ["Musik"], venue: "Hus Vesterbro", time: "19:00" }),
      item({ title: "På Amager", categories: ["Musik"], venue: "Hus Amager", time: "16:00" }),
    ])));
    expect(titles(r)).toEqual(["På Vesterbro", "Uden sted"]);
    expect(r.stats.dropped["andet område"]).toBe(1);
    expect(said(r)).toContain("1 begivenheder har intet sted oplyst og er med");
  });
});

describe("the deliberate rules on positive evidence stay", () => {
  test("under 18: clubs, bars and 18+ are out; a club's door age; sold out; the time-less never alone", () => {
    const two = { people: [{ age: 30 }, { age: 16 }] };
    expect(ok(planOuting(brief(two), days([item({ title: "Fest 18+", time: "21:00", categories: ["Musik"] })]))).best).toBeNull();
    expect(ok(planOuting(brief(two), days([item({ source: "culturebox", title: "Club", time: "21:00", ageFrom: 18, categories: ["Musik"] })]))).stats.dropped["under klubbens aldersgrænse"]).toBe(1);
    expect(ok(planOuting(brief(), days([item({ source: "billetto", title: "Udsolgt", categories: ["Musik"], extra: { onSale: false } })]))).stats.dropped["ikke til salg"]).toBe(1);
    const r = ok(planOuting(brief(), days([item({ title: "Uden tid", time: null, categories: ["Musik"] })])));
    expect(r.best).toBeNull();
  });
});
