// The site this CLI skill wraps. Written by add-skill, then edited by the agent from the Capture.
//
// Billetto's own pages render no event data: its search page asks Algolia, from the browser,
// with the search-only key the page itself uses. So the origin here is that Algolia host, and
// bootstrap opens billetto.dk in a Chrome with no profile, as any visitor's browser would, and
// reads the application id and key from the page's first Algolia request (captures/explore:
// the query string's x-algolia-api-key and x-algolia-application-id). Algolia takes the same
// values as headers. Nothing personal is involved: no account, no cookie of the user's.
import { defineSite, type Auth, type Site } from "./runtime/site";
import { closeContext, launchInMemory } from "./runtime/login";

const FRONT_PAGE = "https://billetto.dk/da";
const ALGOLIA_REQUEST = /\.algolia(net)?\.(net|com|io)\/1\/indexes\//;

const site: Site = defineSite({
  plugin: "cph-activities",
  skill: "billetto",
  repo: "hoaj/cph-activities",
  version: "0.18.0",
  generatedWith: "0.16.0",
  origin: "https://yneuy03z8q-dsn.algolia.net",
  graphqlPath: "/graphql",
  auth: "none" as Auth,
  needsChrome: false,
  bootstrap: async () => {
    const context = await launchInMemory(site, true);
    try {
      const page = await context.newPage();
      const seen = page.waitForRequest((r) => ALGOLIA_REQUEST.test(r.url()), { timeout: 45_000 });
      seen.catch(() => {}); // awaited below; keeps an early timeout from going unhandled
      // As a visitor would: open the front page, whose event lists ask Algolia as they load.
      // Typing a search is the fallback, for a front page that stops listing events itself.
      await page.goto(FRONT_PAGE, { waitUntil: "domcontentloaded" });
      const early = await Promise.race([seen, page.waitForTimeout(15_000).then(() => null)]);
      if (!early) {
        const box = page.getByRole("searchbox").first();
        await box.fill("koncert", { timeout: 10_000 }).catch(() => {});
        await box.press("Enter").catch(() => {});
      }
      const request = early ?? (await seen);
      const url = new URL(request.url());
      const headers = request.headers();
      const key = url.searchParams.get("x-algolia-api-key") ?? headers["x-algolia-api-key"];
      const app = url.searchParams.get("x-algolia-application-id") ?? headers["x-algolia-application-id"];
      if (!key || !app) throw new Error("billetto.dk's search sent no Algolia key or application id");
      if (!site.origin.startsWith(`https://${app.toLowerCase()}-dsn.`)) {
        throw new Error("billetto.dk's search now uses another Algolia application than site.ts names");
      }
      return {
        headers: {
          "x-algolia-api-key": key,
          "x-algolia-application-id": app,
          referer: "https://billetto.dk/",
          origin: "https://billetto.dk",
        },
      };
    } finally {
      await closeContext(context);
    }
  },
  readOnlyRequests: [],
  // Requests this CLI never sends, whatever a command or --confirm says (the plugin never books, buys, signs up or changes anything).
  never: [
    { method: "PUT", path: "/1/*", why: "Billetto's search index is Billetto's: the CLI only searches it" },
    { method: "PATCH", path: "/1/*", why: "Billetto's search index is Billetto's: the CLI only searches it" },
    { method: "DELETE", path: "/1/*", why: "Billetto's search index is Billetto's: the CLI only searches it" },
    { method: "POST", path: "/1/indexes/*/batch", why: "Billetto's search index is Billetto's: the CLI only searches it" },
    { method: "POST", path: "/1/indexes/*/deleteByQuery", why: "Billetto's search index is Billetto's: the CLI only searches it" },
    { method: "POST", path: "/1/indexes/*/clear", why: "Billetto's search index is Billetto's: the CLI only searches it" },
    { method: "POST", path: "/1/indexes/*/operation", why: "Billetto's search index is Billetto's: the CLI only searches it" },
  ],
});

export default site;
