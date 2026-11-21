import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Failure } from "../src/runtime/envelope";
import { Client } from "../src/runtime/call";
import eventShow from "../src/commands/event-show";
import getEvent from "../src/operations/getEvent";
import { describe as describeEvent, eventSlug, MAX_DESCRIPTION } from "../src/lib/description";
import site from "../src/site";
import { fakeFetch, makeDeps, tempHome, type Recorded } from "./helpers";

let home: ReturnType<typeof tempHome>;
beforeEach(() => (home = tempHome()));
afterEach(() => home.cleanup());

// The real page of /det-sker/garn-cafe-0, trimmed to the elements the Operation reads.
const PAGE = readFileSync(new URL("./fixtures/event-show.html", import.meta.url), "utf8");
const TEASER = /<div class="field field--name-teaser[^>]*>[^<]*<\/div>/;
const BODY = /<div class="clearfix text-formatted field field--name-body[^>]*>.*?<\/div>/;
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

const runCommand = (c: Client, args: Record<string, unknown>) =>
  eventShow.run(eventShow.args.parse(args), { call: (op, vars) => c.call(op, vars), session: { ids: {} }, note: () => {} }) as Promise<any>;

const run = async (args: Record<string, unknown>, page = PAGE) => {
  const f = fakeFetch(() => html(page));
  const out = await runCommand(new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false }), args);
  return { out, calls: f.calls as Recorded[] };
};
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Failure) return e;
    throw e;
  }
  throw new Error("did not fail");
};

describe("the Operation against the recorded page", () => {
  const call = async (page: string) => {
    const f = fakeFetch(() => html(page));
    return new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false }).call(getEvent, { slug: "garn-cafe-0" });
  };
  test("teaser and body", async () => {
    const r = await call(PAGE);
    expect(r.title).toBe("Garn-café");
    expect(r.teaser).toStartWith("Fordyb dig i strik, hækling og broderi");
    expect(r.body).toStartWith("I garncaféen kan du fordybe dig");
    expect(r.body).toContain("velkomne. Du kan dele"); // paragraphs are joined by a space
    expect(r.body).not.toContain("<");
  });
  test("teaser only", async () => {
    const r = await call(PAGE.replace(BODY, ""));
    expect(r.teaser).not.toBeNull();
    expect(r.body).toBeNull();
  });
  test("body only", async () => {
    const r = await call(PAGE.replace(TEASER, ""));
    expect(r.teaser).toBeNull();
    expect(r.body).not.toBeNull();
  });
  test("neither", async () => {
    const r = await call(PAGE.replace(TEASER, "").replace(BODY, ""));
    expect(r).toEqual({ title: "Garn-café", teaser: null, body: null });
  });
  test("a page with no title is Drift", async () => {
    const e = await failure(call(PAGE.replace('class="page-title"', 'class="x"')));
    expect(e.kind).toBe("drift");
  });
  test("requests /det-sker/<slug>", async () => {
    const { calls } = await run({ url: "/det-sker/garn-cafe-0" });
    expect(calls.map((c) => c.url)).toEqual(["https://brugbyen.kk.dk/det-sker/garn-cafe-0"]);
  });
});

describe("event show", () => {
  test("returns title, url and the teaser as description", async () => {
    const { out } = await run({ url: "https://brugbyen.kk.dk/det-sker/garn-cafe-0" });
    expect(out.title).toBe("Garn-café");
    expect(out.url).toBe("https://brugbyen.kk.dk/det-sker/garn-cafe-0");
    expect(out.description).toStartWith("Fordyb dig i strik");
  });
  test("falls back to the body, and to null", async () => {
    expect((await run({ url: "/det-sker/x" }, PAGE.replace(TEASER, ""))).out.description).toStartWith("I garncaféen");
    expect((await run({ url: "/det-sker/x" }, PAGE.replace(TEASER, "").replace(BODY, ""))).out.description).toBeNull();
  });
  for (const url of ["https://example.com/det-sker/x", "/det-sker", "/det-sker/", "/andet/x", "/det-sker/a/b", "http://brugbyen.kk.dk/det-sker/x"]) {
    test(`rejects ${url} before any request`, async () => {
      const f = fakeFetch(() => html(PAGE));
      const c = new Client(site, makeDeps(f.fetch, home.dir).deps, { confirm: false });
      const e = await failure(runCommand(c, { url }));
      expect(e.kind).toBe("input");
      expect(f.calls.length).toBe(0);
    });
  }
});

describe("describe", () => {
  test("prefers the teaser, collapses whitespace, null when empty", () => {
    expect(describeEvent(" Et  \n teaser ", "body")).toBe("Et teaser");
    expect(describeEvent("  ", "Krop tekst")).toBe("Krop tekst");
    expect(describeEvent(null, null)).toBeNull();
    expect(describeEvent("", " ")).toBeNull();
  });
  test("cuts at a word boundary with an ellipsis, at most 500 characters", () => {
    const text = Array.from({ length: 200 }, (_, i) => `ord${i}`).join(" ");
    const d = describeEvent(text, null)!;
    expect(d.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(d.endsWith("…")).toBe(true);
    expect(text.startsWith(d.slice(0, -1))).toBe(true);
    expect(text[d.length - 1]).toBe(" "); // the cut is where a word ended
  });
  test("exactly 500 is kept whole; a single long word is cut hard", () => {
    expect(describeEvent("a".repeat(500), null)).toBe("a".repeat(500));
    const d = describeEvent("a".repeat(900), null)!;
    expect(d.length).toBe(500);
    expect(d.endsWith("…")).toBe(true);
  });
});

describe("eventSlug", () => {
  test("accepts a path or a full URL, with query, hash and trailing slash", () => {
    expect(eventSlug("/det-sker/garn-cafe-0")).toBe("garn-cafe-0");
    expect(eventSlug("https://brugbyen.kk.dk/det-sker/garn-cafe-0/?x=1#y")).toBe("garn-cafe-0");
    expect(eventSlug("/det-sker/k%C3%B8d")).toBe("kød");
  });
  test("rejects other hosts and paths", () => {
    expect(eventSlug("https://brugbyen.kk.dk.evil.test/det-sker/x")).toBeNull();
    expect(eventSlug("//evil.test/det-sker/x")).toBeNull();
    expect(eventSlug("/det-sker")).toBeNull();
    expect(eventSlug("/det-sker/%E0%A4%A")).toBeNull();
  });
});
