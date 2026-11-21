// From captures/market-list/GET-id.shape.json: a market page directly under the site's root.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";
import { marketPageHtml, marketPageResponse } from "../lib/market-page";
import { slugOf } from "../lib/markets";

export default defineOperation({
  name: "GET /:slug",
  effect: "read",
  rest: { method: "GET", path: "/:slug" },
  html: marketPageHtml,
  variables: z.object({ slug: z.string().min(1) }),
  response: marketPageResponse,
  needs: {
    slug: {
      from: "GET /eventkalender",
      pick: (r: { cards: { href: string }[] }) => r.cards.map((c) => slugOf(c.href)).find((s) => s && !s.nested)?.slug,
    },
  },
});
