import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listEvents from "../operations/listEvents";
import { filtersOf } from "../lib/filters";

export default defineCommand({
  name: "filter list",
  summary: "The categories, audiences (groups) and districts `event list` can filter on, with their ids",
  args: z.object({}),
  uses: [listEvents],
  run: async (_args, { call }) => filtersOf(await call(listEvents, {})),
});
