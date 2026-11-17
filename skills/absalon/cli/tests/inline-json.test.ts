import { describe, expect, test } from "bun:test";
import { extractJsArray } from "../src/lib/inline-json";

describe("extractJsArray", () => {
  test("finds the array after other let statements", () => {
    const s = `let a = {x: [9]};\nlet piecalAJAX = {url: "x"};\nrecurringEvents = [{"a":1},{"a":2}];\nlet z = 1;`;
    expect(extractJsArray(s, "recurringEvents")).toEqual([{ a: 1 }, { a: 2 }]);
  });
  test("strings with brackets and escaped quotes do not end the array", () => {
    const s = `var recurringEvents = [{"t":"a ] b [ c \\" ] d"}, "x"]; foo();`;
    expect(extractJsArray(s, "recurringEvents")).toEqual([{ t: 'a ] b [ c " ] d' }, "x"]);
  });
  test("nested arrays", () => {
    expect(extractJsArray(`recurringEvents=[[1,2],[3]];`, "recurringEvents")).toEqual([[1, 2], [3]]);
  });
  test("a missing name is null", () => {
    expect(extractJsArray(`let other = [1];`, "recurringEvents")).toBeNull();
  });
  test("broken JSON is null", () => {
    expect(extractJsArray(`recurringEvents = [{a:1}];`, "recurringEvents")).toBeNull();
    expect(extractJsArray(`recurringEvents = [1, 2`, "recurringEvents")).toBeNull();
  });
  test("a name that is only part of another variable is not matched", () => {
    expect(extractJsArray(`let notrecurringEvents = [1];`, "recurringEvents")).toBeNull();
    expect(extractJsArray(`let notrecurringEvents = [1]; recurringEvents = [2];`, "recurringEvents")).toEqual([2]);
  });
  test("a non-array value is null", () => {
    expect(extractJsArray(`recurringEvents = {"a":1};`, "recurringEvents")).toBeNull();
  });
});
