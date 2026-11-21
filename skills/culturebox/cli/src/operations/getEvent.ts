// From captures/event-list/GET-event-id.shape.json: one night's page, the only place with its ticket link.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";
import { slugOf } from "../lib/events";

export default defineOperation({
  name: "GET /event/:id/",
  effect: "read",
  rest: { method: "GET", path: "/event/:id/" },
  html: {
    fields: {
      article: { css: "article.post-block", attr: "class" },
      buttons: {
        each: ".post-block__buttons a",
        in: "main",
        fields: { label: ".post-block__button__label", href: { css: ":scope", attr: "href" } },
      },
      // Read only for a stated age limit; never printed.
      notes: ".post-block__additional-text",
    },
  },
  variables: z.object({ id: z.string().min(1) }),
  response: z.object({
    article: z.string().min(1),
    buttons: z.array(z.object({ label: z.string().nullable(), href: z.string().nullable() })),
    notes: z.string().nullable(),
  }),
  needs: {
    id: {
      from: "GET /events/",
      pick: (r: { cards: { link: string | null }[] }) => r.cards.map((c) => slugOf(c.link)).find(Boolean),
    },
  },
});
