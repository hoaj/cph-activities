// The site this CLI skill wraps.
//
// These are the JSON calls dmi.dk's own city pages make (keyless, no sign-in). DMI's open-data
// forecast API (opendataapi.dmi.dk) only reaches about 2.5 days, so the site's 10-day forecast
// (captures/forecast) is used instead.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "dmi",
  repo: "hoaj/cph-activities",
  version: "0.19.0",
  generatedWith: "0.23.0",
  origin: "https://www.dmi.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  bootstrap: async () => ({ headers: {} }),
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says.
  never: [
    { method: "POST", path: "/*", why: "DMI's site is only read: the CLI never sends a form or analytics" },
    { method: "PUT", path: "/*", why: "DMI's site is only read: the CLI never sends a form or analytics" },
    { method: "PATCH", path: "/*", why: "DMI's site is only read: the CLI never sends a form or analytics" },
    { method: "DELETE", path: "/*", why: "DMI's site is only read: the CLI never sends a form or analytics" },
  ],
});
