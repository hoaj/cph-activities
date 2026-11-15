import { describe, expect, test } from "bun:test";
import { absoluteUrl, areaOf, isFree, postcodeOf } from "../src/lib/events";

describe("postcodeOf", () => {
  test("takes the last four-digit number of the first text that has one", () => {
    expect(postcodeOf("Gade 12, 1415 København K")).toBe("1415");
    expect(postcodeOf("Vej 2000, 2100 København Ø")).toBe("2100");
    expect(postcodeOf(null, "Sted, 2635 Ishøj")).toBe("2635");
    expect(postcodeOf("", undefined)).toBeNull();
    expect(postcodeOf("Et museum")).toBeNull();
  });
});

describe("areaOf", () => {
  test("splits Københavns and Frederiksberg Kommune from the rest", () => {
    expect(areaOf("1415")).toBe("cph");
    expect(areaOf("2450")).toBe("cph");
    expect(areaOf("2700")).toBe("cph"); // Brønshøj
    expect(areaOf("2720")).toBe("cph"); // Vanløse
    expect(areaOf("0")).toBe("unknown");
    expect(areaOf("2000")).toBe("cph");
    expect(areaOf("1850")).toBe("cph");
    expect(areaOf("2635")).toBe("outside");
    expect(areaOf(null)).toBe("unknown");
  });
});

describe("isFree", () => {
  test("a word that says free", () => {
    expect(isFree("Gratis")).toBe(true);
    expect(isFree("Fri entré")).toBe(true);
    expect(isFree("Free")).toBe(true);
  });
  test("an amount", () => expect(isFree("120 kr.")).toBe(false));
  test("a pointer elsewhere or nothing", () => {
    expect(isFree("Se billetsiden")).toBeNull();
    expect(isFree(null)).toBeNull();
    expect(isFree("")).toBeNull();
  });
});

describe("absoluteUrl", () => {
  test("keeps an absolute link and resolves a relative one on the origin", () => {
    expect(absoluteUrl("https://example.org/e/1", "https://kulturkbh.dk")).toBe("https://example.org/e/1");
    expect(absoluteUrl("/side.html", "https://kulturkbh.dk")).toBe("https://kulturkbh.dk/side.html");
  });
});
