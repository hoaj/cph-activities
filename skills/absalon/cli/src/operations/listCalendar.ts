// From captures/event-list/GET-kalender.shape.json (GET /kalender/).
// The calendar page carries every occurrence in one inline script, `recurringEvents = [ … ];`, which
// `{ css, json: true }` cannot read (the script as a whole is no JSON, hoaj/site-cli-creator#112): the
// HTML field picks the scripts' text and the response transform cuts the array out and checks it.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";
import { extractJsArray } from "../lib/inline-json";

const occurrence = z.object({
  title: z.string().min(1),
  start: z.string() /* local Copenhagen time, YYYY-MM-DDTHH:MM:SS */,
  end: z.string().nullish(),
  details: z.string().nullish(),
  permalink: z.string().min(1),
  postId: z.number(),
  classNames: z.array(z.string()).nullish(),
});

export default defineOperation({
  name: "GET /kalender/",
  effect: "read",
  rest: { method: "GET", path: "/kalender/" },
  html: { fields: { scripts: { css: "script:not([src])", all: true } } },
  variables: z.object({}),
  response: z.object({ scripts: z.array(z.string()) }).transform((v, ctx) => {
    const text = v.scripts.find((s) => s.includes("piecalAJAX")) ?? "";
    const raw = extractJsArray(text, "recurringEvents");
    if (!raw) {
      ctx.addIssue({ code: "custom", path: ["recurringEvents"], message: "the calendar's recurringEvents array is gone or no longer JSON" });
      return z.NEVER;
    }
    const parsed = z.array(occurrence).safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: ["recurringEvents", ...issue.path], message: issue.message });
      return z.NEVER;
    }
    return { events: parsed.data };
  }),
});
