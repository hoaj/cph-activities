// Billetto's never list refuses everything that writes to the search index, and still lets the search through.
import { describe, expect, test } from "bun:test";
import { forbiddenRequest } from "../src/runtime/never";
import site from "../src/site";

const at = (method: string, path: string) => forbiddenRequest(site, { method, url: site.origin + path });

describe("billetto never list", () => {
  test("the search stays allowed", () => {
    expect(at("POST", "/1/indexes/events/query")).toBeUndefined();
    expect(at("POST", "/1/indexes/*/queries")).toBeUndefined();
    expect(at("GET", "/1/indexes/events")).toBeUndefined();
  });
  test.each([
    ["POST", "/1/indexes/events/batch"],
    ["POST", "/1/indexes/events/deleteByQuery"],
    ["POST", "/1/indexes/events/clear"],
    ["POST", "/1/indexes/events/operation"],
    ["PUT", "/1/indexes/events/obj1"],
    ["PATCH", "/1/indexes/events/obj1"],
    ["DELETE", "/1/indexes/events"],
  ])("%s %s is refused", (method, path) => {
    expect(at(method, path)).toBeDefined();
  });
});
