// The site this CLI skill wraps. Public, no sign-in.
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "kultunaut",
  repo: "hoaj/cph-activities",
  version: "0.19.4",
  generatedWith: "0.23.0",
  origin: "https://www.kultunaut.dk",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  // The page is server-rendered ISO-8859-1 HTML, read through an HTML Operation (operations/listEvents.ts);
  // runtime/call.ts (decodeBody) decodes the encoding.
  bootstrap: async () => ({ headers: {} }),
  // Non-GET requests the pages send that change no data (token refresh, post-login), so
  // check --writes lets them through; every other non-GET is aborted while a trigger runs.
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says (the plugin never books, buys, signs up or changes anything).
  never: [
    { method: "POST", path: "/*", why: "Liking, rating (POST /nautlog) or submitting events is the user's own, on the site" },
    { method: "PUT", path: "/*", why: "Liking, rating (POST /nautlog) or submitting events is the user's own, on the site" },
    { method: "PATCH", path: "/*", why: "Liking, rating (POST /nautlog) or submitting events is the user's own, on the site" },
    { method: "DELETE", path: "/*", why: "Liking, rating (POST /nautlog) or submitting events is the user's own, on the site" },
  ],
  accounts: async () => [],
});
