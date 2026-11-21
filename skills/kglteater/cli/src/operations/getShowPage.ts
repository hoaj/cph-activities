// From captures/show-details/GET-ballet-id-id.shape.json: a production's public page, with its price range and age.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";
import { showPathParts } from "../lib/shows";

export default defineOperation({
  name: "GET /:section/:season/:slug/",
  effect: "read",
  rest: { method: "GET", path: "/:section/:season/:slug/" },
  html: {
    fields: {
      // On both of the site's page templates (a production, and an event such as a guided tour).
      page: { css: '[data-testid="show-page"]', attr: "data-testid" },
      priceText: '[data-testid="show-page-production-price-value"]',
      ageText: '[data-testid="show-page-min-age"]',
    },
  },
  variables: z.object({ section: z.string().min(1), season: z.string().min(1), slug: z.string().min(1) }),
  response: z.object({ page: z.string().min(1), priceText: z.string().nullable(), ageText: z.string().nullable() }),
  needs: {
    section: { from: "GET /api/calendar/activities", pick: (r: { items: { showUrl: string }[] }) => r.items.map((i) => showPathParts(i.showUrl)).find(Boolean)?.section },
    season: { from: "GET /api/calendar/activities", pick: (r: { items: { showUrl: string }[] }) => r.items.map((i) => showPathParts(i.showUrl)).find(Boolean)?.season },
    slug: { from: "GET /api/calendar/activities", pick: (r: { items: { showUrl: string }[] }) => r.items.map((i) => showPathParts(i.showUrl)).find(Boolean)?.slug },
  },
});
