import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listFilters from "../operations/listFilters";
import { areaOf } from "../lib/shows";

export default defineCommand({
  name: "stage list",
  summary: "The stages and places Det Kongelige Teater plays at, for `show list --stage`, each with its area",
  args: z.object({}),
  uses: [listFilters],
  run: async (_args, { call }) => {
    const { stages } = await call(listFilters, {});
    return { stages: stages.map((s) => ({ name: s.name, area: areaOf(s.name, false) })) };
  },
});
