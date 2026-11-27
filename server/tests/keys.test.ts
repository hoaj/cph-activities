import { expect, test } from "bun:test";
import { createSigner } from "../src/keys";

const s = createSigner("x".repeat(32));

test("a new key is accepted and named by its id", () => {
  const key = s.newKey();
  expect(key).toMatch(/^[0-9a-f]{64}$/);
  expect(s.keyName(key)).toBe(`k-${key.slice(0, 32)}`);
});

test("a changed, short or foreign key is refused", () => {
  const key = s.newKey();
  const flipped = key.slice(0, 63) + (key[63] === "0" ? "1" : "0");
  expect(s.keyName(flipped)).toBeNull();
  expect(s.keyName(key.slice(0, 32))).toBeNull();
  expect(s.keyName("")).toBeNull();
  expect(createSigner("y".repeat(32)).keyName(key)).toBeNull();
});

test("a key is not a browser id, and the other way round", () => {
  const key = s.newKey();
  const uid = s.newUid();
  expect(s.uidOf(uid)).toBe(uid.slice(0, 32));
  expect(s.uidOf(key)).toBeNull();
  expect(s.keyName(uid)).toBeNull();
  expect(s.uidOf(undefined)).toBeNull();
});
