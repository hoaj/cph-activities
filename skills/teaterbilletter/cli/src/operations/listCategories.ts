// From captures/show-list/teaterbilletter.dk-GET-api-categories.shape.json (GET /api/categories).
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /api/categories",
  effect: "read",
  rest: { method: "GET", path: "/api/categories" },
  variables: z.object({}),
  response: z.object({
    eventCategories: z.array(z.object({ id: z.number(), name: z.string(), label: z.string().nullish() })),
  }),
});
