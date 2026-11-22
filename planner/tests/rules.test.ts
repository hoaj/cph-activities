import { describe, expect, test } from "bun:test";
import { applyPatch, planOuting } from "../index";
import { findThreads } from "../threads";
import { mergeItems } from "../merge";
import { DATE, brief, days, forecast, item, ok, suggestions, titles } from "./helpers";

describe("under 18 and nightlife", () => {
  const rows = () => [
    item({ title: "Club Night: House", time: "23:00", categories: ["Elektronisk"], venue: "Klub A" }),
    item({ title: "Fredagsbar med DJ", time: "21:00", venue: "Bar B" }),
    item({ title: "Jazzkoncert i kælderen", time: "20:00", categories: ["Musik"], venue: "Kælder" }),
    item({ title: "Stand-up aften", time: "21:00", categories: ["Teater"], venue: "Comedy C" }),
    item({ title: "Eftermiddagskoncert", time: "15:30", categories: ["Musik"], venue: "Hal D" }),
  ];
  const night = (ages: number[]) => brief({ people: ages.map((age) => ({ age })), mood: ["nightlife"], from: "19:00", to: "23:59" });

  test("clubs and bars are left out, late concerts and shows stay, and the answer says why", () => {
    const r = ok(planOuting(night([30, 16]), days(rows())));
    const t = titles(r).join(" | ");
    expect(t).toContain("Jazzkoncert");
    expect(t).toContain("Stand-up");
    expect(t).not.toMatch(/Club Night|Fredagsbar/);
    expect(r.assumptions.join(" ")).toMatch(/under 18: klubber, barer/);
  });
  test("before 19:00 a concert is not nightlife", () => {
    const r = ok(planOuting({ ...night([30, 16]), from: "10:00" }, days(rows())));
    expect(titles(r).join(" ")).not.toContain("Eftermiddagskoncert");
  });
  test("two adults get the clubs and no explanation", () => {
    const r = ok(planOuting(night([30, 30]), days(rows())));
    expect(titles(r).join(" | ")).toMatch(/Club Night|Fredagsbar/);
    expect(r.assumptions.join(" ")).not.toContain("under 18");
  });
  test("18+ in the description is enough to leave an event out", () => {
    const r = ok(planOuting(night([30, 17]), days([item({ title: "Natten", time: "22:00", categories: ["Musik"], extra: { description: "Kun for 18+" } })])));
    expect(r.best).toBeNull();
  });
});

describe("events without a start time", () => {
  const untimed = () => item({ title: "Jazz koncert uden tid", time: null, categories: ["Musik"], venue: "Hus U" });
  const timedRows = () => [
    item({ title: "Teaterstykke", time: "14:00", categories: ["Teater"], venue: "Hus T" }),
    item({ title: "Udstilling om kunst", time: "16:30", categories: ["Udstilling"], venue: "Hus E" }),
  ];

  test("never the best bet alone, even when it scores highest", () => {
    const r = ok(planOuting(brief({ wishes: "jazz koncert" }), days([untimed(), ...timedRows()])));
    expect(r.best).not.toBeNull();
    expect(r.best!.items.some((i) => i.time !== "tid: se siden")).toBe(true);
    const shown = suggestions(r).find((s) => s.items[0]!.title === "Jazz koncert uden tid");
    expect(shown?.items[0]!.time).toBe("tid: se siden");
  });
  test("never gets a fixed slot in the plan", () => {
    const r = ok(planOuting(brief({ wishes: "jazz koncert" }), days([untimed(), ...timedRows()])));
    expect(r.plan?.join("\n")).not.toContain("Jazz koncert uden tid");
    expect(r.assumptions.join(" ")).toContain("tid: se siden");
  });
  test("when only untimed ones fit there is no best bet, and they come as alternatives", () => {
    const r = ok(planOuting(brief(), days([untimed()])));
    expect(r.best).toBeNull();
    expect(r.alternatives).toHaveLength(1);
    expect(r.assumptions.join(" ")).toContain("ingen tid");
  });
  test("kept for small children and for an evening brief, as alternatives (see unknown-fields.test.ts)", () => {
    const kids = item({ title: "Børneteater", time: null, categories: ["Børn"] });
    expect(ok(planOuting(brief({ people: [{ age: 30 }, { age: 4 }], wishes: "børneteater" }), days([kids]))).alternatives).toHaveLength(1);
    expect(ok(planOuting(brief({ from: "18:00" }), days([untimed()]))).alternatives).toHaveLength(1);
  });
  test("may be part of a thread", () => {
    const rows = [
      item({ title: "Retro Games: turnering", source: "brugbyen", time: null, venue: "Bibliotek" }),
      item({ title: "Retro Games: kom og spil", source: "billetto", time: "15:00", venue: "Kulturhus" }),
    ];
    const r = ok(planOuting(brief({ mood: ["gaming"], wishes: "retro games" }), days(rows)));
    expect(r.best?.kind).toBe("tråd");
    expect(r.best!.items.map((i) => i.time)).toContain("tid: se siden");
    expect(r.plan?.join("\n") ?? "").not.toContain("turnering");
  });
});

describe("merging", () => {
  test("same date, times within 30 minutes and the same normalised title: one event, every source's id and link", () => {
    const rows = [
      item({ id: "b:1", source: "billetto", title: "Vin & Videnskab: Mikroorganismer", time: "19:00", url: "https://b" }),
      item({ id: "k:1", source: "kulturkbh", title: "Vin & Videnskab: Mikroorganismer – nyt fra forskningsfronten", time: "19:20", url: "https://k" }),
    ];
    const [m, ...rest] = mergeItems(rows);
    expect(rest).toHaveLength(0);
    expect(m!.sources).toEqual(["billetto", "kulturkbh"]);
    expect(m!.ids).toEqual(["b:1", "k:1"]);
    expect(m!.urls).toEqual(["https://b", "https://k"]);
    expect(m!.title).toBe("Vin & Videnskab: Mikroorganismer"); // Billetto leads
    expect(m!.notes.join()).toContain("tider afviger");
  });
  test("more than 30 minutes apart, another date or the same source: not merged", () => {
    expect(mergeItems([item({ title: "Samme titel", time: "10:00" }), item({ title: "Samme titel", time: "12:00", source: "billetto" })])).toHaveLength(2);
    expect(mergeItems([item({ title: "Samme titel" }), item({ title: "Samme titel", source: "billetto", date: "2026-11-22" })])).toHaveLength(2);
    expect(mergeItems([item({ title: "Samme titel" }), item({ title: "Samme titel" })])).toHaveLength(2);
  });
  test("no time on one side still merges", () => {
    expect(mergeItems([item({ title: "Koncert i kirken", time: null }), item({ title: "Koncert i kirken", source: "billetto", time: "19:00" })])[0]!.time).toBe("19:00");
  });
  test("different titles, same exact time, same place and agreeing price: probably the same, with a note", () => {
    const rows = [
      item({ source: "kulturkbh", title: "Juletræstænding", time: "16:00", venue: "Koncertkirken, Blågårds Plads", priceMin: 0 }),
      item({ source: "billetto", title: "Syng julen ind", time: "16:00", venue: "Koncertkirken", priceMin: 0 }),
    ];
    const out = mergeItems(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.notes[0]).toContain("samme tid og sted");
  });
  test("same time and place but prices that disagree stay apart", () => {
    const rows = [
      item({ source: "kulturkbh", title: "Aften A", time: "16:00", venue: "Salig", priceMin: 0 }),
      item({ source: "billetto", title: "Noget helt andet", time: "16:00", venue: "SALIG", priceMin: 150 }),
    ];
    expect(mergeItems(rows)).toHaveLength(2);
  });
  test("field by field: the number over none, free from either, age limit, the longer description", () => {
    const [m] = mergeItems([
      item({ source: "kultunaut", title: "Teater for alle", extra: { description: "kort" } }),
      item({ source: "teaterbilletter", title: "Teater for alle", priceMin: 100, priceMax: 300, priceText: "100–300 kr.", ageFrom: 8, extra: { description: "en lang beskrivelse" } }),
      item({ source: "kulturkbh", title: "Teater for alle", free: true }),
    ]);
    expect(m!.priceText).toBe("100–300 kr.");
    expect(m!.free).toBe(true);
    expect(m!.priceMin).toBe(0);
    expect(m!.ageFrom).toBe(8);
    expect(m!.extra.description).toBe("en lang beskrivelse");
  });
  test("court slots are never merged", () => {
    const slot = () => item({ source: "wannasport", kind: "slots", title: "Padel – Bane 1", times: ["10:00"], venue: "V" });
    expect(mergeItems([slot(), slot()])).toHaveLength(2);
  });
  test("planOuting counts the rows merged away", () => {
    const r = ok(planOuting(brief(), days([
      item({ source: "billetto", title: "Koncert med Duo", time: "19:00", categories: ["Musik"] }),
      item({ source: "kultunaut", title: "Koncert med Duo", time: "19:00", categories: ["Musik"] }),
    ])));
    expect(r.stats.mergedAway).toBe(1);
    expect(r.best!.items[0]!.sources).toEqual(["billetto", "kultunaut"]);
    expect(r.best!.why).toContain("2 kilder er enige");
  });
});

describe("threads", () => {
  const t = (title: string, source: "billetto" | "kultunaut" | "brugbyen" = "billetto") => ({ kind: "event", title, titles: [title], sources: [source] });
  test("a two-word key needs two items across two sources", () => {
    expect(findThreads([t("Retro Games dag", "billetto"), t("Retro Games turnering", "kultunaut")])).toHaveLength(1);
    expect(findThreads([t("Retro Games dag", "billetto"), t("Retro Games turnering", "billetto")])).toHaveLength(0);
    expect(findThreads([t("Retro Games dag", "billetto"), t("Noget andet helt", "kultunaut")])).toHaveLength(0);
  });
  test("a single long word needs three items", () => {
    const two = [t("Dungeoncrawl åbning", "billetto"), t("Finale i Dungeoncrawl", "kultunaut")];
    expect(findThreads(two).filter((x) => x.key === "dungeoncrawl")).toHaveLength(0);
    const three = [...two, t("Dungeoncrawl for børn", "brugbyen")];
    expect(findThreads(three).some((x) => x.key === "dungeoncrawl")).toBe(true);
  });
  test("generic words alone make no thread", () => {
    expect(findThreads([t("Jul koncert", "billetto"), t("Jul koncert", "kultunaut")])).toHaveLength(0);
  });
  test("an item belongs to one thread", () => {
    const threads = findThreads([t("Retro Games dag", "billetto"), t("Retro Games turnering", "kultunaut"), t("Retro Games finale", "brugbyen")]);
    const all = threads.flatMap((x) => x.members);
    expect(new Set(all).size).toBe(all.length);
  });
  test("a thread is one suggestion of two to four items, ordered by time", () => {
    const rows = ["09:00", "11:00", "13:00", "15:00", "17:00"].map((time, i) =>
      item({ title: `Retro Games ${["a", "b", "c", "d", "e"][i]}${i} spil`, source: i % 2 ? "kultunaut" : "billetto", time, venue: `Sted ${i}`, categories: ["Spil"] }));
    const r = ok(planOuting(brief({ mood: ["gaming"], wishes: "retro games" }), days(rows)));
    expect(r.best?.kind).toBe("tråd");
    const times = r.best!.items.map((i) => i.time);
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times.length).toBeLessThanOrEqual(4);
    expect([...times].sort()).toEqual(times);
    expect(r.best!.title).toContain("Retro games");
  });
});

describe("budget", () => {
  const court = (priceMin: number) => item({ source: "wannasport", kind: "slots", title: "Padel – Bane 1", venue: "Hal", priceMin, priceMax: priceMin, priceText: `${priceMin} kr. pr. bane`, times: ["10:00", "11:00"], indoor: true, extra: { sport: "padel" } });
  const active = (over = {}) => brief({ mood: ["active"], ...over });

  test("a court is split between the players, at least two: 1 person pays half", () => {
    expect(ok(planOuting(active({ people: [{ age: 30 }], budgetPerPerson: 100 }), days([court(200)]))).best).not.toBeNull();
    expect(ok(planOuting(active({ people: [{ age: 30 }], budgetPerPerson: 99 }), days([court(200)]))).best).toBeNull();
  });
  test("four players split four ways", () => {
    const four = [{ age: 30 }, { age: 30 }, { age: 30 }, { age: 30 }];
    const r = ok(planOuting(active({ people: four, budgetPerPerson: 50 }), days([court(200)])));
    expect(r.best!.items[0]!.price).toContain("ca. 50 kr. pr. person ved 4");
    expect(ok(planOuting(active({ people: four, budgetPerPerson: 49 }), days([court(200)]))).best).toBeNull();
  });
  test("other prices are per person, and over budget is dropped", () => {
    const rows = [item({ title: "Billig koncert", categories: ["Musik"], priceMin: 80, priceText: "80 kr." }), item({ title: "Dyr koncert", categories: ["Musik"], priceMin: 400, priceText: "400 kr." })];
    const r = ok(planOuting(brief({ budgetPerPerson: 100 }), days(rows)));
    expect(titles(r)).toEqual(["Billig koncert"]);
    expect(r.stats.dropped["over budget"]).toBe(1);
  });
  test("no price keeps the item and says so", () => {
    const r = ok(planOuting(brief({ budgetPerPerson: 100 }), days([item({ title: "Koncert uden pris", categories: ["Musik"] })])));
    expect(r.best!.items[0]!.price).toBe("pris ikke oplyst");
  });
  test("budget 0: free first, then unpriced rows (brugbyen marked as a guess); a known price is dropped", () => {
    const rows = [
      item({ title: "Gratis foredrag", categories: ["Foredrag"], free: true, priceMin: 0 }),
      item({ title: "Foredrag for kendte", categories: ["Foredrag"], priceMin: 50 }),
      item({ title: "Foredrag i biblioteket", source: "brugbyen", categories: ["Foredrag"] }),
      item({ title: "Foredrag fra kultunaut", categories: ["Foredrag"] }),
    ];
    const r = ok(planOuting(brief({ budgetPerPerson: 0 }), days(rows)));
    expect(titles(r)).toEqual(["Gratis foredrag", "Foredrag i biblioteket", "Foredrag fra kultunaut"]);
    expect(suggestions(r).find((s) => s.items[0]!.title === "Foredrag i biblioteket")!.items[0]!.price).toBe("gratis? (pris ikke oplyst)");
    expect(r.stats.dropped["koster penge"]).toBe(1);
  });
});

describe("weather", () => {
  const rows = () => [
    item({ title: "Julemarked på pladsen", time: "12:00", categories: ["Marked"], indoor: false, venue: "Plads" }),
    item({ title: "Teaterstykke", time: "14:00", categories: ["Teater"], indoor: true, venue: "Teatret" }),
    item({ title: "Byvandring i Indre By", time: "13:00", categories: ["Kultur"], venue: "Rådhuspladsen" }),
  ];
  const b = () => brief({ mood: ["culture", "social"] });

  test("the weather line: day, temperatures, verdict, only when it matters", () => {
    expect(ok(planOuting(b(), days(rows(), forecast("dry")))).weather).toBeNull();
    expect(ok(planOuting(b(), days(rows(), forecast("showers")))).weather).toBe("Lørdag: 8–12 grader, byger");
    expect(ok(planOuting(b(), days(rows(), forecast("dry", { snow: true })))).weather).toBe("Lørdag: 8–12 grader, tørt, sne");
    expect(ok(planOuting(b(), days(rows(), forecast("wet", { rainMm: 8.4 })))).weather).toBe("Lørdag: 8–12 grader, regn (8 mm)");
    expect(ok(planOuting(b(), days(rows(), forecast("dry", { cold: true, windy: true, maxGust: 14 })))).weather).toBe("Lørdag: 8–12 grader, tørt, koldt, blæsende (stød 14 m/s)");
  });
  test("an evening brief reads the evening window", () => {
    const d = days(rows(), forecast("dry"));
    d.weather[DATE]!.evening = forecast("wet");
    expect(ok(planOuting({ ...b(), from: "18:00" }, d)).weather).toMatch(/^Lørdag aften: .*regn/);
  });
  test("wet: outdoor events are dropped and the answer says so", () => {
    const r = ok(planOuting(b(), days(rows(), forecast("wet"))));
    expect(titles(r)).toEqual(["Teaterstykke"]);
    expect(r.assumptions).toContain("Regn: udendørs er sorteret fra.");
    expect(r.stats.dropped["udendørs i regn"]).toBe(2);
  });
  test("cold, wind and snow move outdoors indoors even on a dry day", () => {
    for (const extra of [{ cold: true }, { windy: true }, { snow: true }]) {
      const r = ok(planOuting(b(), days(rows(), forecast("dry", extra))));
      expect(titles(r)).toEqual(["Teaterstykke"]);
      expect(r.stats.dropped["udendørs i kulde/blæst"]).toBe(2);
    }
  });
  test("showers: outdoors is kept but ranked below indoors", () => {
    const r = ok(planOuting(b(), days(rows(), forecast("showers"))));
    expect(r.best!.items[0]!.title).toBe("Teaterstykke");
    expect(titles(r)).toContain("Julemarked på pladsen");
    expect(r.assumptions).toContain("Byger: udendørs er trukket ned.");
  });
  test("dry and mild: outdoors is fine, unless the brief says indoors only", () => {
    expect(titles(ok(planOuting(b(), days(rows(), forecast("dry")))))).toContain("Julemarked på pladsen");
    expect(titles(ok(planOuting({ ...b(), indoorOnly: true }, days(rows(), forecast("dry")))))).not.toContain("Julemarked på pladsen");
  });
  test("no forecast for the date: no weather line, an assumption says so, plans as if dry", () => {
    const r = ok(planOuting(b(), days(rows(), null)));
    expect(r.weather).toBeNull();
    expect(r.assumptions.join(" ")).toContain("Ingen vejrudsigt");
    expect(titles(r)).toContain("Julemarked på pladsen");
  });
  test("outdoor courts follow the same rules by their name", () => {
    const court = (name: string, indoor: boolean | null) => item({ source: "wannasport", kind: "slots", title: `Padel – ${name}`, venue: name, indoor, times: ["10:00"], priceMin: 100, extra: { sport: "padel" } });
    const r = ok(planOuting(brief({ mood: ["active"] }), days([court("Ude", false), court("Inde", true)], forecast("wet"))));
    expect(titles(r)).toEqual(["Padel – Inde"]);
  });
});

describe("refinements", () => {
  test("applyPatch sets a key and deletes with null, without touching the input", () => {
    const b = brief({ budgetPerPerson: 100, from: "18:00" });
    const out = applyPatch(b, { budgetPerPerson: 0, from: null });
    expect(out.budgetPerPerson).toBe(0);
    expect("from" in out).toBe(false);
    expect(b.from).toBe("18:00");
  });
  test("next is { label, patch }[] with Danish labels, and the evening step patches from", () => {
    const rows = Array.from({ length: 14 }, (_, i) => item({ title: `Koncert ${i}`, time: "19:00", categories: ["Musik"], venue: `Sted ${i}` }));
    const r = ok(planOuting(brief({ from: "10:00" }), days(rows)));
    for (const n of r.next) {
      expect(typeof n.label).toBe("string");
      expect(typeof n.patch).toBe("object");
    }
    const evening = r.next.find((n) => n.label.startsWith("Kun efter kl. 17"));
    expect(evening?.patch).toEqual({ from: "17:00" });
  });
  test("nothing fitting offers relaxing steps as patches", () => {
    const r = ok(planOuting(brief({ budgetPerPerson: 1, from: "09:00" }), days([item({ title: "Dyr koncert", categories: ["Musik"], priceMin: 500 })])));
    expect(r.best).toBeNull();
    expect(r.next.map((n) => n.patch)).toContainEqual({ budgetPerPerson: null, indoorOnly: null });
  });
});

describe("age limits", () => {
  const adultRows = ["Fest 18+", "Kun for 18+ ", "Fra 18 år", "Aldersgrænse: 18"].map((title) => item({ title, time: "21:00", categories: ["Musik"] }));
  test("an 18+ marking in a title leaves the event out for a minor", () => {
    expect(ok(planOuting(brief({ people: [{ age: 30 }, { age: 16 }] }), days(adultRows))).best).toBeNull();
  });
  test("an age range reaching 18 does not", () => {
    const r = ok(planOuting(brief({ people: [{ age: 30 }, { age: 16 }] }), days([item({ title: "Workshop for unge 13-18 år", time: "16:00", categories: ["Musik"] })])));
    expect(r.best).not.toBeNull();
  });
  test("a teenager gets no children's events", () => {
    const r = ok(planOuting(brief({ people: [{ age: 30 }, { age: 15 }] }), days([item({ title: "Børneteater: Prinsessen", time: "11:00", categories: ["Teater"] }), item({ title: "Rockkoncert", time: "20:00", categories: ["Musik"] })])));
    expect(titles(r)).toEqual(["Rockkoncert"]);
  });
  test("small children get what is made for them first, what says nothing about age after, and nothing late", () => {
    const rows = [item({ title: "Børneteater: Prinsessen", time: "11:00", categories: ["Teater"], audience: ["børn"] }), item({ title: "Rockkoncert", time: "11:00", categories: ["Musik"] }), item({ title: "Børnekoncert sent", time: "19:30", categories: ["Musik"], audience: ["børn"] })];
    const r = ok(planOuting(brief({ people: [{ age: 30 }, { age: 5 }] }), days(rows)));
    expect(titles(r)).toEqual(["Børneteater: Prinsessen", "Rockkoncert"]);
  });
});
