// From captures/show-list/teaterbilletter.dk-GET-api-events.shape.json (GET /api/events).
// The site's own JSON API: one page of productions, each with its scheduled shows. There is no date
// filter. pageSize 50 works; 100 answers 503.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

const show = z.object({
  dateTime: z.string(), // local Copenhagen time without a zone, 2026-11-20T19:30:00
  type: z.string().nullish(), // Almindelig åben, Premiere, Forpremiere, Lukket forestilling
  stageName: z.string().nullish(),
});

const item = z.object({
  eventNo: z.number(),
  title: z.string(),
  slug: z.string(),
  categoryName: z.string().nullish(),
  subCategoryName: z.string().nullish(),
  mappedCategoryNames: z.array(z.string()).nullish(), // the names /api/categories lists
  ageFrom: z.number().nullish(),
  ticketPriceMin: z.number().nullish(),
  ticketPriceMax: z.number().nullish(),
  ticketOperator: z.object({ url: z.string().nullish() }).nullish(),
  venue: z
    .object({
      name: z.string().nullish(),
      street: z.string().nullish(),
      number: z.string().nullish(),
      postCode: z.string().nullish(),
      city: z.string().nullish(),
      municipality: z.string().nullish(),
    })
    .nullish(),
  scheduledShows: z.array(show).nullish(),
});

export default defineOperation({
  name: "GET /api/events",
  effect: "read",
  rest: {
    method: "GET",
    path: "/api/events",
    query: (v) => ({ page: v.page, pageSize: v.pageSize }),
  },
  variables: z.object({
    page: z.string().regex(/^\d+$/),
    pageSize: z.string().regex(/^\d+$/),
  }),
  response: z.object({
    pagination: z.object({ pageCount: z.number() }),
    items: z.array(item),
  }),
  needs: {
    page: { value: "1" },
    pageSize: { value: "50" },
  },
});
