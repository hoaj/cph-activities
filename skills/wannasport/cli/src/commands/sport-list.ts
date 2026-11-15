import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listCategories from "../operations/listCategories";

export default defineCommand({
  name: "sport list",
  summary: "The sports wannasport lists, with the slug `slot search --sport` takes",
  args: z.object({}),
  uses: [listCategories],
  run: async (_args, { call }) => {
    const sports = (await call(listCategories, {})).map((c) => ({ name: c.name, slug: c.slug }));
    return { sports };
  },
});
