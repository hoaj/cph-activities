import { describe, expect, test } from "bun:test";
import { areaAt, inCopenhagen } from "../src/lib/cph-boundary";

// [lng, lat] of places whose municipality is not in doubt, well away from any border.
const inside: Array<[string, number, number]> = [
  ["Rådhuspladsen", 12.5683, 55.6761],
  ["Valby", 12.505, 55.662],
  ["Nordhavn", 12.6, 55.71],
  ["Brønshøj", 12.49, 55.705],
  ["Islands Brygge", 12.576, 55.663],
  ["Amagerbrogade", 12.605, 55.662],
  ["Ørestad", 12.58, 55.63],
  ["Refshaleøen", 12.611, 55.693],
  ["Frederiksberg Rådhus", 12.5326, 55.6786],
  ["Frederiksberg Have", 12.527, 55.674],
  ["Forum", 12.5525, 55.6818],
];
const outside: Array<[string, number, number]> = [
  ["Gentofte", 12.552, 55.75],
  ["Hvidovre", 12.474, 55.642],
  ["Rødovre", 12.453, 55.68],
  ["Taastrup", 12.3, 55.65],
  ["Kastrup", 12.645, 55.635],
];

describe("Københavns Kommune boundary", () => {
  for (const [name, lng, lat] of inside) test(`${name} is cph`, () => {
    expect(inCopenhagen(lng, lat)).toBe(true);
    expect(areaAt(lng, lat)).toBe("cph");
  });
  for (const [name, lng, lat] of outside) test(`${name} is outside`, () => {
    expect(inCopenhagen(lng, lat)).toBe(false);
    expect(areaAt(lng, lat)).toBe("outside");
  });
  test("a point just off the coast is unknown, not outside", () => {
    expect(areaAt(12.637, 55.66)).toBe("unknown"); // 63 m off Amager Øst's shoreline
  });
});
