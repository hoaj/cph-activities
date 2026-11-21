// Shared by the tools: the dependencies they get, input pieces, and result builders. A tool result carries
// its data twice, as structuredContent and as the same compact JSON text, for clients that read only one.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { DayLoader, SourceStatus } from "./days";
import type { ItemIndex } from "./item-index";
import type { OptionsLoader } from "./options";

export interface ToolDeps {
  cache: DayLoader;
  index: ItemIndex;
  options: OptionsLoader;
  /** YYYY-MM-DD in Copenhagen. Tests fix it. */
  today?: () => string;
}

export const copenhagenToday = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

/** Bad input the model can fix: becomes a tool error result with this message. */
export class ToolInputError extends Error {}

const realDate = (s: string) => {
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const isoDate = (what: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${what} must be a date as YYYY-MM-DD, e.g. 2026-11-28`).refine(realDate, `${what} is not a real calendar date`);
export const clock = (what: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${what} must be a time as HH:MM (24 hours), e.g. 18:30`);

export const addDays = (date: string, n: number): string => new Date(new Date(date + "T12:00:00Z").getTime() + n * 86400_000).toISOString().slice(0, 10);

/** Fails with a corrective message when `date` is before today. */
export function notPast(date: string, today: string, what: string): void {
  if (date < today) throw new ToolInputError(`${what} ${date} is in the past (today is ${today}). Use today or a later date.`);
}

export const limitField = z.number().int().min(1, "limit must be at least 1").max(50, "limit is at most 50").default(10).describe("How many rows to return (default 10, at most 50)");

export const sourcesField = z
  .array(z.object({ source: z.string(), status: z.enum(["fresh", "stale", "capped", "missing"]), kind: z.string().optional(), ageMinutes: z.number().optional() }))
  .describe("One entry per source asked. fresh = current; stale or capped = older data from cache (kind says why); missing = nothing from that source.");
export const notesField = z.array(z.string()).describe("Things to tell the user: missing or stale sources, what was assumed.");

/** Drops null, undefined and empty arrays/objects from rows, so results stay compact. */
export function compact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(compact) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x == null || (Array.isArray(x) && !x.length)) continue;
      out[k] = compact(x);
    }
    return out as T;
  }
  return v;
}

export function ok(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}
/** A compacted body plus the `sources` and `notes` every result carries, kept even when empty. */
export function okWith(body: Record<string, unknown>, sources: SourceStatus[], notes: string[]): CallToolResult {
  return ok({ ...body, ...(sources.length ? { sources } : {}), notes });
}
export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export type Sourced = { sources: SourceStatus[]; notes: string[] };
