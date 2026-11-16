import { describe, expect, test } from "bun:test";
import { staticGroups } from "../src/lib/filters";

describe("staticGroups", () => {
  test("names, English aliases and ids resolve without a lookup", () => {
    expect(staticGroups(["børn"])).toEqual(["10"]);
    expect(staticGroups(["Unge", "voksne"])).toEqual(["11", "12"]);
    expect(staticGroups(["unge,voksne"])).toEqual(["11", "12"]);
    expect(staticGroups(["kids", "teens", "adults", "seniors"])).toEqual(["10", "11", "12", "13"]);
    expect(staticGroups(["13", "seniorer"])).toEqual(["13"]);
  });
  test("an unknown value needs the lookup", () => {
    expect(staticGroups(["unge", "familier"])).toBeNull();
    expect(staticGroups(["99"])).toBeNull();
  });
});
