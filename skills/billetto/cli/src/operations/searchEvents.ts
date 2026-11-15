// From captures/event-search/POST-1-indexes-events-query.shape.json (POST /1/indexes/events/query).
// A search, so a read whatever its method. The page sends the body as JSON text; Algolia takes
// it as application/json too. `page` is Algolia's own paging parameter, which the page leaves out.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "POST /1/indexes/events/query",
  effect: "read",
  rest: {
    method: "POST",
    path: "/1/indexes/events/query",
    body: (v) => ({
      query: v.query,
      hitsPerPage: v.hitsPerPage,
      page: v.page,
      aroundLatLng: v.aroundLatLng,
      aroundRadius: v.aroundRadius,
      filters: v.filters,
    }),
  },
  variables: z.object({
    query: z.string(),
    hitsPerPage: z.number().int().min(1).max(1000),
    page: z.number().int().min(0),
    aroundLatLng: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
    aroundRadius: z.number().int().positive(),
    filters: z.string(),
  }),
  response: z.object({
    nbHits: z.number(),
    page: z.number(),
    nbPages: z.number(),
    hits: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        short_description: z.string().nullish(),
        url: z.string(),
        starts_at: z.string().nullish(),
        ends_at: z.string().nullish(),
        start_time: z.number().nullish(),
        end_time: z.number().nullish(),
        venue_name: z.string().nullish(),
        location: z.string().nullish(),
        city: z.string().nullish(),
        postal_code: z.union([z.number(), z.string()]).nullish(),
        _geoloc: z.object({ lat: z.number(), lng: z.number() }).nullish(),
        price: z.number().nullish(),
        price_range: z.string().nullish(),
        currency: z.string().nullish(),
        category: z.string().nullish(),
        subcategory: z.string().nullish(),
        on_sale: z.boolean().nullish(),
      }),
    ),
  }),
  needs: {
    query: { value: "" },
    hitsPerPage: { value: 1 },
    page: { value: 0 },
    aroundLatLng: { value: "55.6761,12.5683" },
    aroundRadius: { value: 10000 },
    filters: { value: "" },
  },
});
