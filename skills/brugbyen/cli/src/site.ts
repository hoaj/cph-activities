// The site this CLI skill wraps. brugbyen.kk.dk is Københavns Kommune's own events calendar: public,
// no sign-in, and server-rendered HTML (Drupal), read through an HTML Operation. Never store personal data.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "brugbyen",
  repo: "hoaj/cph-activities",
  version: "0.15.0",
  generatedWith: "0.16.0",
  origin: "https://brugbyen.kk.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says (the plugin never books, buys, signs up or changes anything).
  never: [
    { method: "POST", path: "/*", why: "Signing up, booking or writing to a culture house's calendar is the user's own, on the site" },
    { method: "PUT", path: "/*", why: "Signing up, booking or writing to a culture house's calendar is the user's own, on the site" },
    { method: "PATCH", path: "/*", why: "Signing up, booking or writing to a culture house's calendar is the user's own, on the site" },
    { method: "DELETE", path: "/*", why: "Signing up, booking or writing to a culture house's calendar is the user's own, on the site" },
  ],
  accounts: async () => [],
});
