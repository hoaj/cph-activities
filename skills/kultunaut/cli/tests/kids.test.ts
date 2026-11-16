import { describe, expect, test } from "bun:test";
import { isForKids } from "../src/lib/kids";

describe("isForKids", () => {
  test("the five children's genres", () => {
    for (const g of ["Børn", "For børn", "Børneteater", "Baby/Barsel", "Familiefilm"]) expect(isForKids(g)).toBe(true);
  });
  test("any part of a comma list, any case, trimmed", () => {
    expect(isForKids("Andet boldspil, Børn")).toBe(true);
    expect(isForKids("Jazz,  FOR BØRN ")).toBe(true);
  });
  test("adult genres and null are not for kids", () => {
    for (const g of ["Jazz", "Skuespil", "Kampsporttræning", "Jazz, Rock", ""]) expect(isForKids(g)).toBe(false);
    expect(isForKids(null)).toBe(false);
  });
});
