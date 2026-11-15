// From captures/event-list/GET-perl-arrlist-type-nynaut.shape.json.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /perl/arrlist/type-nynaut",
  effect: "read",
  rest: {
    method: "GET",
    path: "/perl/arrlist/type-nynaut",
    query: (v) => ({ Area: v.Area, ArrStartdato: v.ArrStartdato, ArrSlutdato: v.ArrSlutdato, Genre: v.Genre, startnr: v.startnr }),
  },
  html: {
    fields: {
      events: {
        each: "div.product",
        // div#product-row is absent on an empty page (no events, or past the last page), so the list
        // sits in div#nautcontent, which every page has.
        in: "div#nautcontent",
        fields: {
          id: { css: ":scope", attr: "data-arrnr" },
          url: { css: "a.product-content", attr: "href" },
          genre: "span.genre_cat",
          title: "h3 strong",
          description: "div.arr-description span",
          when: "time",
          venue: "time b",
        },
      },
      genres: { css: 'select[name="Genre"] option', attr: "value", all: true },
    },
  },
  variables: z.object({
    Area: z.string().min(1),
    ArrStartdato: z.string().regex(/^\d{2}\/\d{2} \d{4}$/).optional(),
    ArrSlutdato: z.string().regex(/^\d{2}\/\d{2} \d{4}$/).optional(),
    Genre: z.string().min(1).optional(),
    startnr: z.string().regex(/^\d+$/),
  }),
  response: z.object({
    events: z.array(
      z.object({
        id: z.string().min(1),
        url: z.string().min(1),
        title: z.string().min(1),
        genre: z.string().nullable(),
        description: z.string().nullable(),
        when: z.string().nullable(),
        venue: z.string().nullable(),
      }),
    ),
    genres: z.array(z.string()),
  }),
  needs: { Area: { value: "Kbh. og Frederiksberg" }, startnr: { value: "1" } },
});
