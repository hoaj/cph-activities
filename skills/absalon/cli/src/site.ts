// The site this CLI skill wraps. Written by add-skill, then edited by the agent from the Capture.
// auth "login": keep `login`, delete `bootstrap`. auth "none": keep `bootstrap` only if the
// public API needs a cookie or token first, and delete `login`. Never store personal data.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "absalon",
  repo: "hoaj/cph-activities",
  version: "0.16.2",
  generatedWith: "0.16.0",
  origin: "https://absaloncph.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // When the site refuses plain fetch but answers a browser (a 403 or a challenge page where the
  // Capture saw JSON), send every request from a Chrome tab on the site instead. Slower: Chrome
  // starts once per run. browserWindow: true when it also refuses headless Chrome.
  // transport: "browser",
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says: what the maintainer decided
  // it must never do (place an order, pay, delete the account). { method?, path, why } or
  // { graphql, why }; see the generator's reference/contracts.md.
  // The calendar page carries every occurrence in one inline script (hoaj/site-cli-creator#112), so one GET answers every command.
  never: [
    { method: "POST", path: "/*", why: "Signing up, buying tickets or booking at Absalon is the user's own, on the site" },
    { method: "PUT", path: "/*", why: "Signing up, buying tickets or booking at Absalon is the user's own, on the site" },
    { method: "PATCH", path: "/*", why: "Signing up, buying tickets or booking at Absalon is the user's own, on the site" },
    { method: "DELETE", path: "/*", why: "Signing up, buying tickets or booking at Absalon is the user's own, on the site" },
  ],
  accounts: async () => [],
});
