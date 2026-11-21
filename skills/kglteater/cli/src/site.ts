// The site this CLI skill wraps. Written by add-skill, then edited by the agent from the Capture.
// auth "login": keep `login`, delete `bootstrap`. auth "none": keep `bootstrap` only if the
// public API needs a cookie or token first, and delete `login`. Never store personal data.
// The calendar JSON and the public show pages need no sign-in and no bootstrap.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "kglteater",
  repo: "hoaj/cph-activities",
  version: "0.17.3",
  generatedWith: "0.12.1",
  origin: "https://www.kglteater.dk",
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
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says: what the maintainer decided
  // it must never do (place an order, pay, delete the account). { method?, path, why } or
  // { graphql, why }; see the generator's reference/contracts.md.
  never: [
    { method: "POST", path: "/*", why: "Buying tickets, signing in, favourites and newsletters are the user's own, on the site" },
    { method: "PUT", path: "/*", why: "Buying tickets, signing in, favourites and newsletters are the user's own, on the site" },
    { method: "PATCH", path: "/*", why: "Buying tickets, signing in, favourites and newsletters are the user's own, on the site" },
    { method: "DELETE", path: "/*", why: "Buying tickets, signing in, favourites and newsletters are the user's own, on the site" },
    { path: "/da/buyingflow*", why: "The ticket checkout is the user's own, on the site" },
    { path: "/da/login*", why: "Signing in is the user's own, on the site" },
    { path: "/tixly-callback*", why: "Signing in is the user's own, on the site" },
  ],
  accounts: async () => [],
});
