// From captures/event-show/GET-det-sker-slug.shape.json: one event's own page (Drupal, server-rendered).
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /det-sker/:slug",
  effect: "read",
  rest: { method: "GET", path: "/det-sker/:slug" },
  html: {
    fields: {
      title: "h1.page-title",
      // Both are absent on an event with no text; the page's other texts are not read.
      teaser: "div.field--name-teaser",
      body: "div.field--name-body",
    },
  },
  variables: z.object({ slug: z.string().min(1) }),
  response: z.object({
    title: z.string().min(1),
    teaser: z.string().nullable(),
    body: z.string().nullable(),
  }),
  needs: {
    slug: {
      from: "GET /det-sker",
      pick: (r: { events: { href: string }[] }) => r.events.map((e) => /^\/det-sker\/([^/?#]+)\/?$/.exec(e.href)?.[1]).find(Boolean),
    },
  },
});
