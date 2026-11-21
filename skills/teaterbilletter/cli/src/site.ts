// The site this CLI skill wraps. Written by add-skill, then edited by the agent from the Capture.
// auth "login": keep `login`, delete `bootstrap`. auth "none": keep `bootstrap` only if the
// public API needs a cookie or token first, and delete `login`. Never store personal data.
// The site's own JSON API serves the productions: no sign-in and no bootstrap.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "teaterbilletter",
  repo: "hoaj/cph-activities",
  version: "0.16.1",
  generatedWith: "0.16.0",
  // The apex answers; www redirects every request to it, which the runtime reads as Drift.
  origin: "https://teaterbilletter.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says: what the maintainer decided
  // it must never do (place an order, pay, delete the account). { method?, path, why } or
  // { graphql, why }; see the generator's reference/contracts.md.
  never: [
    { method: "POST", path: "/*", why: "Buying tickets, favourites and newsletters are the user's own, on the site" },
    { method: "PUT", path: "/*", why: "Buying tickets, favourites and newsletters are the user's own, on the site" },
    { method: "PATCH", path: "/*", why: "Buying tickets, favourites and newsletters are the user's own, on the site" },
    { method: "DELETE", path: "/*", why: "Buying tickets, favourites and newsletters are the user's own, on the site" },
  ],
  accounts: async () => [],
});
