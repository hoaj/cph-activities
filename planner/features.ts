import type { Item, Mood } from "./types";
import { RX, norm, tmin } from "./text";

/** What the planner reads off one (merged) item: age, kind of thing, mood, outdoors. */
export interface Features {
  minAge: number | null;
  maxAge: number | null;
  audKids: boolean;
  kids: boolean;
  teen: boolean;
  adult: boolean;
  nightlife: boolean;
  noise: boolean;
  outdoorish: boolean;
  moods: Set<Mood>;
  /** Normalised title + categories + description. */
  text: string;
  /** Normalised title + categories. */
  head: string;
}

export function annotate(it: Item): Features {
  const cats = (it.categories ?? []).join(" ");
  // normalising strips the "+" of "18+", so the age limit is read off the raw text
  const raw = [it.title, (it.categories ?? []).join(" "), it.extra?.description ?? ""].join(" ").toLowerCase();
  const over18 = /(?<!\d)18\s?\+|(?:fra|over|kun|min\.?|minimum)\s+18\s?år|(?<!\d)18-års|aldersgrænse:?\s*18/.test(raw);
  const text = norm([it.title, cats, it.extra?.description ?? ""].join(" "));
  const head = norm([it.title, cats].join(" "));
  const aud = it.audience ?? [];
  const range = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:år|aar)/.exec(text);
  const from = /fra (\d{1,2}) år/.exec(text);
  const minAge = it.ageFrom != null ? it.ageFrom : range ? Number(range[1]) : from ? Number(from[1]) : null;
  const maxAge = range ? Number(range[2]) : null;
  const onlyKidsAud = aud.length > 0 && aud.every((a) => a === "børn");
  const audKids = aud.includes("børn") || aud.includes("familie");
  // brugbyen files an event under every audience it suits, so "børn" there does not mean kids only
  const kids =
    onlyKidsAud ||
    (it.source !== "brugbyen" && aud.includes("børn")) ||
    RX.kids.test(head) ||
    (it.ageFrom != null && it.ageFrom <= 12) ||
    (maxAge != null && maxAge <= 14) ||
    /children|after_school|school|family/.test(cats);
  const t = tmin(it.time) ?? 0;
  const adult =
    RX.adult.test(head) ||
    over18 ||
    (t >= 22 * 60 && RX.nightMusic.test(head));
  const nightlife = adult || (t >= 21 * 60 && RX.nightMusic.test(head));
  const noise = RX.noise.test(head) && it.kind !== "slots";
  const outdoorish = it.indoor === false || (it.indoor == null && RX.outdoor.test(head) && it.kind !== "slots");

  const moods = new Set<Mood>();
  if (it.kind === "slots") {
    moods.add("active");
    if (it.extra?.sport === "tabletennis") moods.add("social");
  } else {
    if (RX.active.test(head) && it.kind !== "show") moods.add("active");
    if (it.kind === "show" || RX.culture.test(head)) moods.add("culture");
    if (RX.social.test(head)) moods.add("social");
    if (RX.calm.test(head)) moods.add("calm");
    if (RX.food.test(head)) moods.add("food");
    if (RX.gaming.test(head)) moods.add("gaming");
    if (nightlife) moods.add("nightlife");
    if (/active/.test(cats)) moods.add("active");
    if (moods.has("active") && /koreograf|ballet|forestilling|værk|duet|performance/.test(text)) moods.delete("active");
  }
  return { minAge, maxAge, audKids, kids, teen: aud.includes("unge"), adult, nightlife, noise, outdoorish, moods, text, head };
}
