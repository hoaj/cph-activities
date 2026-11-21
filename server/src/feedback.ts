// send_feedback: a bug, an idea or something missing, reported from the chat, becomes a GitHub issue on
// the repo, or a comment on an issue that already covers the case. The issue is public, so the text is
// checked for personal data and secrets before anything leaves the server, and the link's name is never
// part of it. State (limits, duplicate titles, candidates offered) is in memory, one set per process.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { FeedbackGitHub, IssueRef } from "./cache";
import { ok, toolError } from "./common";
import type { Log } from "./log";

export const FEEDBACK_TOOLS = ["plan_outing", "find_events", "find_activity_slots", "get_weather", "get_details", "list_options"] as const;

export const feedbackInput = {
  kind: z.enum(["bug", "idea", "missing"]).describe("bug = something wrong; idea = a suggestion; missing = something the tools cannot do or find"),
  title: z.string().min(3, "title needs at least 3 characters").max(80, "title is at most 80 characters").describe("A short headline, no personal details"),
  what_happened: z.string().min(10, "what_happened needs at least 10 characters").max(1500, "what_happened is at most 1500 characters").describe("What was asked, in general terms, and what came back or was missing"),
  expected: z.string().max(800, "expected is at most 800 characters").optional().describe("What the user expected instead"),
  tool: z.enum(FEEDBACK_TOOLS).optional().describe("The tool this is about"),
  approved: z.literal(true, { error: "approved must be true, and only after the user has seen the final text and said yes" }).describe("true only when the user has seen this exact text and said yes"),
  existing_issue: z.number().int().positive().optional().describe("Number of an issue returned as a candidate: adds this report to it as a comment"),
  force_new: z.boolean().optional().describe("true to file a new issue although similar ones exist, after the user said so"),
};
export const feedbackInputSchema = z.object(feedbackInput);
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export const feedbackOutput = {
  action: z.enum(["created", "commented", "already_noted", "possible_duplicate"]),
  issueUrl: z.string().optional(),
  number: z.number().optional(),
  candidates: z.array(z.object({ number: z.number(), title: z.string(), url: z.string(), state: z.enum(["open", "closed"]), closedAt: z.string().optional() })).optional(),
  message: z.string().optional(),
};

// ---- guards ------------------------------------------------------------------------------------------

export interface GuardOptions {
  /** The server's public address (PUBLIC_URL): text that holds it is refused. */
  linkBase?: string;
}

/** Returns a corrective message when `text` holds something that must not go into a public issue. */
export function guardText(field: string, text: string, o: GuardOptions = {}): string | undefined {
  const fix = "Remove it or describe it in general terms, show the user the new text and ask again.";
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return `${field} contains an e-mail address. ${fix}`;
  if (/\/mcp\//i.test(text)) return `${field} contains a link to this server (a URL with /mcp/), which is a personal secret. ${fix}`;
  if (o.linkBase && text.toLowerCase().includes(o.linkBase.toLowerCase().replace(/\/+$/, ""))) return `${field} contains this server's own address. ${fix}`;
  if (/[A-Za-z0-9_-]{32,}/.test(text)) return `${field} contains a long token-like string (32 or more letters, digits, - or _). ${fix}`;
  // ISO dates and clock times are not phone numbers.
  const bare = text.replace(/\d{4}-\d{2}-\d{2}/g, " ").replace(/\d{1,2}:\d{2}/g, " ");
  if (/(?:\d[\s-]?){8,}/.test(bare)) return `${field} contains a phone number or a long number. ${fix}`;
  return undefined;
}

// ---- scoring -----------------------------------------------------------------------------------------

const STOP = new Set(
  ("a an the and or but if of to in on at by for with from as is are was were be been it its this that these those i we you they he she me my our your their " +
    "not no do does did has have had will would can could should so than then there here what when where which who how also just very about into over after before " +
    "og eller men hvis af til i på ved for med fra som er var blev blive det den de en et jeg vi du i han hun mig min vores din jeres ikke har havde vil ville kan kunne skal skulle så end da der her hvad hvornår hvor hvilken hvem hvordan også bare meget om ind over efter før " +
    "feedback sent mcp server version happened expected tool seen again").split(" "),
);

/** Lower case, punctuation dropped, stopwords and one-letter words out. */
export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/**
 * Weighted Jaccard of two word sets, a title word counting double (the weight of a word is 2 if it is in the
 * title, else 1). 0 when nothing is shared, 1 when the sets are equal.
 */
export function similarity(a: { title: string; text: string }, b: { title: string; text: string }): number {
  const weights = (x: { title: string; text: string }) => {
    const m = new Map<string, number>();
    for (const w of tokens(x.text)) m.set(w, 1);
    for (const w of tokens(x.title)) m.set(w, 2);
    return m;
  };
  const wa = weights(a);
  const wb = weights(b);
  let inter = 0;
  let union = 0;
  for (const w of new Set([...wa.keys(), ...wb.keys()])) {
    const x = wa.get(w) ?? 0;
    const y = wb.get(w) ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union ? inter / union : 0;
}

export const STRONG = 0.6;
export const MEDIUM = 0.35;

// ---- issue text --------------------------------------------------------------------------------------

const footer = (version: string, at: string) => `Sent from the MCP server, version ${version}, ${at}`;
const sections = (i: FeedbackInput) => [
  "## What happened",
  i.what_happened.trim(),
  ...(i.expected?.trim() ? ["", "## What I expected", i.expected.trim()] : []),
  ...(i.tool ? ["", "## Tool", i.tool] : []),
];

export const issueTitle = (i: Pick<FeedbackInput, "title">) => `feedback: ${i.title.trim()}`;
export const issueLabels = (i: Pick<FeedbackInput, "kind">) => ["feedback", i.kind === "bug" ? "bug" : "enhancement"];
export const issueBody = (i: FeedbackInput, version: string, at: string) => [...sections(i), "", "---", footer(version, at)].join("\n");
export const commentBody = (i: FeedbackInput, version: string, at: string) => ["## Seen again", "", ...sections(i), "", "---", footer(version, at)].join("\n");

// ---- the service -------------------------------------------------------------------------------------

export interface FeedbackOptions {
  /** null: feedback is not set up; the tool says so and logs what it would file. */
  github: FeedbackGitHub | null;
  log?: Log;
  now?: () => number;
  /** The plugin version for the footer. */
  version?: string;
  linkBase?: string;
  perLinkPerDay?: number;
  perDay?: number;
}

export interface Feedback {
  send(link: string, input: FeedbackInput): Promise<CallToolResult>;
}

const DAY = 86400_000;
const HOUR = 3600_000;

/** The plugin's version from its manifest (the image copies it); falls back to "unknown". */
export function pluginVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function createFeedback(o: FeedbackOptions): Feedback {
  const now = o.now ?? Date.now;
  const log: Log = o.log ?? (() => {});
  const version = o.version ?? pluginVersion();
  const perLink = o.perLinkPerDay ?? 5;
  const perDay = o.perDay ?? 20;
  const writes: { link: string; t: number }[] = [];
  const titles = new Map<string, number>(); // `${link}\n${lower title}` -> time
  const noted = new Map<string, number>(); // `${link}\n${issue number}` -> time of last comment or creation
  const offered = new Map<number, number>(); // candidate number -> time offered

  const prune = () => {
    const t = now();
    while (writes.length && writes[0]!.t <= t - DAY) writes.shift();
    for (const m of [titles, noted]) for (const [k, v] of m) if (v <= t - DAY) m.delete(k);
    for (const [k, v] of offered) if (v <= t - HOUR) offered.delete(k);
  };

  const done = (data: Record<string, unknown>, text: string): CallToolResult => ({ content: [{ type: "text", text }], structuredContent: data });

  return {
    async send(link, input) {
      prune();
      const t = now();
      const at = new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
      for (const [field, text] of [["title", input.title], ["what_happened", input.what_happened], ["expected", input.expected ?? ""]] as const) {
        const bad = guardText(field, text, { linkBase: o.linkBase });
        if (bad) return toolError(bad);
      }
      const titleKey = `${link}\n${input.title.trim().toLowerCase()}`;
      if (titles.has(titleKey)) return toolError("already sent: this link reported the same title in the last 24 hours. Do not send it again.");
      if (!o.github) {
        log("feedback_would_file", { link, title: issueTitle(input), labels: issueLabels(input), body: issueBody(input, version, at) });
        return toolError("feedback is not set up on this server yet. Tell the user; nothing was sent.");
      }
      if (writes.filter((w) => w.link === link).length >= perLink) return toolError(`Feedback limit reached: at most ${perLink} reports per link per 24 hours. Tell the user to try again tomorrow.`);
      if (writes.length >= perDay) return toolError(`Feedback limit reached: at most ${perDay} reports a day for the whole server. Tell the user to try again tomorrow.`);

      const record = (number: number) => {
        writes.push({ link, t });
        titles.set(titleKey, t);
        noted.set(`${link}\n${number}`, t);
      };
      const commentOn = async (issue: { number: number; url: string }): Promise<CallToolResult> => {
        if (noted.has(`${link}\n${issue.number}`)) {
          return done({ action: "already_noted", issueUrl: issue.url, number: issue.number }, `Already noted: this link added to ${issue.url} in the last 24 hours. Nothing more was sent; tell the user.`);
        }
        const c = await o.github!.comment(issue.number, commentBody(input, version, at));
        record(issue.number);
        log("feedback_commented", { link, issue: issue.number });
        return done({ action: "commented", issueUrl: issue.url, number: issue.number }, `Added to the existing issue ${issue.url} (${c.url}). Tell the user it was already reported and this was added to it.`);
      };

      try {
        if (input.force_new) return await create();
        const all = await o.github.listCandidates(30);
        if (input.existing_issue !== undefined) {
          const n = input.existing_issue;
          const hit = all.find((i) => i.number === n);
          if (!hit || (!offered.has(n) && hit.state !== "open")) {
            return toolError(`existing_issue ${n} is not one of the candidates returned for this report, nor an open feedback, bug or enhancement issue. Call without existing_issue to look for similar issues.`);
          }
          return await commentOn(hit);
        }
        const query = { title: input.title, text: `${input.what_happened} ${input.expected ?? ""}` };
        const scored = all
          .map((i) => ({ i, score: similarity(query, { title: i.title, text: i.body.replace(/\n---\n[\s\S]*$/, "") }) }))
          .filter((x) => x.score >= MEDIUM)
          .sort((a, b) => b.score - a.score);
        const strongOpen = scored.find((x) => x.score >= STRONG && x.i.state === "open");
        if (strongOpen) return await commentOn(strongOpen.i);
        if (scored.length) {
          const candidates = scored.slice(0, 3).map(({ i }) => ({ number: i.number, title: i.title, url: i.url, state: i.state, ...(i.closedAt ? { closedAt: i.closedAt } : {}) }));
          for (const c of candidates) offered.set(c.number, t);
          const lines = candidates.map((c) => `- #${c.number} "${c.title}" (${c.state}${c.closedAt ? `, closed ${c.closedAt.slice(0, 10)}, recently, so a new issue may be right` : ""}) ${c.url}`);
          return done(
            { action: "possible_duplicate", candidates },
            `Nothing was sent. Similar issues exist:\n${lines.join("\n")}\nAsk the user whether this is the same case as one of them. If yes, call send_feedback again with the same text and existing_issue set to its number (this adds a comment; on a closed issue it reopens the discussion). If it is a new case, call again with force_new: true. Do not decide for the user.`,
          );
        }
        return await create();
      } catch (e) {
        log("feedback_failed", { link, message: String((e as Error)?.message ?? e).slice(0, 200) });
        return toolError("GitHub did not accept the feedback. Nothing was sent; tell the user it can be tried again later.");
      }

      async function create(): Promise<CallToolResult> {
        const made = await o.github!.createIssue({ title: issueTitle(input), body: issueBody(input, version, at), labels: issueLabels(input) });
        record(made.number);
        log("feedback_created", { link, issue: made.number });
        return ok({ action: "created", issueUrl: made.url, number: made.number });
      }
    },
  };
}
