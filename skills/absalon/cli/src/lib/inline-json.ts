// Reads a JS array literal that a page assigns in an inline script (`recurringEvents = [ … ];`)
// when the script as a whole is no JSON, so the HTML field `json: true` cannot parse it (hoaj/site-cli-creator#112).

/** The array assigned to `name` in `script`, parsed as JSON; null when absent, no array or not JSON. */
export function extractJsArray(script: string, name: string): unknown[] | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w$])${escaped}\\s*=\\s*\\[`, "g");
  for (let m = re.exec(script); m; m = re.exec(script)) {
    const start = m.index + m[0].length - 1;
    const end = matchingBracket(script, start);
    if (end < 0) continue;
    try {
      const value = JSON.parse(script.slice(start, end + 1));
      if (Array.isArray(value)) return value;
    } catch {
      /* not JSON: try the next assignment */
    }
  }
  return null;
}

/** Index of the `]` closing the `[` at `start`, skipping JSON strings; -1 when it never closes. */
function matchingBracket(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i;
  }
  return -1;
}
