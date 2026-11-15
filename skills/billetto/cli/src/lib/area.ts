// Whether a Danish postcode lies in Københavns Kommune (same rule as the kulturkbh skill;
// skills share no code, so it is copied). Frederiksberg (1800–1999, 2000) is "outside".
// A postcode does not follow the municipal border exactly; the coordinates decide when there are some.
const CPH_POSTCODES = [2100, 2150, 2200, 2300, 2400, 2450, 2500, 2700, 2720]; // Ø, Nordhavn, N, S, NV, SV, Valby, Brønshøj, Vanløse
export const areaOf = (postcode: string | null): "cph" | "outside" | "unknown" => {
  if (postcode === null) return "unknown";
  const n = Number(postcode);
  if (!Number.isInteger(n) || n < 1000 || n > 9999) return "unknown"; // not a Danish postcode
  if (n >= 1000 && n <= 1799) return "cph"; // København K and V
  if (CPH_POSTCODES.includes(n)) return "cph";
  return "outside";
};

/** Unix seconds at 00:00 (start) or 24:00 (end) of a YYYY-MM-DD day in Copenhagen. */
export const dayBoundary = (day: string, end: boolean): number => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wallMidnight = Date.UTC(y, m - 1, d + (end ? 1 : 0)); // that midnight, read as if it were UTC
  // Copenhagen is 1 h ahead in winter, 2 h in summer; ask at the guessed instant again so the
  // answer holds on the days the clocks change.
  const guess = wallMidnight - copenhagenOffsetMs(wallMidnight);
  return Math.floor((wallMidnight - copenhagenOffsetMs(guess)) / 1000);
};

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Copenhagen", timeZoneName: "longOffset" });

/** Copenhagen's offset from UTC at an instant, in ms, from Intl ("GMT+01:00"). */
const copenhagenOffsetMs = (instant: number): number => {
  const name = offsetFormat.formatToParts(instant).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0; // "GMT": no offset
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -minutes : minutes) * 60_000;
};
