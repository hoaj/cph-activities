// From captures/market-list/GET-eventkalender-id.shape.json: a market page under /eventkalender/.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";
import { marketPageHtml, marketPageResponse } from "../lib/market-page";
import { slugOf } from "../lib/markets";

export default defineOperation({
  name: "GET /eventkalender/:slug",
  effect: "read",
  rest: { method: "GET", path: "/eventkalender/:slug" },
  html: marketPageHtml,
  variables: z.object({ slug: z.string().min(1) }),
  response: marketPageResponse,
  needs: {
    slug: {
      from: "GET /eventkalender",
      pick: (r: { cards: { href: string }[] }) => r.cards.map((c) => slugOf(c.href)).find((s) => s?.nested)?.slug,
    },
  },
});
