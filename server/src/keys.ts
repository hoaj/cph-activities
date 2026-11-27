// Self-service identities without storage: a personal MCP key (the path segment of /mcp/<key>) and the
// chat's browser id (the cph_uid cookie). Each is a random id plus an HMAC of it under KEY_SECRET, so the
// server can check one without keeping a list. The id is the identity in limits and logs; without its
// signature it is useless.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type Signer = {
  /** A new personal MCP key: 64 hex characters. */
  newKey(): string;
  /** The key's limit name (`k-<id>`), or null when it is not a key this server signed. */
  keyName(key: string): string | null;
  /** A new chat browser id for the cookie. */
  newUid(): string;
  /** The id inside a signed cookie value, or null. */
  uidOf(value: string | undefined): string | null;
};

const ID_HEX = 32;

export function createSigner(secret: string): Signer {
  const sig = (kind: string, id: string) => createHmac("sha256", secret).update(`${kind}:${id}`).digest().subarray(0, 16);
  const make = (kind: string) => {
    const id = randomBytes(16).toString("hex");
    return id + sig(kind, id).toString("hex");
  };
  const check = (kind: string, value: string | undefined): string | null => {
    if (!value || !/^[0-9a-f]{64}$/.test(value)) return null;
    const id = value.slice(0, ID_HEX);
    return timingSafeEqual(Buffer.from(value.slice(ID_HEX), "hex"), sig(kind, id)) ? id : null;
  };
  return {
    newKey: () => make("mcp-key"),
    keyName: (key) => {
      const id = check("mcp-key", key);
      return id ? `k-${id}` : null;
    },
    newUid: () => make("web-uid"),
    uidOf: (value) => check("web-uid", value),
  };
}
