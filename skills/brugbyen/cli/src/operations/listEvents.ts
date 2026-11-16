// From captures/event-list/GET-det-sker.shape.json.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

const ids = z.array(z.string().regex(/^\d+$/));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineOperation({
  name: "GET /det-sker",
  effect: "read",
  rest: {
    method: "GET",
    path: "/det-sker",
    query: (v) => ({
      "dates[min]": v.from,
      "dates[max]": v.to,
      "categories[]": v.categories,
      "group[]": v.groups,
      "district[]": v.districts,
      free: v.free,
      page: v.page,
    }),
  },
  html: {
    fields: {
      events: {
        each: "li.card-grid-item--wrapper",
        // div.view-content (with the list) is absent when a search has no results, but
        // div.view-events-list is on every page.
        in: "div.view-events-list",
        fields: {
          id: { css: "div.card-grid-item", attr: "data-node-id" },
          href: { css: "a", attr: "href" },
          ribbon: "div.ribbon",
          venue: "div.field--name-contact",
          title: "h3.title",
          dateText: "div.date-text",
          dates: "span.dates",
        },
      },
      resume: "div.search-resume",
      categoryIds: { css: 'select[name="categories[]"] option', attr: "value", all: true },
      categoryNames: { css: 'select[name="categories[]"] option', all: true },
      groupIds: { css: 'select[name="group[]"] option', attr: "value", all: true },
      groupNames: { css: 'select[name="group[]"] option', all: true },
      districtIds: { css: 'select[name="district[]"] option', attr: "value", all: true },
      districtNames: { css: 'select[name="district[]"] option', all: true },
    },
  },
  variables: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    categories: ids.optional(),
    groups: ids.optional(),
    districts: ids.optional(),
    free: z.literal("1").optional(),
    page: z.string().regex(/^\d+$/).optional(),
  }),
  response: z.object({
    events: z.array(
      z.object({
        id: z.string().min(1),
        href: z.string().min(1),
        title: z.string().min(1),
        ribbon: z.string().nullable(),
        venue: z.string().nullable(),
        dateText: z.string().nullable(),
        dates: z.string().nullable(),
      }),
    ),
    resume: z.string().nullable(),
    categoryIds: z.array(z.string()),
    categoryNames: z.array(z.string()),
    groupIds: z.array(z.string()),
    groupNames: z.array(z.string()),
    districtIds: z.array(z.string()),
    districtNames: z.array(z.string()),
  }),
  // No required variables, so no needs: check reads the default page.
});
