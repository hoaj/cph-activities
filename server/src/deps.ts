// Builds the tools' shared dependencies from the environment: one DayCache (settings from the env, Drift
// issues filed with GITHUB_TOKEN), one item index, one option-list loader.
import { DayCache, cacheOptionsFromEnv, filerFromEnv } from "./cache";
import type { ToolDeps } from "./common";
import { createDescriptionLoader } from "./details";
import { ItemIndex } from "./item-index";
import type { Log } from "./log";
import { createOptionsLoader } from "./options";

export function createToolDeps(env: Record<string, string | undefined>, log: Log): ToolDeps & { cache: DayCache } {
  const o = cacheOptionsFromEnv(env);
  const cache = new DayCache({
    ...o,
    filer: filerFromEnv(env, log),
    log,
    // Each skill keeps its state under a writable folder of its own (the image runs as a non-root user).
    fetchDeps: { stateRoot: env.CPH_STATE_ROOT || "/tmp/cph-state" },
  });
  const stateRoot = env.CPH_STATE_ROOT || "/tmp/cph-state";
  return { cache, index: new ItemIndex(), options: createOptionsLoader({ counter: cache.counter, stateRoot }), descriptions: createDescriptionLoader({ counter: cache.counter, stateRoot }) };
}
