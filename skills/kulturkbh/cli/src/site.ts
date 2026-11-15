// The site this CLI skill wraps. Written by add-skill, then edited by the agent from the Capture.
// auth "login": keep `login`, delete `bootstrap`. auth "none": keep `bootstrap` only if the
// public API needs a cookie or token first, and delete `login`. Never store personal data.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "kulturkbh",
  repo: "hoaj/cph-activities",
  version: "0.6.0",
  generatedWith: "0.12.1",
  origin: "https://kulturkbh.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  login: {
    startUrl: "https://kulturkbh.dk/",
    hosts: [],
    tokenRequest: "/api/",
    // When a signed-out request gets 200 or 404 instead of 401/403 (the site serves it as an
    // anonymous user), set this to a GET path that answers 2xx only while signed in, such as
    // /api/me: the CLI asks it once per run, so an expired sign-in is exit 4, not Drift.
    // sessionProbe: "/api/me",
    timeoutMs: 600_000,
    postLogin: async () => ({}),
  },
  bootstrap: async () => ({ headers: {} }),
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  accounts: async () => [],
});
