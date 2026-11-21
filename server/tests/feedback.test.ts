import { describe, expect, test } from "bun:test";
import type { FeedbackGitHub, IssueRef } from "../src/cache";
import { createFeedback, guardText, issueBody, similarity, tokens, type FeedbackInput } from "../src/feedback";
import { connectTools, fakeDeps } from "./helpers";

const T0 = Date.parse("2026-11-21T10:00:00Z");

/** A fake GitHub holding a list of issues; records what is created and commented. */
function fakeGitHub(existing: Partial<IssueRef>[] = [], o: { failWith?: string } = {}) {
  const issues: IssueRef[] = existing.map((i, n) => ({ number: 100 + n, title: "", body: "", url: `https://github.test/${100 + n}`, state: "open", ...i }));
  const created: { title: string; body: string; labels: string[] }[] = [];
  const comments: { number: number; body: string }[] = [];
  const gh: FeedbackGitHub = {
    async listCandidates() {
      if (o.failWith) throw new Error(o.failWith);
      return issues;
    },
    async createIssue(i) {
      if (o.failWith) throw new Error(o.failWith);
      created.push(i);
      return { number: 200 + created.length, url: `https://github.test/${200 + created.length}` };
    },
    async comment(number, body) {
      comments.push({ number, body });
      return { url: `https://github.test/${number}#c` };
    },
  };
  return { gh, created, comments };
}

const input = (over: Partial<FeedbackInput> = {}): FeedbackInput => ({
  kind: "bug", title: "Padel search returns no courts", what_happened: "Asked for padel on Saturday afternoon, find_activity_slots returned an empty list.", approved: true, ...over,
});
const tool = async (fb: ReturnType<typeof createFeedback>, args: Partial<FeedbackInput>, link = "anna") => {
  const r = await fb.send(link, input(args));
  return { isError: !!r.isError, text: (r.content as { text: string }[])[0]!.text, data: r.structuredContent as any };
};

describe("similarity", () => {
  test("the same case worded differently scores at least 0.6", () => {
    const a = { title: "Padel search returns no courts", text: "Asked for padel courts Saturday afternoon, find_activity_slots returned no courts at all." };
    const b = { title: "feedback: Padel search gives no courts Saturday", text: "What happened: asked for padel courts on Saturday afternoon and find_activity_slots returned no courts." };
    expect(similarity(a, b)).toBeGreaterThanOrEqual(0.6);
  });
  test("an unrelated case scores below 0.35", () => {
    const a = { title: "Padel search returns no courts", text: "Asked for padel courts Saturday afternoon, find_activity_slots returned no courts at all." };
    const c = { title: "feedback: Show jazz concerts by venue", text: "It would help to group the event list by venue when browsing concerts." };
    expect(similarity(a, c)).toBeLessThan(0.35);
  });
  test("is symmetric, 1 for equal sets and 0 for disjoint ones; stopwords, case and punctuation do not count", () => {
    const x = { title: "Alpha beta", text: "gamma" };
    expect(similarity(x, x)).toBe(1);
    expect(similarity(x, { title: "delta", text: "epsilon" })).toBe(0);
    expect(similarity(x, { title: "the ALPHA, beta!", text: "og gamma." })).toBe(1);
    expect(similarity(x, { title: "alpha", text: "zeta" })).toBe(similarity({ title: "alpha", text: "zeta" }, x));
  });
  test("a title word counts double", () => {
    expect(tokens("Det er en Bane, og the court!")).toEqual(new Set(["bane", "court"]));
    // shared word in the title on both sides weighs 2 of a union of 2+1+... : closer than a body-only match
    const inTitle = similarity({ title: "padel", text: "x1" }, { title: "padel", text: "y1" });
    const inBody = similarity({ title: "k1", text: "padel x1" }, { title: "k2", text: "padel y1" });
    expect(inTitle).toBeGreaterThan(inBody);
  });
});

describe("guardText", () => {
  test("refuses e-mail, phone numbers, tokens, /mcp/ URLs and the server's own address", () => {
    expect(guardText("x", "write to anna@example.com")).toContain("e-mail");
    for (const p of ["call 12345678", "call 12 34 56 78", "call +45 12-34-56-78", "+4512345678"]) expect(guardText("x", p)).toContain("phone");
    expect(guardText("x", "key 0123456789abcdef0123456789abcdef")).toContain("token");
    expect(guardText("x", "key AbCdEfGhIjKlMnOpQrStUvWxYz_-123456")).toContain("token");
    expect(guardText("x", "see https://cph.example.com/mcp/abc")).toContain("/mcp/");
    expect(guardText("x", "see https://cph.example.com/other", { linkBase: "https://cph.example.com/" })).toContain("own address");
  });
  test("lets ordinary text through, dates and times included", () => {
    expect(guardText("x", "Saturday 2026-11-28 at 18:30, 4 players, 300 kr, find_activity_slots returned []")).toBeUndefined();
  });
});

describe("create", () => {
  test("files a feedback issue with title, labels and body; the link name and the secret never appear", async () => {
    const { gh, created } = fakeGitHub();
    const fb = createFeedback({ github: gh, now: () => T0, version: "9.9.9" });
    const r = await tool(fb, { expected: "A list of free courts.", tool: "find_activity_slots" }, "secretname");
    expect(r.isError).toBe(false);
    expect(r.data).toEqual({ action: "created", issueUrl: "https://github.test/201", number: 201 });
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe("feedback: Padel search returns no courts");
    expect(created[0]!.labels).toEqual(["feedback", "bug"]);
    expect(created[0]!.body).toContain("## What happened\nAsked for padel");
    expect(created[0]!.body).toContain("## What I expected\nA list of free courts.");
    expect(created[0]!.body).toContain("## Tool\nfind_activity_slots");
    expect(created[0]!.body).toContain("Sent from the MCP server, version 9.9.9, 2026-11-21T10:00:00Z");
    expect(JSON.stringify(created)).not.toContain("secretname");
  });
  test("an idea or something missing gets the enhancement label; the optional sections are left out", async () => {
    const { gh, created } = fakeGitHub();
    const fb = createFeedback({ github: gh, now: () => T0, version: "1" });
    await tool(fb, { kind: "idea", title: "Group events by venue", what_happened: "I would like the list grouped by venue." });
    await tool(fb, { kind: "missing", title: "Cinema listings", what_happened: "There is no source for cinema showings at all." });
    expect(created.map((c) => c.labels)).toEqual([["feedback", "enhancement"], ["feedback", "enhancement"]]);
    expect(created[0]!.body).not.toContain("## What I expected");
    expect(created[0]!.body).not.toContain("## Tool");
    expect(issueBody(input(), "1", "t")).toContain("---");
  });
  test("a guard hit is an error with a corrective message and files nothing", async () => {
    const { gh, created } = fakeGitHub();
    const fb = createFeedback({ github: gh, now: () => T0 });
    for (const bad of ["mail me at a@b.dk", "ring 12345678", "token 0123456789abcdef0123456789abcdef", "https://x.test/mcp/SECRET"]) {
      const r = await tool(fb, { what_happened: `It failed. ${bad}` });
      expect(r.isError).toBe(true);
      expect(r.text).toContain("what_happened");
    }
    expect((await tool(fb, { title: "mail a@b.dk" })).isError).toBe(true);
    expect((await tool(fb, { expected: "ring 12345678" })).isError).toBe(true);
    expect(created).toEqual([]);
  });
  test("with no token it is an error that says so, and logs the issue it would file", async () => {
    const logs: string[] = [];
    const fb = createFeedback({ github: null, now: () => T0, log: (e, f) => logs.push(e + JSON.stringify(f)) });
    const r = await tool(fb, {});
    expect(r.isError).toBe(true);
    expect(r.text).toContain("feedback is not set up on this server yet");
    expect(logs.join("")).toContain("feedback_would_file");
    expect(logs.join("")).toContain("feedback: Padel search returns no courts");
  });
  test("a GitHub failure is a tool error, and its message is logged without the report's text", async () => {
    const { gh } = fakeGitHub([], { failWith: "GitHub GET /repos/x/issues answered 502" });
    const logs: string[] = [];
    const fb = createFeedback({ github: gh, now: () => T0, log: (e, f) => logs.push(e + JSON.stringify(f)) });
    const r = await tool(fb, {});
    expect(r.isError).toBe(true);
    expect(logs.join("")).toContain("502");
    expect(logs.join("")).not.toContain("Padel");
    expect(logs.join("")).not.toContain("empty list");
  });
  test("the same title (any case) from the same link within 24 hours is refused; another link or the next day is not", async () => {
    const { gh, created } = fakeGitHub();
    let t = T0;
    const fb = createFeedback({ github: gh, now: () => t });
    expect((await tool(fb, {})).isError).toBe(false);
    const again = await tool(fb, { title: "PADEL SEARCH RETURNS NO COURTS", what_happened: "Something else entirely happened here." });
    expect(again.isError).toBe(true);
    expect(again.text).toContain("already sent");
    expect(created).toHaveLength(1);
    t += 25 * 3600_000;
    expect((await tool(fb, {}, "peter")).isError).toBe(false);
  });
  test("5 issues per link per 24 hours and 20 a day overall; refused calls consume nothing", async () => {
    const { gh, created } = fakeGitHub();
    let t = T0;
    const fb = createFeedback({ github: gh, now: () => t });
    const send = (n: number, link: string) => tool(fb, { title: `Unique topic number ${n}`, what_happened: `Entirely distinct words ${"abcdefghij"[n % 10]}${n} zq${n} wx${n}.` }, link);
    for (let n = 0; n < 5; n++) expect((await send(n, "anna")).isError).toBe(false);
    const sixth = await send(5, "anna");
    expect(sixth.isError).toBe(true);
    expect(sixth.text).toContain("limit");
    expect(created).toHaveLength(5);
    // Other links fill the day: 15 more succeed, the 21st is refused; anna's refused call took nothing.
    for (let n = 0; n < 15; n++) expect((await send(100 + n, `link${Math.floor(n / 5)}`)).isError).toBe(false);
    const over = await send(300, "late");
    expect(over.isError).toBe(true);
    expect(over.text).toContain("whole server");
    expect(created).toHaveLength(20);
    t += 25 * 3600_000;
    expect((await send(400, "anna")).isError).toBe(false);
  });
});

describe("duplicates", () => {
  const same = { title: "feedback: Padel search gives no courts Saturday", body: "## What happened\nasked for padel courts on Saturday afternoon and find_activity_slots returned no courts at all\n\n---\nSent from the MCP server, version 1, 2026-11-20T10:00:00Z" };
  const brief = { title: "Padel search returns no courts", what_happened: "Asked for padel courts Saturday afternoon, find_activity_slots returned no courts at all." };

  test("a strong match on an open issue comments and creates nothing; the link name stays out", async () => {
    const { gh, created, comments } = fakeGitHub([same]);
    const fb = createFeedback({ github: gh, now: () => T0, version: "2" });
    const r = await tool(fb, { ...brief, expected: "Free courts.", tool: "find_activity_slots" }, "secretname");
    expect(r.data).toMatchObject({ action: "commented", issueUrl: "https://github.test/100", number: 100 });
    expect(created).toEqual([]);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toContain("## Seen again");
    expect(comments[0]!.body).toContain("## What I expected\nFree courts.");
    expect(comments[0]!.body).toContain("## Tool\nfind_activity_slots");
    expect(comments[0]!.body).toContain("version 2, 2026-11-21T10:00:00Z");
    expect(comments[0]!.body).not.toContain("secretname");
  });
  test("one comment per link per issue per 24 hours, then already_noted; another link may comment", async () => {
    const { gh, comments } = fakeGitHub([same]);
    let t = T0;
    const fb = createFeedback({ github: gh, now: () => t });
    expect((await tool(fb, brief)).data.action).toBe("commented");
    const again = await tool(fb, { ...brief, title: "Padel search returns no courts again" });
    expect(again.data).toEqual({ action: "already_noted", issueUrl: "https://github.test/100", number: 100 });
    expect(comments).toHaveLength(1);
    expect((await tool(fb, brief, "peter")).data.action).toBe("commented");
    t += 25 * 3600_000;
    expect((await tool(fb, { ...brief, title: "Padel search returns no courts later" })).data.action).toBe("commented");
  });
  test("a medium match returns up to 3 candidates and files nothing; existing_issue then comments", async () => {
    const medium = { title: "feedback: Padel courts missing", body: "## What happened\nSaturday padel list was empty for me, other sports fine and weather fine too" };
    const { gh, created, comments } = fakeGitHub([medium, { ...medium, title: "feedback: Padel courts missing again" }, { ...medium, title: "feedback: Padel courts vanish" }, { ...medium, title: "feedback: Padel courts gone" }]);
    const fb = createFeedback({ github: gh, now: () => T0 });
    const args = { title: "Padel courts missing Saturday", what_happened: "Asked for padel Saturday afternoon, got nothing back from the tool, weather was fine." };
    const sim = similarity({ title: args.title, text: args.what_happened }, { title: medium.title, text: medium.body });
    expect(sim).toBeGreaterThanOrEqual(0.35);
    expect(sim).toBeLessThan(0.6);
    const r = await tool(fb, args);
    expect(r.isError).toBe(false);
    expect(r.data.action).toBe("possible_duplicate");
    expect(r.data.candidates.length).toBeLessThanOrEqual(3);
    expect(r.data.candidates[0]).toMatchObject({ state: "open", url: expect.stringContaining("github.test") });
    expect(r.text).toContain("existing_issue");
    expect(r.text).toContain("force_new");
    expect(created).toEqual([]);
    const n = r.data.candidates[0].number;
    const c = await tool(fb, { ...args, existing_issue: n });
    expect(c.data).toMatchObject({ action: "commented", number: n });
    expect(comments.map((x) => x.number)).toEqual([n]);
    expect(created).toEqual([]);
  });
  test("force_new files a new issue without looking", async () => {
    const { gh, created } = fakeGitHub([same]);
    const fb = createFeedback({ github: gh, now: () => T0 });
    const r = await tool(fb, { ...brief, force_new: true });
    expect(r.data.action).toBe("created");
    expect(created).toHaveLength(1);
  });
  test("a match with a closed issue is a possible_duplicate that says it was closed recently, never a silent comment", async () => {
    const { gh, created, comments } = fakeGitHub([{ ...same, state: "closed", closedAt: "2026-11-10T08:00:00Z" }]);
    const fb = createFeedback({ github: gh, now: () => T0 });
    const r = await tool(fb, brief);
    expect(r.data.action).toBe("possible_duplicate");
    expect(r.data.candidates[0]).toMatchObject({ state: "closed", closedAt: "2026-11-10T08:00:00Z" });
    expect(r.text).toContain("closed 2026-11-10");
    expect(r.text).toContain("new issue");
    expect(created.length + comments.length).toBe(0);
    // The user may still add a comment to the closed one, since it was offered.
    expect((await tool(fb, { ...brief, existing_issue: 100 })).data.action).toBe("commented");
  });
  test("existing_issue must be an offered candidate or an open issue; a closed one never offered is a tool error", async () => {
    const { gh, comments } = fakeGitHub([{ title: "feedback: Something else", body: "unrelated words" }, { title: "feedback: Old", body: "old", state: "closed", closedAt: "2026-11-15T00:00:00Z" }]);
    const fb = createFeedback({ github: gh, now: () => T0 });
    expect((await tool(fb, { existing_issue: 999 })).isError).toBe(true);
    expect((await tool(fb, { existing_issue: 101 })).isError).toBe(true);
    expect((await tool(fb, { existing_issue: 100 })).data.action).toBe("commented"); // open
    expect(comments.map((c) => c.number)).toEqual([100]);
  });
  test("an offered candidate expires after an hour", async () => {
    const closed = { ...same, state: "closed" as const, closedAt: "2026-11-10T08:00:00Z" };
    const { gh } = fakeGitHub([closed]);
    let t = T0;
    const fb = createFeedback({ github: gh, now: () => t });
    await tool(fb, brief);
    t += 61 * 60_000;
    expect((await tool(fb, { ...brief, existing_issue: 100 })).isError).toBe(true);
  });
  test("no match creates the issue", async () => {
    const { gh, created } = fakeGitHub([{ title: "feedback: Jazz by venue", body: "group concerts by venue please" }]);
    const fb = createFeedback({ github: gh, now: () => T0 });
    expect((await tool(fb, brief)).data.action).toBe("created");
    expect(created).toHaveLength(1);
  });
});

describe("the tool over MCP", () => {
  test("is listed with the new annotations and input rules; approved must be true", async () => {
    const { gh, created } = fakeGitHub();
    const { client, call } = await connectTools(fakeDeps(), { feedback: createFeedback({ github: gh, now: () => T0, version: "1" }) });
    const t = (await client.listTools()).tools.find((x) => x.name === "send_feedback")!;
    expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
    expect(t.description).toContain("PUBLIC");
    expect(t.description).toContain("possible_duplicate");
    const base = { kind: "bug", title: "Padel search returns no courts", what_happened: "Asked for padel on Saturday, got an empty list." };
    expect((await call("send_feedback", base)).isError).toBe(true);
    expect((await call("send_feedback", { ...base, approved: false })).isError).toBe(true);
    expect((await call("send_feedback", { ...base, approved: true, tool: "nope" })).isError).toBe(true);
    expect((await call("send_feedback", { ...base, title: "ab", approved: true })).isError).toBe(true);
    expect(created).toEqual([]);
    const r = await call("send_feedback", { ...base, approved: true });
    expect(r.isError).toBe(false);
    expect(r.data).toEqual({ action: "created", issueUrl: "https://github.test/201", number: 201 });
    expect(JSON.parse(r.text)).toEqual(r.data);
  });
  test("without a configured server it says feedback is not set up", async () => {
    const { call } = await connectTools(fakeDeps());
    const r = await call("send_feedback", { kind: "bug", title: "Something broke", what_happened: "It returned nothing at all.", approved: true });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("not set up");
  });
});
