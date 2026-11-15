// Whether a Danish postcode lies in Københavns Kommune (same rule as the kulturkbh skill;
// skills share no code, so it is copied). Frederiksberg (1800–1999, 2000) is "outside".
export const areaOf = (postcode: string | null): "cph" | "outside" | "unknown" => {
  if (postcode === null) return "unknown";
  const n = Number(postcode);
  if (!Number.isInteger(n)) return "unknown";
  if (n >= 1000 && n <= 1799) return "cph"; // København K and V
  if ([2100, 2150, 2200, 2300, 2400, 2450, 2500].includes(n)) return "cph"; // Ø, Nordhavn, N, S, NV, SV, Valby
  return "outside";
};

/** Unix seconds at 00:00 (start) or 24:00 (end) of a YYYY-MM-DD day in Copenhagen. */
export const dayBoundary = (day: string, end: boolean): number => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d + (end ? 1 : 0));
  // Copenhagen's offset from UTC on that day (1 h in winter, 2 h in summer).
  const local = new Date(new Date(utcMidnight).toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  const offsetMs = local.getTime() - new Date(new Date(utcMidnight).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return Math.floor((utcMidnight - offsetMs) / 1000);
};
