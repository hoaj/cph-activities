import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { hashLine, linksCommand, newSecret, parseLinks, sha256Hex } from "../src/links";

const secret = "s3cret-value";
const entry = (name: string, s = secret) => `${name}:${sha256Hex(s)}`;

describe("parseLinks", () => {
  test("finds the name of a secret by its hash, and nothing for another secret", () => {
    const links = parseLinks(`${entry("anna")}, ${entry("peter", "other")}`);
    expect(links.names).toEqual(["anna", "peter"]);
    expect(links.find(secret)).toBe("anna");
    expect(links.find("other")).toBe("peter");
    expect(links.find("nope")).toBeNull();
    expect(links.find("")).toBeNull();
  });

  test("an unset or empty variable means no links", () => {
    expect(parseLinks(undefined).names).toEqual([]);
    expect(parseLinks("  ").find(secret)).toBeNull();
  });

  test("a malformed entry fails loudly without printing the hash", () => {
    expect(() => parseLinks("anna:xyz")).toThrow(/anna/);
    expect(() => parseLinks("anna")).toThrow();
    expect(() => parseLinks(`Anna Smith:${sha256Hex("x")}`)).toThrow(/name/);
    expect(() => parseLinks(`${entry("anna")},${entry("anna", "y")}`)).toThrow(/twice/);
    try {
      parseLinks(`anna:${sha256Hex("x")}zz`);
    } catch (e) {
      expect(String(e)).not.toContain(sha256Hex("x"));
    }
  });
});

describe("links command", () => {
  const env = { PUBLIC_URL: "https://cph.example.com/" } as Record<string, string>;

  test("add prints the finished link once and the matching hash line", () => {
    const r = linksCommand(["add", "anna"], env);
    expect(r.code).toBe(0);
    const link = r.stdout.match(/https:\/\/cph\.example\.com\/mcp\/(\S+)/);
    expect(link).not.toBeNull();
    const line = r.stdout.match(/^anna:([0-9a-f]{64})$/m);
    expect(line?.[1]).toBe(sha256Hex(link![1]!));
    expect(r.stdout).not.toContain("//mcp");
  });

  test("secrets are 32 random bytes and differ every time", () => {
    const a = newSecret();
    expect(Buffer.from(a, "base64url").length).toBe(32);
    expect(newSecret()).not.toBe(a);
    expect(hashLine("anna", a)).toBe(`anna:${sha256Hex(a)}`);
  });

  test("rotate prints a new link and hash line", () => {
    const r = linksCommand(["rotate", "anna"], env);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^anna:[0-9a-f]{64}$/m);
    expect(r.stdout).toMatch(/replace/i);
  });

  test("add refuses a name already in LINKS, rotate does not", () => {
    const withAnna = { ...env, LINKS: entry("anna") };
    expect(linksCommand(["add", "anna"], withAnna).code).toBe(2);
    expect(linksCommand(["rotate", "anna"], withAnna).code).toBe(0);
  });

  test("names are short [a-z0-9-] only; PUBLIC_URL and the command are required", () => {
    for (const bad of ["Anna", "a b", "anna/x", "", "x".repeat(33), "æ"]) {
      expect(linksCommand(["add", bad], env).code).toBe(2);
    }
    expect(linksCommand(["add", "anna"], {}).code).toBe(2);
    expect(linksCommand(["add", "anna"], { PUBLIC_URL: "not a url" }).code).toBe(2);
    expect(linksCommand([], env).code).toBe(2);
    expect(linksCommand(["remove", "anna"], env).code).toBe(2);
  });

  test("bun server/links.ts runs the same command", () => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "..", "links.ts"), "add", "anna"], { env: { ...process.env, PUBLIC_URL: "https://x.test" } });
    expect(p.exitCode).toBe(0);
    expect(p.stdout.toString()).toMatch(/https:\/\/x\.test\/mcp\//);
  });
});
