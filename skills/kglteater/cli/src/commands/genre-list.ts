import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listFilters from "../operations/listFilters";
import { isGuidedTour } from "../lib/shows";

export default defineCommand({
  name: "genre list",
  summary: "The genres Det Kongelige Teater files its calendar under, for `show list --genre`",
  args: z.object({}),
  uses: [listFilters],
  run: async (_args, { call }) => {
    const { genres } = await call(listFilters, {});
    return { genres: genres.map((g) => ({ name: g.name, inDefaultList: !isGuidedTour(g.name) })) };
  },
});
