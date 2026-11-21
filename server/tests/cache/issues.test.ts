import { expect, test } from "bun:test";
import { filerFromEnv, githubFiler, issueBody, loggingFiler } from "../../src/cache";
import type { DriftReport } from "../../src/cache";
import { H } from "./helpers";

const FP = "cph-activities:dmi:GET /NinJo2DmiDk/ninjo2dmidk:zod:city:invalid_type";
const report = (at = "2026-12-01T10:00:00.000Z"): DriftReport => ({ fingerprint: FP, source: "dmi", skillVersion: "0.14.2", at });

/** A tiny fake of the GitHub REST calls the filer makes. */
function fakeGitHub(clockNow: () => number) {
  const issues: any[] = [];
  const comments: Record<number, any[]> = {};
  const calls: string[] = [];
  const fetch = (async (url: string, init: any = {}) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    calls.push(`${method} ${u.pathname}`);
    expect(init.headers.authorization).toBe("Bearer tok");
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (method === "GET" && u.pathname === "/repos/hoaj/cph-activities/issues") {
      expect(u.searchParams.get("labels")).toBe("drift");
      return json(issues.filter((i) => i.state === "open"));
    }
    if (method === "POST" && u.pathname === "/repos/hoaj/cph-activities/issues") {
      const b = JSON.parse(init.body);
      const i = { number: issues.length + 1, state: "open", created_at: new Date(clockNow()).toISOString(), ...b };
      issues.push(i);
      comments[i.number] = [];
      return json(i, 201);
    }
    const m = u.pathname.match(/issues\/(\d+)\/comments$/);
    if (m && method === "GET") return json(comments[+m[1]!]!.filter((c) => c.at > Date.parse(u.searchParams.get("since")!)));
    if (m && method === "POST") {
      comments[+m[1]!]!.push({ body: JSON.parse(init.body).body, at: clockNow() });
      return json({}, 201);
    }
    return json({}, 404);
  }) as any;
  return { fetch, issues, comments, calls };
}

test("files one issue per Fingerprint: title, label drift, shapes only", async () => {
  let now = Date.parse("2026-12-01T10:00:00Z");
  const gh = fakeGitHub(() => now);
  const filer = githubFiler({ token: "tok", fetch: gh.fetch, now: () => now });
  expect(await filer.file(report())).toBe("created");
  expect(gh.issues.length).toBe(1);
  expect(gh.issues[0]).toMatchObject({ title: FP, labels: ["drift"] });
  expect(gh.issues[0].body).toContain(FP);
  expect(gh.issues[0].body).toContain("dmi");
  expect(gh.issues[0].body).toContain("0.14.2");
  expect(gh.issues[0].body).toContain("2026-12-01T10:00:00.000Z");
});

test("no duplicate while an issue is open; at most one comment a day on it", async () => {
  let now = Date.parse("2026-12-01T10:00:00Z");
  const gh = fakeGitHub(() => now);
  const filer = githubFiler({ token: "tok", fetch: gh.fetch, now: () => now });
  await filer.file(report());
  now += 5 * H;
  expect(await filer.file(report())).toBe("skipped"); // the issue itself is from today
  now += 20 * H; // 25 h after creation
  expect(await filer.file(report())).toBe("commented");
  now += 3 * H;
  expect(await filer.file(report())).toBe("skipped"); // already commented today
  now += 22 * H;
  expect(await filer.file(report())).toBe("commented");
  expect(gh.issues.length).toBe(1);
  expect(gh.comments[1]!.length).toBe(2);
});

test("a closed issue does not block a new one; another Fingerprint gets its own", async () => {
  let now = Date.parse("2026-12-01T10:00:00Z");
  const gh = fakeGitHub(() => now);
  const filer = githubFiler({ token: "tok", fetch: gh.fetch, now: () => now });
  await filer.file(report());
  await filer.file({ ...report(), fingerprint: FP + "2" });
  expect(gh.issues.length).toBe(2);
  gh.issues[0].state = "closed";
  await filer.file(report());
  expect(gh.issues.length).toBe(3);
});

test("a GitHub failure is logged and never thrown", async () => {
  const logs: string[] = [];
  const filer = githubFiler({ token: "tok", fetch: (async () => new Response("no", { status: 403 })) as any, log: (e) => logs.push(e) });
  expect(await filer.file(report())).toBe("skipped");
  expect(logs).toEqual(["drift_issue_failed"]);
});

test("the issue body has no values: only the report's four fields, nothing else from an error", () => {
  const planted = "Roskilde-secret-42";
  // a report built from an error whose message holds a value can only carry its own fields
  const dirty = { ...report(), message: `city was ${planted}`, items: [planted] } as any;
  const body = issueBody(dirty);
  expect(body).not.toContain(planted);
  expect(body).toContain(FP);
});

test("without GITHUB_TOKEN the filer logs the issue it would file", async () => {
  const lines: [string, any][] = [];
  const filer = filerFromEnv({}, (e, x) => lines.push([e, x]));
  expect(await filer.file(report())).toBe("logged");
  expect(lines[0]![0]).toBe("drift_issue_would_file");
  expect(lines[0]![1]).toMatchObject({ title: FP, labels: ["drift"] });
  expect(await loggingFiler(() => {}).file(report())).toBe("logged");
});

test("with GITHUB_TOKEN set, the REST filer is used", async () => {
  const gh = fakeGitHub(() => Date.now());
  const filer = filerFromEnv({ GITHUB_TOKEN: "tok" }, () => {}, gh.fetch);
  expect(await filer.file(report())).toBe("created");
});
