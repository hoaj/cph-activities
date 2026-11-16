// From captures/source-list/GET-kilder.html.shape.json (GET /kilder.html): the page that lists every source with its address.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /kilder.html",
  effect: "read",
  rest: { method: "GET", path: "/kilder.html" },
  variables: z.object({}),
  html: {
    fields: {
      sources: {
        each: "a.source-card",
        in: "div#sources-grid",
        fields: {
          href: { css: ":scope", attr: "href" },
          name: "div.source-card-name",
          addr: "div.source-card-addr",
        },
      },
    },
  },
  response: z.object({
    sources: z.array(
      z.object({
        href: z.string().min(1),
        name: z.string().min(1),
        addr: z.string().nullable(),
      }),
    ),
  }),
});
