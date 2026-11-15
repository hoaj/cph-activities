import { expect, test } from "bun:test";
import { parseWhen } from "../src/lib/when";

const w = (text: string | null, venue: string | null = "X") => parseWhen(text, venue);
const r = (startDate: string | null, endDate: string | null, startTime: string | null, endTime: string | null, multiDay: boolean) => ({ startDate, endDate, startTime, endTime, multiDay });

test("one day with a time range and venue", () => {
  expect(w("Ons. 18. nov. 2026 kl. 06.50-07.50, Nørrebrohallen", "Nørrebrohallen")).toEqual(r("2026-11-18", "2026-11-18", "06:50", "07:50", false));
});
test("no time", () => {
  expect(w("Ons. 18. nov. 2026, The Pie Co", "The Pie Co")).toEqual(r("2026-11-18", "2026-11-18", null, null, false));
});
test("hour ranges", () => {
  expect(w("Ons. 18. nov. 2026 kl. 07-08, X")).toEqual(r("2026-11-18", "2026-11-18", "07:00", "08:00", false));
  expect(w("Ons. 18. nov. 2026 kl. 10.30-12, X")).toEqual(r("2026-11-18", "2026-11-18", "10:30", "12:00", false));
  expect(w("Ons. 18. nov. 2026 kl. 14-15:30, X")).toEqual(r("2026-11-18", "2026-11-18", "14:00", "15:30", false));
});
test("single time", () => {
  expect(w("Ons. 18. nov. 2026 kl. 07.30, X")).toEqual(r("2026-11-18", "2026-11-18", "07:30", null, false));
});
test("several times: the first, no end", () => {
  expect(w("Ons. 18. nov. 2026 kl. 10 & 11.30, X")).toEqual(r("2026-11-18", "2026-11-18", "10:00", null, false));
  expect(w("Ons. 18. nov. 2026 kl. 10, 12 & 14, X")).toEqual(r("2026-11-18", "2026-11-18", "10:00", null, false));
});
test("two days", () => {
  expect(w("Ons. 18. og tor. 19. nov. 2026, X")).toEqual(r("2026-11-18", "2026-11-19", null, null, true));
  expect(w("Man. 9. til søn. 22. nov. 2026 kl. 10-17, X")).toEqual(r("2026-11-09", "2026-11-22", "10:00", "17:00", true));
});
test("ranges across months and years", () => {
  expect(w("Tor. 10. sep. til tor. 19. nov. 2026, X")).toEqual(r("2026-09-10", "2026-11-19", null, null, true));
  expect(w("Fre. 15. maj 2026 til søn. 22. nov. 2026 kl. 11-17, X")).toEqual(r("2026-05-15", "2026-11-22", "11:00", "17:00", true));
  expect(w("Søn. 27. dec. til søn. 3. jan. 2027, X")).toEqual(r("2026-12-27", "2027-01-03", null, null, true));
});
test("'6 mødegange' is no time", () => {
  expect(w("Fre. 11. sep. til fre. 20. nov. 2026 6 mødegange kl. 10-11.30, X")).toEqual(r("2026-09-11", "2026-11-20", "10:00", "11:30", true));
  expect(w("Fre. 11. sep. til fre. 20. nov. 2026 6 mødegange, X")).toEqual(r("2026-09-11", "2026-11-20", null, null, true));
});
test("times without kl.", () => {
  expect(w("Lør. 21. nov. 2026 10:00-12:00 og 13:00-15-00, X")).toEqual(r("2026-11-21", "2026-11-21", "10:00", "12:00", false));
});
test("null text", () => {
  expect(w(null)).toEqual(r(null, null, null, null, false));
});
test("invalid hours are no time", () => {
  expect(w("Ons. 18. nov. 2026 kl. 25.00, X").startTime).toBeNull();
});
