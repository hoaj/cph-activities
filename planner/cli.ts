#!/usr/bin/env bun
/**
 * Reads a Brief as JSON on stdin and prints planOuting's result as JSON on stdout.
 *
 *   echo '{"people":[{"age":31}],"mood":["active"]}' | bun planner/cli.ts
 *   bun planner/cli.ts --snapshot planner/fixtures/snapshot.json < brief.json   # offline, recorded data
 *
 * Without --snapshot it fetches the brief's day live (every source, in this process). A brief that needs
 * input is answered before anything is fetched. Source failures go to stderr; stdout stays one document.
 * Exit codes: 0 answered (ok or needs_input), 2 a brief that is not JSON.
 */
import { readFileSync } from "node:fs";
import { loadDays } from "./days";
import { needsInput, planOuting } from "./plan";
import type { Brief, PlannerDays } from "./types";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export async function main(argv: string[], stdin: string): Promise<{ stdout: string; stderr: string; code: number }> {
  let brief: Brief;
  try {
    brief = JSON.parse(stdin);
    if (!brief || typeof brief !== "object" || Array.isArray(brief)) throw new Error("not an object");
  } catch (e) {
    return { stdout: "", stderr: `stdin must be one Brief as JSON (${(e as Error).message})\n`, code: 2 };
  }
  const ask = needsInput(brief);
  if (ask) return { stdout: JSON.stringify(ask, null, 2) + "\n", stderr: "", code: 0 };

  const snap = argv.indexOf("--snapshot");
  const stateRoot = argv.indexOf("--state-root");
  let days: PlannerDays;
  let stderr = "";
  if (snap >= 0) {
    days = JSON.parse(readFileSync(argv[snap + 1]!, "utf8"));
  } else {
    const date = brief.date ?? today();
    const loaded = await loadDays([date], { deps: { stateRoot: stateRoot >= 0 ? argv[stateRoot + 1] : undefined } });
    days = loaded.days;
    for (const f of loaded.fetches) for (const e of f.errors) stderr += `${f.source}: ${e.kind} (${e.command}): ${e.message}${e.fingerprint ? ` [${e.fingerprint}]` : ""}\n`;
  }
  return { stdout: JSON.stringify(planOuting(brief, days), null, 2) + "\n", stderr, code: 0 };
}

if (import.meta.main) {
  const r = await main(process.argv.slice(2), await Bun.stdin.text());
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.stdout) process.stdout.write(r.stdout);
  process.exit(r.code);
}
