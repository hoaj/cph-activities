import { expect, test } from "bun:test";
import { otherDates, parseDateText, totalOf } from "../src/lib/when";

const r = (startDate: string | null, endDate: string | null, startTime: string | null, endTime: string | null) => ({ startDate, endDate, startTime, endTime });

test("a dated occurrence with a time range", () => {
  expect(parseDateText("Man. 16. nov. 2026 Kl. 19.30 - 21.30")).toEqual(r("2026-11-16", "2026-11-16", "19:30", "21:30"));
});
test("a period with a time, no space before Kl.", () => {
  expect(parseDateText("01.10.2026 - 28.02.2027Kl. 10 - 17")).toEqual(r("2026-10-01", "2027-02-28", "10:00", "17:00"));
  expect(parseDateText("03.11.2026 - 09.02.2027Kl. 11.30 - 14.30")).toEqual(r("2026-11-03", "2027-02-09", "11:30", "14:30"));
});
test("a single time has no end; no time is none", () => {
  expect(parseDateText("Fre. 20. nov. 2026 Kl. 20")).toEqual(r("2026-11-20", "2026-11-20", "20:00", null));
  expect(parseDateText("Fre. 20. nov. 2026")).toEqual(r("2026-11-20", "2026-11-20", null, null));
});
test("a numeric date with one time, any case of Kl., colon times", () => {
  expect(parseDateText("20.11.2026 Kl. 9.30")).toEqual(r("2026-11-20", "2026-11-20", "09:30", null));
  expect(parseDateText("20.11.2026 kl. 9:30 - 11")).toEqual(r("2026-11-20", "2026-11-20", "09:30", "11:00"));
});
test("every month abbreviation, dot optional", () => {
  const ms = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  ms.forEach((m, i) => {
    const mm = String(i + 1).padStart(2, "0");
    expect(parseDateText(`Man. 5. ${m}. 2026`)?.startDate).toBe(`2026-${mm}-05`);
    expect(parseDateText(`Man. 5. ${m} 2026`)?.startDate).toBe(`2026-${mm}-05`);
  });
});
test("null and garbage are all null", () => {
  expect(parseDateText(null)).toEqual(r(null, null, null, null));
  expect(parseDateText("snart")).toEqual(r(null, null, null, null));
  expect(parseDateText("")).toEqual(r(null, null, null, null));
});
test("otherDates", () => {
  expect(otherDates("14 andre datoer")).toBe(14);
  expect(otherDates("1 anden dato")).toBe(1);
  expect(otherDates("")).toBe(0);
  expect(otherDates(null)).toBe(0);
});
test("totalOf", () => {
  expect(totalOf("Viser 1-21 af 27 resultater")).toBe(27);
  expect(totalOf("Viser 1-3 af 3 resultater")).toBe(3);
  expect(totalOf(null)).toBeNull();
  expect(totalOf("ingen")).toBeNull();
});
