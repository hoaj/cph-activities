import { extractHtml } from "./src/runtime/html";
const q = "dates%5Bmin%5D=2026-11-20&dates%5Bmax%5D=2026-11-20&group%5B%5D=11&group%5B%5D=12";
const t = await (await fetch("https://brugbyen.kk.dk/det-sker?" + q)).text();
const r: any = extractHtml(t, {
  events: { each: "li.card-grid-item--wrapper", in: "div.view-events-list div.view-content", fields: {
    id: { css: "div.card-grid-item", attr: "data-node-id" }, href: { css: "a", attr: "href" }, ribbon: "div.ribbon", venue: "div.field--name-contact",
    title: "div.field--name-title, span.field--name-title", dateText: "div.date-text", date: "span.date", time: "span.time", dates: "span.dates" } },
  resume: "div.search-resume", pages: { css: "nav.pager li.pager__item a", attr: "href", all: true },
} as any);
if (!r.ok) { console.log("FAIL", JSON.stringify(r)); process.exit(); }
console.log("resume:", r.value.resume, "| events on page:", r.value.events.length, "| pager:", JSON.stringify(r.value.pages));
for (const e of r.value.events.slice(0, 6)) console.log(JSON.stringify(e));
const empty = await (await fetch("https://brugbyen.kk.dk/det-sker?dates%5Bmin%5D=2026-11-20&dates%5Bmax%5D=2026-11-20&categories%5B%5D=133&group%5B%5D=10&district%5B%5D=49")).text();
const re: any = extractHtml(empty, { events: { each: "li.card-grid-item--wrapper", in: "div.view-events-list div.view-content", fields: { id: { css: "div.card-grid-item", attr: "data-node-id" } } }, resume: "div.search-resume" } as any);
console.log("empty case:", JSON.stringify(re.ok ? { n: re.value.events.length, resume: re.value.resume } : re), "has view-content:", empty.includes("view-content"), "has view-events-list:", empty.includes("view-events-list"));
