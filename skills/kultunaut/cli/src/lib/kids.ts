// KultuNaut tags children's events in the event's genre text, a comma list ("Andet boldspil, Børn").
const KIDS = new Set(["børn", "for børn", "børneteater", "baby/barsel", "familiefilm"]);

export const isForKids = (genre: string | null): boolean =>
  (genre ?? "").split(",").some((part) => KIDS.has(part.trim().toLowerCase()));
