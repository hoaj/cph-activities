import { describe, expect, test } from "bun:test";
import { bookingUrl, showDescription, fitsAge, fitsMinAgeFrom, matchesCategory, isCopenhagen, localDate, localTime, pageUrl } from "../src/lib/shows";

describe("isCopenhagen", () => {
  test("Københavns and Frederiksberg Kommune only", () => {
    expect(isCopenhagen("Københavns Kommune")).toBe(true);
    expect(isCopenhagen("Frederiksberg Kommune")).toBe(true);
    expect(isCopenhagen("Gentofte Kommune")).toBe(false);
    expect(isCopenhagen(null)).toBe(false);
    expect(isCopenhagen(undefined)).toBe(false);
  });
});

describe("pageUrl", () => {
  test("slug and event number", () => {
    expect(pageUrl({ slug: "hamlet", eventNo: 42 })).toBe("https://teaterbilletter.dk/forestillinger/hamlet-42");
  });
});

describe("bookingUrl", () => {
  const item = { slug: "hamlet", eventNo: 42 };
  const page = "https://teaterbilletter.dk/forestillinger/hamlet-42";
  test("a good seller url is kept", () => {
    expect(bookingUrl({ ...item, ticketOperator: { url: "https://www.billetlugen.dk/x?y=1" } })).toBe("https://www.billetlugen.dk/x?y=1");
  });
  test("missing, empty or malformed falls back to the page", () => {
    expect(bookingUrl(item)).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: null })).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: { url: "" } })).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: { url: "https://www.https://billet.dk" } })).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: { url: "https://www.https" } })).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: { url: "not a url" } })).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: { url: "ftp://billet.dk/x" } })).toBe(page);
    expect(bookingUrl({ ...item, ticketOperator: { url: "https://localhost/x" } })).toBe(page);
  });
});

describe("localDate / localTime", () => {
  test("read the local string without conversion", () => {
    expect(localDate("2026-11-20T19:30:00")).toBe("2026-11-20");
    expect(localTime("2026-11-20T19:30:00")).toBe("19:30");
    expect(localTime("2026-07-01T00:05:00")).toBe("00:05");
  });
});

describe("fitsAge", () => {
  test("no age limit fits everyone, else the age must reach it", () => {
    expect(fitsAge(null, 5)).toBe(true);
    expect(fitsAge(undefined, 5)).toBe(true);
    expect(fitsAge(12, 12)).toBe(true);
    expect(fitsAge(12, 17)).toBe(true);
    expect(fitsAge(12, 11)).toBe(false);
  });
});

describe("matchesCategory", () => {
  const item = { categoryName: "Show, revy, Stand-up og Cabaret", subCategoryName: "Comedy", mappedCategoryNames: ["Komedie"] };
  test("a part of the item's own category or subcategory, any case", () => {
    expect(matchesCategory(item, "stand-up", [])).toBe(true);
    expect(matchesCategory(item, "comedy", [])).toBe(true);
    expect(matchesCategory(item, "drama", [])).toBe(false);
  });
  test("a site category name matches the item's mapped names", () => {
    expect(matchesCategory(item, "komedie", ["komedie"])).toBe(true);
    expect(matchesCategory({ ...item, mappedCategoryNames: null }, "komedie", ["komedie"])).toBe(false);
    expect(matchesCategory({ categoryName: null, subCategoryName: null }, "x", [])).toBe(false);
  });
});

describe("fitsMinAgeFrom", () => {
  test("keeps productions with no age limit or a limit at least the minimum", () => {
    expect(fitsMinAgeFrom(null, 10)).toBe(true);
    expect(fitsMinAgeFrom(undefined, 10)).toBe(true);
    expect(fitsMinAgeFrom(10, 10)).toBe(true);
    expect(fitsMinAgeFrom(15, 10)).toBe(true);
  });
  test("leaves out productions meant for younger children", () => {
    expect(fitsMinAgeFrom(7, 10)).toBe(false);
    expect(fitsMinAgeFrom(0, 1)).toBe(false);
  });
});

describe("showDescription", () => {
  test("the teaser comes before the subtitle and the description", () => {
    expect(showDescription({ teaser: "Et eventyr", subtitle: "Musical", description: "Lang tekst" })).toBe("Et eventyr");
    expect(showDescription({ teaser: " ", subtitle: "Musical", description: "Lang tekst" })).toBe("Musical");
    expect(showDescription({ teaser: null, subtitle: null, description: "Lang tekst" })).toBe("Lang tekst");
  });
  test("tags are removed, entities decoded and whitespace collapsed", () => {
    expect(showDescription({ description: "<p>Peter &amp; Wendy&nbsp;flyver</p>\n\n<p>til &quot;Ønskeland&quot; &#8211; &#x27;nu&#x27;</p><br/>Slut" })).toBe("Peter & Wendy flyver til \"Ønskeland\" – 'nu' Slut");
    expect(showDescription({ description: "a\n\n  b\tc" })).toBe("a b c");
  });
  test("long text is cut at a word boundary with an ellipsis, at most 500 characters", () => {
    const d = showDescription({ description: "ord ".repeat(300) })!;
    expect(d.length).toBeLessThanOrEqual(500);
    expect(d.endsWith(" ord…")).toBe(true);
    expect(showDescription({ description: "x".repeat(600) })!.length).toBe(500);
    expect(showDescription({ description: "kort" })).toBe("kort");
  });
  test("empty, missing or tag-only input gives null", () => {
    expect(showDescription({})).toBeNull();
    expect(showDescription({ teaser: "", subtitle: "  ", description: "<p> </p>" })).toBeNull();
  });
});
