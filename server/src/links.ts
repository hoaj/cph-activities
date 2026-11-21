// Personal links (hoaj/cph-activities #25): LINKS holds `name:<sha256 hex of the secret>` entries.
// The server keeps only hashes. The secret is the path segment of /mcp/<secret> (or a bearer token).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** A link's name is its only identity in logs and limits: short, lowercase, no personal data. */
export const NAME_RE = /^[a-z0-9-]{1,32}$/;

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export type LinkTable = {
  names: string[];
  /** The name of the link a secret belongs to, or null. Compares every hash, in constant time. */
  find(secret: string): string | null;
};

export function parseLinks(raw: string | undefined): LinkTable {
  const entries: { name: string; hash: Buffer }[] = [];
  for (const part of (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    const name = i < 0 ? part : part.slice(0, i);
    const hash = i < 0 ? "" : part.slice(i + 1);
    // Never echo the hash in an error: it is a (hashed) credential.
    if (!NAME_RE.test(name)) throw new Error(`LINKS: "${name.slice(0, 40)}" is not a link name (1-32 of a-z, 0-9, -)`);
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`LINKS: the entry for "${name}" is not name:<sha256 hex> (64 hex characters)`);
    if (entries.some((e) => e.name === name)) throw new Error(`LINKS: the name "${name}" appears twice`);
    entries.push({ name, hash: Buffer.from(hash, "hex") });
  }
  return {
    names: entries.map((e) => e.name),
    find(secret) {
      if (!secret) return null;
      const given = createHash("sha256").update(secret).digest();
      let found: string | null = null;
      for (const e of entries) if (timingSafeEqual(given, e.hash)) found = e.name;
      return found;
    },
  };
}

/** 32 random bytes, URL-safe. */
export const newSecret = () => randomBytes(32).toString("base64url");

export const hashLine = (name: string, secret: string) => `${name}:${sha256Hex(secret)}`;

export type CommandResult = { code: number; stdout: string; stderr: string };

const USAGE = "usage: bun server/links.ts add|rotate <name>   (needs PUBLIC_URL; names are a-z, 0-9, -)";

/** `add <name>` and `rotate <name>`: print the finished link once and the line to put in LINKS. */
export function linksCommand(argv: string[], env: Record<string, string | undefined>): CommandResult {
  const fail = (stderr: string): CommandResult => ({ code: 2, stdout: "", stderr: stderr + "\n" });
  const [cmd, name, ...rest] = argv;
  if ((cmd !== "add" && cmd !== "rotate") || name === undefined || rest.length) return fail(USAGE);
  if (!NAME_RE.test(name)) return fail(`"${name}" is not a link name: 1-32 characters of a-z, 0-9 and -. ${USAGE}`);
  let base: URL;
  try {
    base = new URL(env.PUBLIC_URL ?? "");
  } catch {
    return fail("PUBLIC_URL is not set to the server's public address (e.g. https://cph.example.com).");
  }
  let existing: string[];
  try {
    existing = parseLinks(env.LINKS).names;
  } catch (e) {
    return fail(String((e as Error).message));
  }
  if (cmd === "add" && existing.includes(name)) return fail(`LINKS already has "${name}". Use \`rotate ${name}\` to issue a new link for it.`);
  const secret = newSecret();
  const link = `${base.origin}${base.pathname.replace(/\/+$/, "")}/mcp/${secret}`;
  const line = hashLine(name, secret);
  const stdout =
    cmd === "add"
      ? `Link for ${name} (shown once; send it to them privately):\n${link}\n\nAdd this entry to the LINKS variable (comma-separated):\n${line}\n`
      : `New link for ${name} (shown once; the old one stops working when LINKS is updated):\n${link}\n\nReplace the "${name}:..." entry in the LINKS variable with:\n${line}\n`;
  return { code: 0, stdout, stderr: "" };
}
