// From captures/slot-search/GET-api-public-Categories-populated.shape.json (GET /api/public/Categories/populated).
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /api/public/Categories/populated",
  effect: "read",
  rest: { method: "GET", path: "/api/public/Categories/populated" },
  variables: z.object({}),
  response: z.array(z.object({ name: z.string(), slug: z.string() })),
});
