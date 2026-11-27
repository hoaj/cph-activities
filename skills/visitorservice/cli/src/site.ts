// The site this CLI skill wraps. Public, no sign-in.
import { defineSite, type Auth } from "./runtime/site";

const WRITES = "Signing up, buying or writing to the event calendar is the user's own, on the site";

export default defineSite({
  plugin: "cph-activities",
  skill: "visitorservice",
  repo: "hoaj/cph-activities",
  version: "0.17.7",
  generatedWith: "0.12.1",
  origin: "https://visitorservice.kk.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // Whether the plugin repo's daily drift check (.github/workflows/drift-check.yml) runs this skill's read-only `check`.
  dailyCheck: false,
  // Server-rendered Drupal pages, read through HTML Operations (operations/); no cookie or token needed.
  bootstrap: async () => ({ headers: {} }),
  // Non-GET requests the pages send that change no data, so check --writes lets them through.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says (the plugin never books, buys, signs up or changes anything).
  never: [
    { method: "POST", path: "/*", why: WRITES },
    { method: "PUT", path: "/*", why: WRITES },
    { method: "PATCH", path: "/*", why: WRITES },
    { method: "DELETE", path: "/*", why: WRITES },
  ],
  accounts: async () => [],
});
