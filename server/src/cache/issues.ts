// One GitHub issue per Drift Fingerprint. The filer is an interface: tests use a fake, a server without
// GITHUB_TOKEN only logs the issue it would file. Issue text holds shapes only (the Fingerprint, the
// source, the skill version, the time), never a value from the site: there is no field to carry one.
import type { Log } from "../log";

export interface DriftReport {
  /** `plugin:skill:operation:class:path:code`. */
  fingerprint: string;
  source: string;
  skillVersion: string;
  /** ISO time of this occurrence. */
  at: string;
}

export type FileResult = "created" | "commented" | "skipped" | "logged";

export interface IssueFiler {
  /** Files the report: a new issue, a comment (at most one a day) on the open one, or nothing. Never throws. */
  file(report: DriftReport): Promise<FileResult>;
}

export const issueBody = (r: DriftReport) =>
  [
    `Fingerprint: \`${r.fingerprint}\``,
    `Source: ${r.source}`,
    `Skill version: ${r.skillVersion}`,
    `Seen: ${r.at}`,
    "",
    "Filed by the server's cache when a source's response no longer matched its Contract. The server serves the last good day as stale until this is fixed (site-cli-creator `fix` mode).",
  ].join("\n");

const MARKER = "<!-- cph-drift -->";
export const commentBody = (r: DriftReport) => `${MARKER}\nStill drifting. Seen: ${r.at} (skill version ${r.skillVersion}).`;

/** Logs what it would file. For a server without GITHUB_TOKEN. */
export function loggingFiler(log: Log): IssueFiler {
  return {
    async file(r) {
      log("drift_issue_would_file", { title: r.fingerprint, labels: ["drift"], body: issueBody(r) });
      return "logged";
    },
  };
}

/** One authenticated call to the GitHub REST API. An error names the method, path and status, never the body. */
export function githubApi(o: { token: string; fetch?: typeof fetch }) {
  const f = o.fetch ?? fetch;
  return async (method: string, path: string, body?: unknown): Promise<any> => {
    const res = await f(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${o.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "cph-activities-server",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path.split("?")[0]} answered ${res.status}`);
    return res.json();
  };
}

export interface GitHubFilerOptions {
  token: string;
  /** Default hoaj/cph-activities. */
  repo?: string;
  fetch?: typeof fetch;
  log?: Log;
  now?: () => number;
}

/** REST API filer: a token with issues scope only. Finds an open `drift` issue with the exact title; else creates one. */
export function githubFiler(o: GitHubFilerOptions): IssueFiler {
  const repo = o.repo ?? "hoaj/cph-activities";
  const now = o.now ?? Date.now;
  const log: Log = o.log ?? (() => {});
  const api = githubApi({ token: o.token, fetch: o.fetch });

  /** Open issues labelled drift, listed (not searched: the search index lags a new issue, which would allow a duplicate). */
  const findOpen = async (title: string) => {
    for (let page = 1; page <= 5; page++) {
      const list = await api("GET", `/repos/${repo}/issues?state=open&labels=drift&per_page=100&page=${page}`);
      const hit = list.find((i: any) => !i.pull_request && i.title === title);
      if (hit) return hit;
      if (list.length < 100) return undefined;
    }
    return undefined;
  };

  return {
    async file(r) {
      try {
        const open = await findOpen(r.fingerprint);
        if (!open) {
          const made = await api("POST", `/repos/${repo}/issues`, { title: r.fingerprint, body: issueBody(r), labels: ["drift"] });
          log("drift_issue_created", { issue: made.number, title: r.fingerprint });
          return "created";
        }
        const since = new Date(now() - 24 * 3600_000).toISOString();
        if (Date.parse(open.created_at) > now() - 24 * 3600_000) return "skipped";
        const comments = await api("GET", `/repos/${repo}/issues/${open.number}/comments?since=${encodeURIComponent(since)}&per_page=100`);
        if (comments.some((c: any) => String(c.body).startsWith(MARKER))) return "skipped";
        await api("POST", `/repos/${repo}/issues/${open.number}/comments`, { body: commentBody(r) });
        log("drift_issue_commented", { issue: open.number, title: r.fingerprint });
        return "commented";
      } catch (e) {
        log("drift_issue_failed", { title: r.fingerprint, message: (e as Error).message });
        return "skipped";
      }
    },
  };
}

/** GITHUB_TOKEN set: the REST filer; otherwise the logging one. */
export function filerFromEnv(env: Record<string, string | undefined>, log: Log, f?: typeof fetch): IssueFiler {
  const token = env.GITHUB_TOKEN?.trim();
  return token ? githubFiler({ token, log, fetch: f, ...(env.GITHUB_REPO ? { repo: env.GITHUB_REPO } : {}) }) : loggingFiler(log);
}

/** An issue as the feedback tool sees it. */
export interface IssueRef {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "open" | "closed";
  closedAt?: string;
}

/** What send_feedback needs from GitHub: list, create, comment. Tests use a fake. */
export interface FeedbackGitHub {
  /** Open issues labelled feedback, bug or enhancement, and `feedback` issues closed within `closedWithinDays`. Listed, not searched (the search index lags). */
  listCandidates(closedWithinDays: number): Promise<IssueRef[]>;
  createIssue(i: { title: string; body: string; labels: string[] }): Promise<{ number: number; url: string }>;
  comment(number: number, body: string): Promise<{ url: string }>;
}

export function githubFeedback(o: { token: string; repo?: string; fetch?: typeof fetch; now?: () => number }): FeedbackGitHub {
  const repo = o.repo ?? "hoaj/cph-activities";
  const now = o.now ?? Date.now;
  const api = githubApi({ token: o.token, fetch: o.fetch });
  const list = async (query: string): Promise<any[]> => {
    const out: any[] = [];
    for (let page = 1; page <= 3; page++) {
      const rows: any[] = await api("GET", `/repos/${repo}/issues?${query}&per_page=100&page=${page}`);
      out.push(...rows.filter((i) => !i.pull_request));
      if (rows.length < 100) break;
    }
    return out;
  };
  const ref = (i: any): IssueRef => ({ number: i.number, title: String(i.title), body: String(i.body ?? ""), url: i.html_url, state: i.state === "closed" ? "closed" : "open", ...(i.closed_at ? { closedAt: i.closed_at } : {}) });
  return {
    async listCandidates(days) {
      const cutoff = now() - days * 86400_000;
      const since = new Date(cutoff).toISOString();
      const [a, b, c, closed] = await Promise.all([
        list("state=open&labels=feedback"),
        list("state=open&labels=bug"),
        list("state=open&labels=enhancement"),
        list(`state=closed&labels=feedback&since=${encodeURIComponent(since)}`),
      ]);
      const seen = new Map<number, IssueRef>();
      for (const i of [...a, ...b, ...c]) seen.set(i.number, ref(i));
      for (const i of closed) if (i.closed_at && Date.parse(i.closed_at) >= cutoff) seen.set(i.number, ref(i));
      return [...seen.values()];
    },
    async createIssue(i) {
      const made = await api("POST", `/repos/${repo}/issues`, i);
      return { number: made.number, url: made.html_url };
    },
    async comment(number, body) {
      const made = await api("POST", `/repos/${repo}/issues/${number}/comments`, { body });
      return { url: made.html_url };
    },
  };
}

/** GITHUB_TOKEN set: the REST client; otherwise null (the tool then says feedback is not set up). */
export function feedbackGitHubFromEnv(env: Record<string, string | undefined>, f?: typeof fetch): FeedbackGitHub | null {
  const token = env.GITHUB_TOKEN?.trim();
  return token ? githubFeedback({ token, fetch: f, ...(env.GITHUB_REPO ? { repo: env.GITHUB_REPO } : {}) }) : null;
}
