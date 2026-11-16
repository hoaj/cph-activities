import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const skills = join(import.meta.dir, "..", "skills");
const guide = readFileSync(join(skills, "cph-activities", "SKILL.md"), "utf8");
const cliSkills = readdirSync(skills, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(skills, d.name, "cli")))
  .map((d) => d.name);

describe("guide skill", () => {
  test("there are CLI skills to check", () => {
    expect(cliSkills.length).toBeGreaterThan(0);
  });
  for (const name of cliSkills) {
    test(`names a command of ${name}`, () => {
      expect(guide).toContain(`\`${name} `);
    });
  }
});
