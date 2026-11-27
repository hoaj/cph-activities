// The site this CLI skill wraps. Public, no sign-in.
import { defineSite, type Auth } from "./runtime/site";

const WRITES = "Buying tickets, signing up or sending anything to Hangaren is the user's own, on the site";
const ROBOTS = "Hangaren's robots.txt disallows this part of the site";

export default defineSite({
  plugin: "cph-activities",
  skill: "hangaren",
  repo: "hoaj/cph-activities",
  version: "0.17.7",
  generatedWith: "0.12.1",
  origin: "https://www.hangaren.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // Whether the plugin repo's daily drift check (.github/workflows/drift-check.yml) runs this skill's read-only `check`.
  dailyCheck: false,
  // A server-rendered Squarespace page, read through an HTML Operation (operations/); no cookie or token needed.
  bootstrap: async () => ({ headers: {} }),
  // Non-GET requests the pages send that change no data, so check --writes lets them through.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says. The list cannot name a query
  // string, so tests/event-list.test.ts holds the rule that no request carries one (robots.txt
  // disallows the site's JSON and iCal formats).
  never: [
    { method: "POST", path: "/*", why: WRITES },
    { method: "PUT", path: "/*", why: WRITES },
    { method: "PATCH", path: "/*", why: WRITES },
    { method: "DELETE", path: "/*", why: WRITES },
    { path: "/api/*", why: ROBOTS },
    { path: "/search*", why: ROBOTS },
    { path: "/config*", why: ROBOTS },
    { path: "/account*", why: ROBOTS },
    { path: "/commerce/*", why: ROBOTS },
    { path: "/static/*", why: ROBOTS },
  ],
  accounts: async () => [],
});
