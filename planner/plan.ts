import type { Brief, Mood, NeedsInput, PlanResult, PlannerDays, Shortlist, Suggestion, SuggestionItem } from "./types";
import { MOOD_DA, cap, dayName, norm, tmin, uniq } from "./text";
import { annotate, belowDoorAge } from "./features";
import { mergeItems } from "./merge";
import { STOP, findThreads } from "./threads";
import { readWeather } from "./weather";
import { buildNext, countMore, relaxNext } from "./followups";
import type { Candidate } from "./followups";
import { buildItinerary } from "./itinerary";
import type { PlanSuggestion } from "./itinerary";

const AGE_OPTIONS = ["under 6", "6-12", "13-17", "18+"];
const ADULT_DROP = "18+ / natteliv for voksne";
/** What a filter could not check because the field is missing: the event is kept, ranked after the sure matches, and counted here. */
const UNKNOWN_SENTENCE: Record<string, (n: number) => string> = {
  price: (n) => `${n} begivenheder har ingen pris oplyst og er med (pris ukendt, ikke 0).`,
  age: (n) => `${n} begivenheder har ingen aldersoplysning og er med: tjek beskrivelsen.`,
  time: (n) => `${n} begivenheder har ingen starttid og er med (aldrig eneste bud, ikke i planen).`,
  category: (n) => `${n} begivenheder har ingen kategori og er med: vurdér dem ud fra beskrivelsen.`,
  place: (n) => `${n} begivenheder har intet sted oplyst og er med.`,
  indoor: (n) => `${n} ting har ingen oplysning om inde/ude og er med (kun indendørs: tjek at de er indendørs).`,
};

const WISH_MOOD: [RegExp, Mood][] = [
  [/aktiv|padel|sport|løb|motion|bevæg|tennis|badminton|squash/i, "active"],
  [/kultur|teater|koncert|udstilling|film|biograf|musik|foredrag|jazz|comedy|stand.?up/i, "culture"],
  [/social|fællesspis|quiz|bingo|workshop/i, "social"],
  [/gaming|spil|game|nørd|rollespil/i, "gaming"],
  [/mad|spise|brunch|middag|frokost/i, "food"],
  [/rolig|stille|hygge|afslap/i, "calm"],
  [/natteliv|klub|fest|byen/i, "nightlife"],
];
const wishWords = (w: string): string[] => uniq(norm(w).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)));

/** The questions to ask before planning, or null when the brief is complete: every age, and a "what". */
export function needsInput(brief: Brief): NeedsInput | null {
  const people = brief.people ?? [];
  const noAge = people.map((p, i) => ({ p, i })).filter(({ p }) => !(typeof p.age === "number" && p.age >= 0));
  const noWhat = !brief.mood?.length && !(brief.wishes ?? "").trim();
  if (people.length && !noAge.length && !noWhat) return null;

  const missing: string[] = [];
  const questions: string[] = [];
  const options: NeedsInput["options"] = {};
  if (!people.length) {
    missing.push("people");
    questions.push("Hvem skal med, og hvor gamle er de?");
    options.age = AGE_OPTIONS;
  } else if (noAge.length) {
    noAge.forEach(({ i }) => missing.push(`people[${i}].age`));
    const names = noAge.map(({ p, i }) => p.label || `person ${i + 1}`);
    const who = names.length > 1 ? names.slice(0, -1).join(", ") + " og " + names[names.length - 1] : names[0];
    questions.push(`Hvor gammel er ${who}?`);
    options.age = AGE_OPTIONS;
  }
  if (noWhat) {
    missing.push("mood");
    options.mood = ["active", "culture", "social", "gaming"];
    questions.push("Og er I mest til noget aktivt (padel, bowling), kultur (teater, koncert) eller noget socialt (spil, fællesspisning)?");
  }
  return { status: "needs_input", missing, ask: questions.slice(0, 2).join(" "), options };
}

/**
 * planOuting(brief, days) -> NeedsInput | Shortlist (contract: hoaj/cph-activities#24). Pure: the same
 * brief and days always give the same answer.
 */
export function planOuting(brief: Brief, days: PlannerDays): PlanResult {
  const ask = needsInput(brief);
  if (ask) return ask;

  const people = brief.people.map((p) => ({ label: p.label, age: p.age as number }));
  const assumptions: string[] = [];
  const dates = days.days ?? [];
  let date = brief.date;
  if (!date) {
    date = dates[0];
    if (!date) throw new Error("planOuting: no date in the brief and none in days");
    assumptions.push(`Ingen dag valgt: bruger ${dayName(date)} ${date.slice(8)}/${date.slice(5, 7)}.`);
  } else if (!dates.includes(date)) {
    assumptions.push(`Der er ingen data for ${date}; bruger ${dates[0]}.`);
    date = dates[0] ?? date;
  }

  const youngest = Math.min(...people.map((p) => p.age));
  const minors = youngest < 18;
  const small = youngest < 10;
  const moodIn = brief.mood ?? [];
  const night = moodIn.includes("nightlife");
  const wishes = (brief.wishes ?? "").trim();

  let from = brief.from;
  let to = brief.to;
  if (!from) {
    from = night ? "20:00" : "10:00";
    assumptions.push(`Tidsrum ikke oplyst: ${from} og frem${!to ? " til " + (night ? "sen aften" : "23:00") : ""}.`);
  }
  if (!to) to = night ? "02:00" : "23:00";
  const fromM = tmin(from) ?? 10 * 60;
  let toM = tmin(to) ?? 23 * 60;
  if (toM <= fromM) toM += 24 * 60;
  if (toM > 24 * 60) assumptions.push("Data dækker kun begivenheder på selve dagen: ting efter midnat er ikke med.");
  const evening = fromM >= 17 * 60;

  const wx = readWeather(days, date, evening);
  const wet = wx.verdict.outdoor === "wet";
  const showers = wx.verdict.outdoor === "showers";
  const coldish = !!(wx.verdict.cold || wx.verdict.windy || wx.verdict.snow);
  // The weather is always read; it is mentioned only when it decided something or is worth knowing.
  const weather = wx.known && (wet || showers || coldish) ? wx.line : null;
  if (!wx.known) assumptions.push(wx.line);

  const moods = uniq([...moodIn, ...(wishes ? WISH_MOOD.filter(([r]) => r.test(wishes)).map(([, m]) => m) : [])]);
  const wWords = wishWords(wishes);
  const budget = brief.budgetPerPerson;
  const players = Math.max(people.length, 2);
  const excluded = new Set(brief.excludeIds ?? []);
  const dropped: Record<string, number> = {};
  const drop = (why: string) => void (dropped[why] = (dropped[why] ?? 0) + 1);

  const dayRows = days.items.filter((i) => i.date === date);
  const merged = mergeItems(dayRows);
  const mergedAway = dayRows.length - merged.length;

  // 1. filter
  const kept: Candidate[] = [];
  for (const it of merged) {
    const f = annotate(it);
    const t = tmin(it.time);
    const unk = new Set<string>(); // fields a filter could not check: kept, ranked after the sure matches
    if (it.ids.some((id) => excluded.has(id))) { drop("allerede vist"); continue; }
    if (it.kind === "slots") {
      const times = (it.times ?? []).filter((x) => tmin(x)! >= fromM && tmin(x)! + 60 <= toM);
      if (!times.length) { drop("uden for tidsrum"); continue; }
      it.timesIn = times;
      if (it.indoor == null && ["badminton", "squash", "tabletennis"].includes(it.extra.sport ?? "")) it.indoor = true;
      f.outdoorish = it.indoor === false;
    } else if (t == null) {
      // no start time: kept as an alternative or in a thread, ranked after the timed ones, never the best bet alone
      unk.add("time");
    } else if (t < fromM || t >= toM) {
      // a market is open for hours: it fits when those hours overlap the window
      const closes = it.source === "visitorservice" ? tmin(it.endTime) : null;
      if (closes == null || t >= toM || closes <= fromM) { drop("uden for tidsrum"); continue; }
    }
    if (f.noise && !(wishes && /kursus|hold|træning/i.test(wishes))) { drop("kurser, hold og sæsonkort"); continue; }
    if (["billetto", "kglteater", "culturebox", "hangaren"].includes(it.source) && it.extra.onSale === false) { drop("ikke til salg"); continue; }

    // age
    if (minors && f.adult) { drop(ADULT_DROP); continue; }
    if (belowDoorAge(it, youngest)) { drop("under klubbens aldersgrænse"); continue; }
    if (youngest >= 13 && (f.kids || (it.ageFrom != null && it.ageFrom <= youngest - 8 && f.audKids))) { drop("for børn"); continue; }
    if (small) {
      // dropped on positive evidence (a court, nightlife, an age limit above the child, an audience without children); no age signal at all is unknown
      const grownUpsOnly = it.audience.length > 0 && !it.audience.some((x) => x === "børn" || x === "familie");
      if (it.kind === "slots" || f.nightlife || grownUpsOnly) { drop("ikke for små børn"); continue; }
      if (f.minAge != null && f.minAge > youngest) { drop("ikke for små børn"); continue; }
      if (!(f.kids || f.audKids)) unk.add("age");
      if (t != null && t >= 19 * 60) { drop("for sent for små børn"); continue; }
    } else if (youngest < 13 && f.maxAge != null && f.maxAge < youngest) { drop("for små børn"); continue; }
    else if (youngest < 13 && f.minAge != null && f.minAge > youngest + 1 && it.kind === "show") { drop("for ældre"); continue; }
    if (brief.area && brief.area !== "cph") {
      const where = norm([it.venue, it.address].join(" "));
      if (!where) unk.add("place");
      else if (!where.includes(norm(brief.area))) { drop("andet område"); continue; }
    }

    // weather
    if (f.outdoorish) {
      if (wet) { drop("udendørs i regn"); continue; }
      if (coldish) { drop("udendørs i kulde/blæst"); continue; }
      if (brief.indoorOnly) { drop("kun indendørs"); continue; }
    } else if (brief.indoorOnly && it.indoor == null) unk.add("indoor"); // no indoor/outdoor value and not outdoor-ish: kept, ranked after the known-indoor ones

    // budget: per person, a court's price is split between the players (at least two)
    let pp = it.priceMin;
    if (it.kind === "slots" && pp != null) pp = Math.round(pp / players);
    if (budget != null) {
      if (budget === 0) {
        if (it.free === true || it.priceMin === 0) { /* free */ }
        else if (it.free === false || (it.priceMin ?? 0) > 0) { drop("koster penge"); continue; }
        else {
          unk.add("price");
          it.freeGuess = it.source === "brugbyen"; // municipal houses: usually free
        }
      } else if (pp == null) unk.add("price");
      else if (pp > budget) { drop("over budget"); continue; }
    }

    // mood and wishes
    const wishHits = wWords.filter((w) => f.text.includes(w));
    let hit: Mood[] = [];
    if (moods.length) {
      hit = moods.filter((m) => f.moods.has(m));
      if (night && minors) {
        // nightlife for a minor: late concerts, shows and events, never clubs and bars
        if (f.nightlife && f.adult) { drop(ADULT_DROP); continue; }
        const late = t != null && t >= 19 * 60 && (f.moods.has("culture") || f.moods.has("social") || f.moods.has("gaming") || it.kind === "show");
        if (late && !hit.includes("nightlife")) hit.push("nightlife");
      }
      if (!hit.length && !wishHits.length) {
        // asked for a mood, no wish words, and nothing to read a mood from (no category, nothing in the title): unknown;
        // a known category of another kind is a no, and wish words stay strict like a search query
        if (f.moods.size === 0 && !it.categories.length && moodIn.length && !wWords.length) unk.add("category");
        else { drop("andet humør"); continue; }
      }
    } else if (wWords.length && !wishHits.length) { drop("matcher ikke ønsket"); continue; }
    kept.push({ ...it, f, hit, wishHits, pp, score: 0, unk: [...unk] });
  }

  // 2. score: fit first, then appeal (sources agreeing, premiere, value, a start time)
  for (const c of kept) {
    const f = c.f;
    let s = c.hit.length * 3 + Math.min(c.wishHits.length, 2) * 3;
    s += (c.sources.length - 1) * 1.5;
    if (c.extra.premiere) s += 2;
    if (c.free || c.priceMin === 0) s += 1.5;
    else if (c.pp != null && c.pp <= 100) s += 0.8;
    if (c.time || c.kind === "slots") s += 1;
    else s -= 2;
    if (c.kind === "show" || c.kind === "slots") s += 0.5;
    if (c.timeMayDiffer) s -= 1.5;
    if (c.indoor === true) s += wet || showers || coldish ? 1 : 0.3;
    if (f.outdoorish && showers) s -= 4;
    if (minors && f.teen) s += 2;
    if (small && (f.kids || f.audKids)) s += 1;
    if (c.kind === "slots") s -= 0.5; // many near-identical courts
    if (f.moods.size === 0) s -= 1;
    c.score = s;
  }
  kept.sort((a, b) => +(a.unk.length > 0) - +(b.unk.length > 0) || b.score - a.score);

  // 3. suggestions
  const price = (c: Candidate): string => {
    if (c.kind === "slots") {
      const each = [c.priceMin, c.priceMax].map((x) => (x == null ? null : Math.round(x / players)));
      const range = (a: number | null, b: number | null) => (a === b ? `${a}` : `${a}–${b}`);
      return `${range(c.priceMin, c.priceMax)} kr. pr. bane (ca. ${range(each[0]!, each[1]!)} kr. pr. person ved ${players})`;
    }
    if (c.free || c.priceMin === 0) return "gratis";
    return c.priceText || (c.freeGuess ? "gratis? (pris ikke oplyst)" : "pris ikke oplyst");
  };
  const timeText = (c: Candidate): string => {
    if (c.kind === "slots") {
      const t = c.timesIn!;
      return `${t[0]}–${t[t.length - 1]} · ${t.length} ledige tider`;
    }
    return c.time ? c.time + (c.endTime ? "–" + c.endTime : "") : "tid: se siden";
  };
  const toItem = (c: Candidate): SuggestionItem => ({
    time: timeText(c), title: c.title, place: c.venue ?? "", price: price(c), url: c.urls[0] || c.url, description: c.extra.description || null, categories: c.categories, ageFrom: c.ageFrom,
    sources: c.sources, ids: c.ids,
  });
  const why = (c: Candidate): string[] => {
    const w: string[] = [];
    const f = c.f;
    if (minors && youngest >= 13) w.push(`passer til ${youngest} år`);
    else if (small) w.push(c.unk.includes("age") ? "alder ikke oplyst: tjek beskrivelsen" : `for børn, passer til ${youngest} år`);
    else if (people.length > 1 && !minors) w.push(`for ${people.length} voksne`);
    if (c.free || c.priceMin === 0) w.push(c.freeGuess ? "formentlig gratis (pris ikke oplyst)" : "gratis");
    else if (budget != null && c.pp != null) w.push(`under ${budget} kr. pr. person (ca. ${c.pp} kr.)`);
    else if (c.priceMin == null && c.kind !== "slots") w.push("pris ikke oplyst");
    if (c.indoor === true) w.push(wet ? "regn: indendørs" : "indendørs");
    else if (c.unk.includes("indoor")) w.push("inde/ude ikke oplyst");
    else if (c.indoor === false || f.outdoorish) w.push("udendørs, tørvejr");
    for (const m of c.hit.slice(0, 2)) w.push(MOOD_DA[m] ?? m);
    if (c.wishHits[0]) w.push(`matcher "${c.wishHits[0]}"`);
    if (c.sources.length > 1) w.push(`${c.sources.length} kilder er enige`);
    if (c.extra.premiere) w.push("premiere");
    if (c.timeMayDiffer) w.push("tid kan afvige: tjek siden");
    if (c.notes[0]?.startsWith("tider afviger")) w.push("tider afviger mellem kilder");
    if (!c.time && c.kind !== "slots") w.push("tid: se siden");
    return uniq(w);
  };
  const kindOf = (c: Candidate): string => {
    const m = c.f.moods;
    if (c.kind === "slots" || m.has("active")) return "aktiv";
    if (m.has("gaming") || m.has("social") || m.has("food") || m.has("nightlife")) return m.has("culture") && c.kind === "show" ? "kultur" : "socialt";
    return "kultur";
  };

  interface Pending extends PlanSuggestion {
    out: Suggestion;
    score: number;
    /** Every candidate in it is unknown on a field a filter looks at: ranked after the sure matches. */
    unsure: boolean;
    /** A start time somewhere: required for the best bet. */
    timed: boolean;
  }
  const pending: Pending[] = [];
  const timedOf = (c: Candidate) => c.kind === "slots" || !!c.time;
  const eventCands = kept.filter((c) => c.kind !== "slots");
  const inThread = new Set<Candidate>();

  for (const th of findThreads(eventCands)) {
    const members = th.members.map((i) => eventCands[i]!);
    const ok = members.filter((c) => c.time && !c.timeMayDiffer).sort((a, b) => b.score - a.score);
    const chosenMembers = (ok.length >= 2 ? ok : members).slice(0, 4);
    const seenTitle = new Set<string>();
    const pick: Candidate[] = [];
    for (const c of chosenMembers) {
      const k = norm(c.title).slice(0, 18);
      if (seenTitle.has(k)) continue;
      seenTitle.add(k);
      pick.push(c);
    }
    // by start time, events without one last
    pick.sort((a, b) => (tmin(a.time) ?? 24 * 60) - (tmin(b.time) ?? 24 * 60));
    if (pick.length < 2) continue;
    members.forEach((c) => inThread.add(c));
    const top = Math.max(...members.map((c) => c.score));
    pending.push({
      isThread: true,
      lead: pick[0]!,
      members: pick,
      timed: pick.some(timedOf),
      unsure: members.every((c) => c.unk.length > 0),
      score: top + 3 + members.length * 0.3,
      out: {
        kind: "tråd",
        title: `${cap(th.key)}: ${members.length} steder samme dag`,
        why: uniq([`${members.length} steder samme dag`, `${th.sources.length} kilder peger på det`, ...why(pick[0]!).filter((x) => !/kilder er enige/.test(x))]).slice(0, 5),
        items: pick.map(toItem),
      },
    });
  }
  // singles; for courts the best one per sport and venue, at most two venues per sport
  const seenCourt = new Set<string>();
  const perSport: Record<string, number> = {};
  for (const c of kept) {
    if (inThread.has(c)) continue;
    if (c.kind === "slots") {
      const sport = c.extra.sport ?? "";
      const k = sport + "|" + c.venue;
      if (seenCourt.has(k)) continue;
      seenCourt.add(k);
      perSport[sport] = (perSport[sport] ?? 0) + 1;
      if (perSport[sport]! > 2) continue;
    }
    pending.push({ isThread: false, lead: c, members: [c], timed: timedOf(c), unsure: c.unk.length > 0, score: c.score, out: { kind: kindOf(c), title: c.title, why: why(c), items: [toItem(c)] } });
  }
  pending.sort((a, b) => +a.unsure - +b.unsure || b.score - a.score);

  // 4. best bet, then alternatives of different kinds
  const chosen: Pending[] = [];
  const sameCourtVenue = (s: Pending) => s.out.items[0]!.sources[0] === "wannasport" && chosen.some((x) => x.out.items[0]!.sources[0] === "wannasport" && norm(x.out.items[0]!.place) === norm(s.out.items[0]!.place));
  const tryAdd = (s: Pending, requireNewKind: boolean): boolean => {
    if (chosen.includes(s)) return false;
    if (requireNewKind && chosen.some((x) => x.out.kind === s.out.kind)) return false;
    if (chosen.some((x) => x.out.items[0]!.title === s.out.items[0]!.title)) return false;
    if (s.out.kind !== "tråd" && sameCourtVenue(s)) return false;
    chosen.push(s);
    return true;
  };
  // an event without a start time is never the best bet alone
  // and in rain or showers never one whose indoor/outdoor is unknown (it stays an alternative)
  const wetUnknown = (s: Pending) => (wet || showers) && s.members.every((m) => m.unk.includes("indoor"));
  const bestPick = pending.find((s) => s.timed && !wetUnknown(s));
  if (bestPick) tryAdd(bestPick, false);
  for (const s of pending) { if (chosen.length >= 5) break; tryAdd(s, true); }
  for (const s of pending) { if (chosen.length >= 3) break; tryAdd(s, false); }
  const best = bestPick ? chosen[0]! : null;
  const alternatives = chosen.slice(best ? 1 : 0, 5);

  const unknownSentences = Object.keys(UNKNOWN_SENTENCE).flatMap((k) => {
    const n = kept.filter((c) => c.unk.includes(k)).length;
    if (k === "indoor") return n ? [UNKNOWN_SENTENCE.indoor!(n) + (wet || showers ? " Regn eller byger: hvis det regner, så tjek at banen er indendørs; de er hverken bedste bud eller i planen." : "")] : [];
    return n ? [UNKNOWN_SENTENCE[k]!(n)] : [];
  });

  if (!best) {
    const reasons = Object.entries(dropped).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v} fjernet: ${k}`);
    const untimed = alternatives.length > 0;
    return {
      status: "ok", weather, best: null, alternatives: alternatives.map((s) => s.out), plan: undefined,
      assumptions: [
        ...assumptions,
        ...unknownSentences,
        untimed && pending.some((s) => s.timed && wetUnknown(s)) ? "Intet med kendt indendørs passede jeres brief; det der er med, har ikke oplyst inde/ude." : untimed ? "Intet med fast starttid passede jeres brief; det der er med, har ingen tid: tjek siden." : "Intet passede jeres brief.",
        ...reasons,
      ],
      more: {}, next: relaxNext(brief), stats: { candidates: kept.length, dropped, mergedAway },
    } satisfies Shortlist;
  }

  // 5. plan: the chosen first, then the next best
  const planPool = [...chosen, ...pending.filter((s) => !chosen.includes(s)).slice(0, 8)].filter((s) => !wetUnknown(s));
  const plan = buildItinerary(planPool, fromM, toM);

  // 6. more and next
  const shownIds = new Set(chosen.flatMap((s) => s.members.flatMap((m) => m.ids)));
  const shown = chosen.flatMap((s) => s.out.items.flatMap((i) => i.ids));
  const more = countMore(kept.filter((c) => !c.ids.some((id) => shownIds.has(id))));
  const next = buildNext(more, { brief, moods, fromMin: fromM, date, days: dates, shownIds: shown });

  // 7. assumptions
  const A = assumptions;
  if (budget == null) A.push("Budget ikke oplyst: ingen grænse, men god pris vægtes.");
  else if (budget === 0 && kept.some((c) => c.freeGuess)) A.push("Gratis-brief: jeg medregner brugbyen-rækker uden pris som formentlig gratis (kommunale huse).");
  if (chosen.some((s) => s.members.some((m) => m.kind === "slots"))) A.push(`Banepris delt på ${players} personer.`);
  if (chosen.some((s) => s.out.items.some((i) => i.price === "pris ikke oplyst"))) A.push('Hvor en kilde ikke giver en pris står "pris ikke oplyst".');
  if (chosen.some((s) => s.out.items.some((i) => i.time === "tid: se siden"))) A.push('Hvor en kilde ikke giver et starttidspunkt står "tid: se siden"; de er ikke med i planen.');
  if (wet) A.push("Regn: udendørs er sorteret fra.");
  else if (showers) A.push("Byger: udendørs er trukket ned.");
  else if (coldish) A.push(`Vejret er ${[wx.verdict.cold && "koldt", wx.verdict.windy && "blæsende", wx.verdict.snow && "snefyldt"].filter(Boolean).join(" og ")}: længere udendørs ting er sorteret fra, selv om det er tørt.`);
  if (night && minors) A.push("Natteliv med en under 18: klubber, barer og 18+-ting er sorteret fra på grund af alderen; i stedet viser jeg sene koncerter, shows og events fra ca. kl. 19.");
  else if (dropped[ADULT_DROP]) A.push(`${dropped[ADULT_DROP]} klubaftener, barer og 18+-ting er fjernet, fordi en af jer er ${youngest >= 10 ? youngest + " år" : "under 18"}.`);
  if (dropped["for børn"]) A.push(`${dropped["for børn"]} børnebegivenheder er fjernet: yngste er ${youngest} år.`);
  if (dropped["ikke for små børn"]) A.push(`${dropped["ikke for små børn"]} ting er fjernet, fordi de ikke er lavet til børn på ${youngest} år.`);
  A.push(...unknownSentences);
  if (mergedAway > 0) A.push(`${mergedAway} dubletter på tværs af kilder er slået sammen.`);
  chosen.flatMap((s) => s.members.flatMap((m) => m.notes)).filter((n) => !n.startsWith("tider afviger")).slice(0, 2).forEach((n) => A.push("Samme begivenhed: " + n));

  return {
    status: "ok", weather, best: best.out, alternatives: alternatives.map((s) => s.out), plan, assumptions: A, more, next,
    stats: { candidates: kept.length, dropped, mergedAway },
  };
}

/** Every id a result shows, for the `excludeIds` of a "show others" refinement. */
export function shownIds(res: PlanResult): string[] {
  if (res.status !== "ok" || !res.best) return res.status === "ok" ? res.alternatives.flatMap((s) => s.items.flatMap((i) => i.ids)) : [];
  return [res.best, ...res.alternatives].flatMap((s) => s.items.flatMap((i) => i.ids));
}
