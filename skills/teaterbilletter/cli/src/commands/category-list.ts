import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listCategories from "../operations/listCategories";

export default defineCommand({
  name: "category list",
  summary: "The theatre categories teaterbilletter.dk files productions under, for `show list --category`",
  args: z.object({}),
  uses: [listCategories],
  run: async (_args, { call }) => {
    const r = await call(listCategories, {});
    return { categories: r.eventCategories.map((c) => ({ name: c.name, label: c.label ?? null })) };
  },
});
