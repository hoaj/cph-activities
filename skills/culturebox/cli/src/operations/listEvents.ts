// From captures/event-list/GET-events.shape.json: the calendar page carries every coming night.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /events/",
  effect: "read",
  rest: { method: "GET", path: "/events/" },
  html: {
    fields: {
      cards: {
        each: "article.post-block",
        in: ".post-list",
        fields: {
          heading: "h2.post-block__title",
          link: { css: 'a[href*="/event/"]', attr: "href" },
          // `in: ":scope"`: a card with no lineup block is an odd card, never a changed layout.
          rooms: {
            each: ".post-block__content__block",
            in: ":scope",
            fields: {
              name: "h3",
              lines: { css: ":scope", lines: true },
              heading: "strong:not(:has(a))",
            },
          },
          facts: { css: ".post-block__footer__aside li", all: true },
        },
      },
      older: { css: ".post-pagniation-links__older a", attr: "href" },
      eventLinks: { css: 'main a[href*="/event/"]', attr: "href", all: true },
    },
  },
  variables: z.object({}),
  response: z.object({
    cards: z.array(
      z.object({
        heading: z.string().nullable(),
        link: z.string().nullable(),
        rooms: z.array(z.object({ name: z.string().nullable(), lines: z.array(z.string()), heading: z.string().nullable() })),
        facts: z.array(z.string().nullable()),
      }),
    ),
    older: z.string().nullable(),
    eventLinks: z.array(z.string().nullable()),
  }),
});
