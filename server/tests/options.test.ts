import { describe, expect, test } from "bun:test";
import { createOptionsLoader } from "../src/options";
import { ItemIndex } from "../src/item-index";

const ok = (output: unknown) => ({ ok: true as const, output });
const fail = (kind: string) => ({ ok: false as const, error: { kind, code: 5, command: "x", message: "m" } });

describe("options loader", () => {
  test("merges brugbyen and kultunaut names, and keeps the answer for six hours", async () => {
    let t = 0;
    const seen: string[] = [];
    const load = createOptionsLoader({
      now: () => t,
      run: (async (source: string) => {
        seen.push(source);
        return source === "brugbyen"
          ? ok({ categories: [{ id: "1", name: "Musik" }], groups: [{ id: "10", name: "Børn" }], districts: [{ id: "5", name: "Vesterbro" }] })
          : ok({ genres: ["musik", "Jazz"] });
      }) as any,
    });
    const r = await load();
    expect(r.data.categories).toEqual([{ name: "Jazz", sources: ["kultunaut"] }, { name: "Musik", sources: ["brugbyen", "kultunaut"] }]);
    expect(r.data.brugbyen.districts).toEqual(["Vesterbro"]);
    expect(r.data.sports).toContain("padel");
    await load();
    t = 5 * 3600_000;
    await load();
    expect(seen).toEqual(["brugbyen", "kultunaut"]);
    t = 7 * 3600_000;
    await load();
    expect(seen).toHaveLength(4);
  });

  test("a failed list is reported missing and tried again after a minute", async () => {
    let t = 0;
    let n = 0;
    const load = createOptionsLoader({ now: () => t, run: (async (source: string) => (source === "kultunaut" && n++ === 0 ? fail("network") : ok({ genres: ["Jazz"], categories: [], groups: [], districts: [] }))) as any });
    const first = await load();
    expect(first.sources).toContainEqual({ source: "kultunaut", status: "missing", kind: "network" });
    expect(first.data.kultunaut.genres).toEqual([]);
    t = 30_000;
    expect((await load()).sources.find((s) => s.source === "kultunaut")!.status).toBe("missing");
    t = 61_000;
    const again = await load();
    expect(again.sources.every((s) => s.status === "fresh")).toBe(true);
    expect(again.data.kultunaut.genres).toEqual(["Jazz"]);
  });
});

describe("item index", () => {
  test("forgets after its time and keeps at most max", () => {
    let t = 0;
    const m = (id: string) => ({ id, ids: [id], title: id, titles: [id], urls: [], notes: [], sources: ["kultunaut"] }) as any;
    const idx = new ItemIndex({ ttlMs: 1000, max: 2, now: () => t });
    idx.remember([m("a"), m("b"), m("c")], []);
    expect(idx.get("a")).toBeUndefined();
    expect(idx.get("c")).toBeDefined();
    t = 2000;
    expect(idx.get("c")).toBeUndefined();
  });
});
