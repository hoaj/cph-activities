import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assemble } from "../../planner/days";
import type { DayFetch } from "../../planner/fetch-day";
import type { Audience, Forecast, Item, Source } from "../../planner/types";
import { SOURCES } from "../../planner/types";
import type { DayStatus } from "../src/cache";
import type { ToolDeps } from "../src/common";
import type { DayLoader } from "../src/days";
import { ItemIndex } from "../src/item-index";
import type { OptionsLoader } from "../src/options";
import type { Feedback } from "../src/feedback";
import { slidingLimiter } from "../src/limits";
import { registerTools } from "../src/tools";

export const DATE = "2026-11-28";
export const TODAY = "2026-11-21";
let n = 0;
/** A bare Item; override what a test cares about. */
export function item(over: Partial<Item> = {}): Item {
  n++;
  return {
    id: `t:${n}`, source: "kultunaut", kind: "event", title: `Titel ${n}`, date: DATE, time: "14:00", endTime: null, venue: `Sted ${n}`,
    address: null, area: "cph", priceText: null, priceMin: null, priceMax: null, free: null, ageFrom: null, audience: [], categories: [],
    indoor: null, url: `https://example.test/${n}`, extra: {}, ...over,
  };
}
export const forecast = (outdoor: "dry" | "showers" | "wet", extra: Partial<Forecast["verdict"]> = {}): Forecast => ({
  verdict: { outdoor, ...extra }, day: { minTemp: 8, maxTemp: 12 }, text: "Tekst", warnings: [],
  hours: ["10:00", "12:00", "18:00", "20:00"].map((time) => ({ time, temp: 9, description: "skyet", precipMm: 0 })),
});

export interface FakeOptions {
  items?: Item[];
  weather?: Forecast | null;
  /** Per source: the status the fake cache reports. A `missing` source returns no rows. */
  statuses?: Partial<Record<Source, Partial<DayStatus>>>;
}

/** A DayLoader answering from a list of items, with a log of what was asked. */
export function fakeCache(o: FakeOptions = {}) {
  const calls: { sources: readonly Source[]; dates: string[]; audience?: Audience }[] = [];
  const weather = o.weather === undefined ? forecast("dry") : o.weather;
  const cache: DayLoader = {
    async getDays(sources, dates, opts = {}) {
      calls.push({ sources, dates, ...(opts.audience ? { audience: opts.audience } : {}) });
      const statuses: DayStatus[] = [];
      const fetches: DayFetch[] = [];
      for (const date of dates) {
        for (const source of sources) {
          const st = o.statuses?.[source];
          const gone = st?.status === "missing";
          fetches.push({
            source, date, ok: !gone, errors: [], rawCount: 0, calls: 1,
            items: gone || source === "dmi" ? [] : (o.items ?? []).filter((i) => i.source === source && i.date === date),
            ...(source === "dmi" && weather && !gone ? { weather: { day: weather, evening: weather } } : {}),
          });
          statuses.push({ source, date, status: "fresh", ageSeconds: 0, stale: false, ...st } as DayStatus);
        }
      }
      return { days: assemble(dates, fetches), fetches, statuses };
    },
  };
  return { cache, calls };
}

export const fakeOptions = (): OptionsLoader => async () => ({
  data: {
    sports: ["padel"], audiences: ["børn", "unge", "voksne"], moods: ["active"],
    brugbyen: { categories: ["Musik"], districts: ["Vesterbro"], groups: ["Børn"] }, kultunaut: { genres: ["Jazz"] },
    categories: [{ name: "Jazz", sources: ["kultunaut"] }, { name: "Musik", sources: ["brugbyen"] }],
  },
  sources: [{ source: "brugbyen", status: "fresh" }, { source: "kultunaut", status: "fresh" }],
});

export function fakeDeps(o: FakeOptions = {}): ToolDeps & { calls: ReturnType<typeof fakeCache>["calls"] } {
  const { cache, calls } = fakeCache(o);
  return { cache, calls, index: new ItemIndex(), options: fakeOptions(), today: () => TODAY };
}

/** A client wired in memory to a server with the seven tools. */
export async function connectTools(deps: ToolDeps, opts: { perHour?: number; feedback?: Feedback; log?: (evt: string, f?: Record<string, unknown>) => void } = {}) {
  const server = new McpServer({ name: "t", version: "1" });
  registerTools(server, { link: "anna", limiter: slidingLimiter({ perHour: opts.perHour ?? 1000, perDay: 10000 }), deps, ...(opts.feedback ? { feedback: opts.feedback } : {}), ...(opts.log ? { log: opts.log } : {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "c", version: "1" });
  await client.connect(b);
  return {
    client,
    /** Calls a tool; returns the result with its structured content parsed. */
    async call(name: string, args: Record<string, unknown> = {}) {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as { text: string }[])[0]!.text;
      return { isError: !!r.isError, text, data: r.isError ? undefined : (r.structuredContent as any), raw: r };
    },
  };
}
export const ALL_SOURCES = SOURCES;
