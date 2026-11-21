import type { Candidate } from "./followups";
import { hhmm, tmin } from "./text";

/** The slice of a suggestion the itinerary needs: its lead candidate and, for a thread, all members. */
export interface PlanSuggestion {
  isThread: boolean;
  lead: Candidate;
  members: Candidate[];
}

interface Stop {
  start: number;
  end: number;
  text: string;
}

const duration = (c: Candidate): number => {
  const a = tmin(c.time);
  const b = tmin(c.endTime);
  if (a != null && b != null && b > a) return b - a;
  return c.kind === "slots" ? 60 : c.kind === "show" ? 120 : 90;
};
const startOf = (c: Candidate): number | null => (c.kind === "slots" ? tmin(c.timesIn?.[0]) : tmin(c.time));
const MARKET_VISIT = 90;

/**
 * A simple day or evening: up to three timed stops that fit with 30 minutes between, at most one court
 * session, and a meal where a gap is long enough. Events without a start time never get a slot.
 * `pool` is ordered best first; `best` is the first suggestion of it.
 */
export function buildItinerary(pool: PlanSuggestion[], fromMin: number, toMin: number): string[] | undefined {
  const stops: Stop[] = [];
  const fits = (start: number, dur: number) => stops.every((st) => start >= st.end + 30 || start + dur + 30 <= st.start);
  let courtStops = 0;
  const timed = pool.filter((x) => startOf(x.lead) != null);
  const best = pool[0];
  for (const x of timed) {
    if (x.lead.kind === "slots") {
      if (courtStops) continue; // one court session is enough for a plan
      const times = x.lead.timesIn ?? [];
      const lastStart = tmin(times[times.length - 1]) ?? 0;
      const prev = stops.filter((st) => st.start < lastStart).sort((a, b) => b.end - a.end)[0];
      const want = prev ? prev.end + 30 : startOf(x.lead)!;
      const t = times.find((tt) => tmin(tt)! >= want);
      if (!t || (tmin(t)! > 21 * 60 && x !== best)) continue;
      if (!fits(tmin(t)!, 60)) continue;
      stops.push({ start: tmin(t)!, end: tmin(t)! + 60, text: `${t} ${x.lead.title} (${x.lead.venue})` });
      courtStops++;
    } else if (x.lead.source === "visitorservice" && tmin(x.lead.endTime) != null) {
      // a market is a 90-minute visit at any time while it is open, not one event from opening to closing
      const m = x.lead;
      const last = Math.min(tmin(m.endTime)!, toMin) - MARKET_VISIT;
      let s = Math.max(tmin(m.time)!, fromMin);
      while (s <= last && !fits(s, MARKET_VISIT)) s += 30;
      if (s > last) continue;
      stops.push({ start: s, end: s + MARKET_VISIT, text: `${hhmm(s)} ${m.title}, åbent til ${m.endTime} (${m.venue || "sted ikke oplyst"})` });
    } else {
      const c = (x.isThread ? x.members : [x.lead]).find((m) => m.time && fits(tmin(m.time)!, duration(m)));
      if (!c) continue;
      const s = tmin(c.time)!;
      stops.push({ start: s, end: s + duration(c), text: `${c.time}${c.endTime ? "–" + c.endTime : ""} ${c.title} (${c.venue || "sted ikke oplyst"})` });
    }
    if (stops.length >= 3) break;
  }
  stops.sort((a, b) => a.start - b.start);

  const steps: string[] = [];
  const first = stops[0];
  if (first && first.start >= 18 * 60 + 30 && first.start <= 21 * 60 && fromMin <= first.start - 90) {
    steps.push(`ca. ${hhmm(first.start - 90)} aftensmad inden`);
  }
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!;
    const next = stops[i + 1];
    steps.push(stop.text);
    const gapStart = stop.end;
    const gapEnd = next ? next.start : Math.min(toMin, gapStart + 150);
    const lunch = gapStart <= 13 * 60 && gapEnd >= 14 * 60 && gapEnd - gapStart >= 60 && !steps.some((x) => x.includes("frokost"));
    if (lunch) steps.push(`ca. ${hhmm(Math.max(gapStart + 15, 12 * 60 + 15))} frokost i nærheden`);
    else if (next && gapEnd - gapStart >= 60 && gapStart >= 16 * 60 + 30 && gapEnd <= 21 * 60) steps.push(`ca. ${hhmm(gapStart + 15)} aftensmad i nærheden`);
    else if (!next && gapStart >= 16 * 60 && gapStart <= 20 * 60 && gapStart + 60 <= toMin) {
      steps.push(`bagefter: aftensmad eller en kop kaffe nær ${stop.text.split("(").pop()!.replace(")", "")}`);
    }
  }
  return steps.length >= 2 ? steps : undefined;
}
