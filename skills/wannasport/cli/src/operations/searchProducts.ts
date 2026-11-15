// From captures/slot-search/GET-api-public-Product-search.shape.json (GET /api/public/Product/search).
// The page sends: area (a city slug), category (a sport slug from Categories/populated),
// distance in metres, date as that day's midnight in ISO UTC, time "0" (any time) and page from 1.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

const product = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  category: z.string().nullish(),
  type: z.string().nullish(),
  showProductLink: z.boolean().nullish(),
  availabilityType: z.string().nullish(),
  availabilityMessage: z.string().nullish(),
  timeSpans: z.array(z.object({ time: z.string() /* ISO date-time string */ })).nullish(),
  rangePriceMin: z.number().nullish(),
  rangePriceMax: z.number().nullish(),
});

export default defineOperation({
  name: "GET /api/public/Product/search",
  effect: "read",
  rest: {
    method: "GET",
    path: "/api/public/Product/search",
    query: (v) => ({ area: v.area, category: v.category, distance: v.distance, date: v.date, time: v.time, page: v.page }),
  },
  variables: z.object({
    area: z.string().min(1),
    category: z.string().min(1),
    distance: z.string().regex(/^\d+$/),
    date: z.string() /* ISO date-time string */,
    time: z.string(),
    page: z.string().regex(/^\d+$/),
  }),
  response: z.object({
    page: z.number(),
    totalPages: z.number(),
    isLast: z.boolean(),
    facilities: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        distance: z.number().nullish(),
        coordinates: z.object({ lat: z.number(), lng: z.number() }).nullish(),
        productGroups: z.array(z.object({ groupName: z.string().nullish(), products: z.array(product) })),
      }),
    ),
  }),
  needs: {
    area: { value: "koebenhavn" },
    category: { value: "padel" },
    distance: { value: "10000" },
    date: { value: "2030-01-01T00:00:00.000Z" },
    time: { value: "0" },
    page: { value: "1" },
  },
});
