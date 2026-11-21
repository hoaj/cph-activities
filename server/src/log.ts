// One JSON line per event on stderr. Whatever is written passes through redact(): a link's secret
// is never logged, whether it sits in a path, a header value or an error message.

const PATH_SECRET = /\/mcp\/[^\s"'?#\\]+/g;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+\/=-]+/gi;

export function redact(text: string): string {
  return text.replace(PATH_SECRET, "/mcp/<redacted>").replace(BEARER, "$1<redacted>");
}

export type Log = (evt: string, fields?: Record<string, unknown>) => void;

export function createLogger(write: (line: string) => void = (l) => process.stderr.write(l + "\n")): Log {
  return (evt, fields = {}) => write(redact(JSON.stringify({ t: new Date().toISOString(), evt, ...fields })));
}
