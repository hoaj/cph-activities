// The site this CLI skill wraps. Written by add-skill, then edited by the agent from the Capture.
//
// wannasport.com's pages ask a public JSON API on wsapi.wannasport.com, with no sign-in. Every
// call carries the same four constant headers (captures/slot-search: country, currency,
// x-ws-client, accept-language), so bootstrap returns them; no request is needed to get them.
// Booking links point at the product pages on www.wannasport.com (lib/links.ts).
import { defineSite, type Auth } from "./runtime/site";

export default defineSite({
  plugin: "cph-activities",
  skill: "wannasport",
  repo: "hoaj/cph-activities",
  version: "0.8.0",
  generatedWith: "0.12.1",
  origin: "https://wsapi.wannasport.com",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  bootstrap: async () => ({
    headers: {
      country: "dnk",
      currency: "DKK",
      "x-ws-client": "web",
      "accept-language": "da",
      accept: "application/json",
    },
  }),
  readOnlyRequests: [],
});
