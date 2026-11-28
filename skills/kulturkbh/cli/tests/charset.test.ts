import { expect, test } from "bun:test";
import { decodeBody } from "../src/runtime/call";

const latin1 = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));
const utf8 = (s: string) => new TextEncoder().encode(s);

test("the charset of the content type wins over the document's meta tag", () => {
  const bytes = latin1('<meta charset="utf-8">Brønshøj');
  expect(decodeBody(bytes, "text/html; charset=ISO-8859-1")).toContain("Brønshøj");
});

test("a latin1 meta http-equiv decodes æøå", () => {
  const html = '<html><head><meta http-equiv="Content-Type" content="text/html;charset=iso-8859-1"/></head>Brønshøj Åbent';
  expect(decodeBody(latin1(html), "text/html")).toContain("Brønshøj Åbent");
});

test("an unquoted <meta charset> is read, with a missing content type", () => {
  expect(decodeBody(latin1("<meta charset=iso-8859-1>Brønshøj"), null)).toContain("Brønshøj");
});

test("no charset anywhere is UTF-8", () => {
  expect(decodeBody(utf8("<html>Brønshøj</html>"), "text/html")).toBe("<html>Brønshøj</html>");
});

test("a JSON answer is UTF-8 and never sniffed", () => {
  const body = '{"a":"Brønshøj","m":"<meta charset=iso-8859-1>"}';
  expect(decodeBody(utf8(body), "application/json")).toBe(body);
});

test("an unknown label falls back to UTF-8", () => {
  expect(decodeBody(utf8("Brønshøj"), "text/html; charset=nope-9")).toBe("Brønshøj");
  expect(decodeBody(utf8('<meta charset="nope-9">Brønshøj'), "text/html")).toContain("Brønshøj");
});
