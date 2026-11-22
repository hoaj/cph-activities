import { z } from "zod";
import { defineCommand, inputFailure } from "../runtime/command";
import getEvent from "../operations/getEvent";
import site from "../site";
import { describe, eventSlug } from "../lib/description";

export default defineCommand({
  name: "event show",
  summary:
    "One event's description from its own page on brugbyen.kk.dk: `event list` rows carry none. Returns `{ title, url, description }`; `description` is the page's teaser (else its body) as plain text, at most 500 characters, or null when the page has no text",
  args: z.object({
    url: z.string().min(1).describe("the event's page: a `url` from `event list`, or its path /det-sker/<slug> (exactly one event, on brugbyen.kk.dk)"),
  }),
  uses: [getEvent],
  run: async (args, { call }) => {
    const slug = eventSlug(args.url);
    if (slug === null) inputFailure("--url must be an event page on brugbyen.kk.dk: /det-sker/<slug> or the full URL (take it from `event list`).");
    const page = await call(getEvent, { slug });
    return {
      title: page.title,
      url: new URL(`/det-sker/${encodeURIComponent(slug)}`, site.origin).toString(),
      description: describe(page.teaser, page.body),
    };
  },
});
