// What the two market page Operations share: a market's page has one layout under either URL form.
import { z } from "zod";

export const marketPageHtml = {
  fields: {
    event: { css: 'script[type="application/ld+json"]', json: true },
    // The page's own calendar: every coming open day with its hours. The schema.org schedule can be stale.
    settings: { css: 'script[data-drupal-selector="drupal-settings-json"]', json: true },
    // The contact box with the address; the page's footer has another, so stay inside #places.
    contactName: "#places h2.kk-contact__name",
    street: "#places .kk-contact__line1",
    postcode: "#places .kk-contact__postal",
    district: ".field--name-district",
    teaser: ".field--name-teaser",
    body: ".field--name-body",
  },
} as const;

const schedule = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish(),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
});

const event = z.object({
  name: z.string().min(1),
  // A list with one entry per open day, or one entry for a whole period.
  eventSchedule: z.union([z.array(schedule), schedule]).nullish(),
  isAccessibleForFree: z.union([z.string(), z.boolean()]).nullish(),
});

const occurrence = z.object({ date: z.object({ hour_start: z.string().nullish(), hour_end: z.string().nullish() }) });

// PHP writes an empty map as []: a market with one long period has no occurrences.
const calendarEntry = z.object({
  // One price text, one per kind of guest, or false when the page shows none.
  event_defaults: z.object({ price_value: z.union([z.string(), z.array(z.string()), z.boolean()]).nullish() }).nullish(),
  event_occurrences: z.union([z.record(z.string(), z.array(occurrence)), z.array(z.unknown())]).nullish(),
});

const settings = z.object({ eventCalendar: z.record(z.string(), calendarEntry).nullish() });

/** The page's schema.org block is a graph; the market is its Event node. */
const eventNode = (v: unknown): unknown => {
  const graph = (v as { "@graph"?: unknown } | null)?.["@graph"];
  const nodes: unknown[] = Array.isArray(graph) ? graph : [v];
  return nodes.find((n) => (n as { "@type"?: unknown } | null)?.["@type"] === "Event") ?? v;
};

export const marketPageResponse = z.object({
  event: z.preprocess(eventNode, event),
  settings,
  contactName: z.string().nullable(),
  street: z.string().nullable(),
  postcode: z.string().nullable(),
  district: z.string().nullable(),
  teaser: z.string().nullable(),
  body: z.string().nullable(),
});

export type MarketPage = z.infer<typeof marketPageResponse>;
