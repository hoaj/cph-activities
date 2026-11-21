// From captures/event-list/GET-events.shape.json: the events page itself, server-rendered. One load
// carries every coming night with its whole text, so the command reads no event page.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";
import { toRow } from "../lib/events";

// Each field may be missing on one odd card: such a card is counted as unreadable, never a failed list.
const card = z.object({
  href: z.string().nullable(),
  title: z.string().nullable(),
  calendarLink: z.string().nullable(),
  dates: z.array(z.string().nullable()),
  clocks: z.array(z.string().nullable()),
  lines: z.array(z.string()),
  links: z.array(z.string().nullable()),
});

export default defineOperation({
  name: "GET /events",
  effect: "read",
  rest: { method: "GET", path: "/events" },
  html: {
    fields: {
      cards: {
        each: "article.eventlist-event",
        in: ".sqs-events-collection-list",
        fields: {
          href: { css: "a.eventlist-title-link", attr: "href" },
          title: "a.eventlist-title-link",
          calendarLink: { css: "a.eventlist-meta-export-google", attr: "href" },
          dates: { css: "time.event-date", attr: "datetime", all: true },
          clocks: { css: ".eventlist-meta-time time", all: true },
          lines: { css: ".eventlist-description", lines: true },
          links: { css: ".eventlist-description a", attr: "href", all: true },
        },
      },
    },
  },
  variables: z.object({}),
  response: z.object({ cards: z.array(card) }).superRefine((page, ctx) => {
    // The page always shows its latest past nights too, so no readable card at all is a changed layout.
    if (!page.cards.some((c) => toRow(c) !== null)) {
      ctx.addIssue({ code: "custom", path: ["cards"], message: "no card on the events page has a title, a link and a date" });
    }
  }),
});
