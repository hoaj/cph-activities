// From captures/market-list/GET-eventkalender.shape.json: the Danish event calendar, server-rendered.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineOperation({
  name: "GET /eventkalender",
  effect: "read",
  rest: {
    method: "GET",
    path: "/eventkalender",
    query: (v) => ({
      "categories[]": v.categories,
      "dates[min]": v.from,
      "dates[max]": v.to,
      page: v.page,
    }),
  },
  html: {
    fields: {
      cards: {
        each: "li.card-grid-item--wrapper",
        // On every page, also when a search has no results (div.view-empty inside it instead of the cards).
        in: "div.view-events-list",
        fields: {
          id: { css: "div.card-grid-item", attr: "data-node-id" },
          href: { css: "a", attr: "href" },
          place: "div.field--name-contact",
          title: "h3.title",
        },
      },
      resume: "div.search-resume",
    },
  },
  variables: z.object({
    categories: z.array(z.string().regex(/^\d+$/)).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.string().regex(/^\d+$/).optional(),
  }),
  response: z.object({
    cards: z.array(
      z.object({
        id: z.string().min(1),
        href: z.string().min(1),
        place: z.string().nullable(),
        title: z.string().min(1),
      }),
    ),
    resume: z.string().nullable(),
  }),
  // No required variables, so no needs: check reads the default page.
});
