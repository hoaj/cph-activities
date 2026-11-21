import type { Brief, BriefPatch, Mood, NextStep } from "./types";
import type { Features } from "./features";
import type { Merged } from "./merge";
import { dayName, tmin, uniq } from "./text";

export type Candidate = Merged & { f: Features; hit: Mood[]; wishHits: string[]; pp: number | null; score: number };

/** Applies a patch to a brief: a value sets the key, null deletes it. Returns a new brief. */
export function applyPatch(brief: Brief, patch: BriefPatch): Brief {
  const out: Record<string, unknown> = { ...brief };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out as unknown as Brief;
}

const isFree = (c: Candidate) => c.free === true || c.priceMin === 0;

/** Facet counts of what matched but is not shown; facets with fewer than two are dropped. */
export function countMore(rest: Candidate[]): Record<string, number> {
  const more: Record<string, number> = {};
  const bump = (k: string) => (more[k] = (more[k] ?? 0) + 1);
  for (const c of rest) {
    const t = tmin(c.time);
    const slots = c.kind === "slots";
    if (isFree(c)) bump("free");
    if (t != null && t >= 17 * 60) bump("evening");
    if (t != null && t < 13 * 60 && !slots) bump("morning");
    if (!slots && /koncert|musik|jazz|klassisk|rock|pop/i.test(c.f.head)) bump("concerts");
    if (c.kind === "show" || /teater|forestilling|stand up|revy|komedie/i.test(c.f.head)) bump("theatre");
    if (slots || c.f.moods.has("active")) bump("active");
    if (c.f.moods.has("gaming")) bump("gaming");
    if (c.f.moods.has("food")) bump("food");
    if (c.f.moods.has("social")) bump("social");
    if (c.f.moods.has("culture")) bump("culture");
    if (c.pp != null && c.pp <= 100 && !isFree(c)) bump("cheap");
    if (c.indoor === true) bump("indoor");
  }
  for (const k of Object.keys(more)) if (more[k]! < 2) delete more[k];
  return more;
}

interface FollowUpContext {
  brief: Brief;
  moods: Mood[];
  fromMin: number;
  date: string;
  days: string[];
  shownIds: string[];
}

/** The patch a facet stands for, applied to the brief it was computed from. */
function patchFor(facet: string, ctx: FollowUpContext): BriefPatch {
  const { brief } = ctx;
  const add = (m: Mood): Mood[] => uniq([...(brief.mood ?? []), m]);
  const wish = (w: string) => `${brief.wishes ?? ""} ${w}`.trim();
  switch (facet) {
    case "free": return { budgetPerPerson: 0 };
    case "cheap": return { budgetPerPerson: 100 };
    case "evening": return { from: "17:00" };
    case "concerts": return { mood: add("culture"), wishes: wish("koncert") };
    case "theatre": return { mood: add("culture"), wishes: wish("teater") };
    case "active": case "gaming": case "food": case "social": return { mood: [facet as Mood] };
    case "others": return { excludeIds: uniq([...(brief.excludeIds ?? []), ...ctx.shownIds]) };
    default: return facet.startsWith("day:") ? { date: facet.slice(4) } : {};
  }
}

/** Refinements grounded in `more`: never one the brief already is. Two to four. */
export function buildNext(more: Record<string, number>, ctx: FollowUpContext): NextStep[] {
  const { moods, brief, fromMin } = ctx;
  const budget = brief.budgetPerPerson;
  const table: [string, (n: number) => string, boolean][] = [
    ["concerts", (n) => `Flere koncerter (${n} til)`, true],
    ["theatre", (n) => `Teater og shows (${n} til)`, true],
    ["active", (n) => `Noget aktivt: baner og motion (${n})`, !moods.includes("active")],
    ["free", (n) => `Kun gratis (${n})`, budget !== 0],
    ["cheap", (n) => `Noget billigere, under 100 kr. (${n})`, budget == null || budget > 100],
    ["evening", (n) => `Kun efter kl. 17 (${n})`, fromMin < 17 * 60],
    ["gaming", (n) => `Mere gaming og spil (${n})`, !moods.includes("gaming")],
    ["food", (n) => `Noget med mad (${n})`, !moods.includes("food")],
    ["social", (n) => `Noget socialt (${n})`, !moods.includes("social")],
  ];
  const cand = table.filter(([k, , ok]) => ok && (more[k] ?? 0) >= 3).sort((a, b) => more[b[0]]! - more[a[0]]!);
  const next: NextStep[] = cand.slice(0, 3).map(([k, label]) => ({ label: label(more[k]!), patch: patchFor(k, ctx) }));
  const nd = ctx.days.find((d) => d > ctx.date) ?? ctx.days.find((d) => d !== ctx.date);
  if (nd && next.length < 4) next.push({ label: `Samme brief ${dayName(nd)} i stedet?`, patch: patchFor("day:" + nd, ctx) });
  if (next.length < 2) next.push({ label: "Vis andre forslag (skjul dem du har set)", patch: patchFor("others", ctx) });
  return next;
}

/** What to offer when nothing fit: widen the window, drop the limits. */
export function relaxNext(brief: Brief): NextStep[] {
  const steps: NextStep[] = [];
  if (brief.from || brief.to) steps.push({ label: "Prøv et bredere tidsrum", patch: { from: null, to: null } });
  if (brief.budgetPerPerson != null || brief.indoorOnly) {
    steps.push({ label: "Slå budgetgrænsen og 'kun indendørs' fra", patch: { budgetPerPerson: null, indoorOnly: null } });
  }
  if (!steps.length) steps.push({ label: "Prøv et andet humør", patch: { mood: null, wishes: null } });
  return steps;
}
