// The site this CLI skill wraps. Public, no sign-in.
import { defineSite, type Auth } from "./runtime/site";

const WRITES = "Buying tickets, signing up and the newsletter are the user's own, on the site";
const SIGN_IN = "Signing in is the user's own, on the site";

export default defineSite({
  plugin: "cph-activities",
  skill: "culturebox",
  repo: "hoaj/cph-activities",
  version: "0.19.2",
  generatedWith: "0.23.0",
  origin: "https://culture-box.com",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // Whether the plugin repo's daily drift check (.github/workflows/drift-check.yml) runs this skill's read-only `check`. add-skill
  // asks; false keeps the skill out of it (a site that must not see traffic from CI, a short-lived sign-in).
  dailyCheck: false,
  // When the site refuses plain fetch but answers a browser (a 403 or a challenge page where the
  // Capture saw JSON), send every request from a Chrome tab on the site instead. Slower: Chrome
  // starts once per run. browserWindow: true when it also refuses headless Chrome.
  // headers: { "x-requested-with": "XMLHttpRequest" }, // sent with every request to the origin, for a site that refuses plain fetch without them
  // transport: "browser",
  // Server-rendered WordPress pages, read through HTML Operations (operations/); no cookie or token needed.
  bootstrap: async () => ({ headers: {} }),
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says: what the maintainer decided
  // it must never do (place an order, pay, delete the account). { method?, path, why } or
  // { graphql, why }; see the generator's reference/contracts.md.
  never: [
    { method: "POST", path: "/*", why: WRITES },
    { method: "PUT", path: "/*", why: WRITES },
    { method: "PATCH", path: "/*", why: WRITES },
    { method: "DELETE", path: "/*", why: WRITES },
    { path: "/wp-login*", why: SIGN_IN },
    { path: "/wp-admin*", why: SIGN_IN },
  ],
  accounts: async () => [],
});
