/** fetchDay runs the real skill code in-process; the network is a fake `deps.fetch`, so nothing leaves the machine. */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchDay } from "../fetch-day";

const stateRoot = mkdtempSync(join(tmpdir(), "planner-test-"));
process.on("exit", () => rmSync(stateRoot, { recursive: true, force: true }));

function counting(respond: () => Response) {
  const urls: string[] = [];
  const fake = (async (input: RequestInfo | URL) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return respond();
  }) as typeof fetch;
  return { fake, urls };
}

describe("fetchDay", () => {
  test("a 404 is Drift: the envelope's kind and Fingerprint come back, nothing throws, upstream calls are counted", async () => {
    const { fake, urls } = counting(() => new Response("nope", { status: 404 }));
    const r = await fetchDay("dmi", "2026-11-21", { deps: { fetch: fake, stateRoot, retryDelays: [] } });
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.calls).toBe(2); // the day and the evening window
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatchObject({ kind: "drift", code: 3 });
    expect(r.errors[0]!.fingerprint).toMatch(/:dmi:/);
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });

  test("a 503 is network, not Drift, and carries no Fingerprint", async () => {
    const { fake } = counting(() => new Response("down", { status: 503 }));
    const r = await fetchDay("absalon", "2026-11-21", { deps: { fetch: fake, stateRoot, retryDelays: [] } });
    expect(r.errors[0]).toMatchObject({ kind: "network", code: 5 });
    expect(r.errors[0]!.fingerprint).toBeUndefined();
  });

  test("brugbyen with an audience makes one call; without, one per group", async () => {
    const { fake } = counting(() => new Response("down", { status: 503 }));
    const one = await fetchDay("brugbyen", "2026-11-21", { audience: "børn", deps: { fetch: fake, stateRoot, retryDelays: [] } });
    expect(one.calls).toBe(1);
    expect(one.errors[0]!.command).toBe("event list --group børn");
    const all = await fetchDay("brugbyen", "2026-11-21", { deps: { fetch: fake, stateRoot, retryDelays: [] } });
    expect(all.calls).toBe(3);
  });

  test("a call that takes too long is a timeout error, not a hang", async () => {
    const slow = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const r = await fetchDay("dmi", "2026-11-21", { timeoutMs: 50, deps: { fetch: slow, stateRoot } });
    expect(r.errors.map((e) => e.kind)).toEqual(["timeout", "timeout"]);
  });
});
