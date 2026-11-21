// From captures/genre-list/GET-kalender.shape.json: the calendar page lists its genre and stage filters.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

const option = { id: { css: ":scope", attr: "data-id" }, name: { css: ":scope", attr: "data-name" } };
const options = z.array(z.object({ id: z.string().regex(/^\d+$/), name: z.string().min(1) })).min(1);

export default defineOperation({
  name: "GET /kalender/",
  effect: "read",
  rest: { method: "GET", path: "/kalender/" },
  html: {
    fields: {
      genres: { each: "button[data-id]", in: "#filter-all-category-grid", fields: option },
      stages: { each: "button[data-id]", in: "#filter-all-location-grid", fields: option },
    },
  },
  variables: z.object({}),
  response: z.object({ genres: options, stages: options }),
});
