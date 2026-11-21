import { expect, test } from "bun:test";
import { createLogger, redact } from "../src/log";

test("redact hides the path secret and bearer tokens", () => {
  expect(redact("POST /mcp/abc-DEF_123 200")).toBe("POST /mcp/<redacted> 200");
  expect(redact('{"path":"/mcp/abc?x=1"}')).toBe('{"path":"/mcp/<redacted>?x=1"}');
  expect(redact("Authorization: Bearer abc.def-ghi")).toBe("Authorization: Bearer <redacted>");
  expect(redact("fine /healthz")).toBe("fine /healthz");
});

test("the logger redacts whatever it is given, even inside field values", () => {
  const lines: string[] = [];
  const log = createLogger((l) => lines.push(l));
  log("boom", { error: "failed on /mcp/TOPSECRET", header: "Bearer TOPSECRET" });
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain("TOPSECRET");
  expect(JSON.parse(lines[0]!).evt).toBe("boom");
});
