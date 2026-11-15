// From captures/event-list/GET-events-list.json.shape.json (GET /events-list.json).
// The front page fetches this file with a cache-busting `v` (the time in ms); so do we.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /events-list.json",
  effect: "read",
  rest: { method: "GET", path: "/events-list.json", query: (v) => ({ v: v.v }) },
  variables: z.object({ v: z.string().min(1) }),
  response: z.array(
    z.object({
      date: z.string() /* ISO date string */,
      t: z.string().nullish(),
      type: z.string(),
      src: z.string(),
      url: z.string(),
      title: z.string(),
      desc: z.string().nullish(),
      addr: z.string().nullish(),
      price: z.string().nullish(),
      location: z.string().nullish(),
    }),
  ),
  needs: { v: { value: "1" } },
});
