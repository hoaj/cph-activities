import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listCalendar from "../operations/listCalendar";
import { categoryCounts } from "../lib/events";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });

export default defineCommand({
  name: "category list",
  summary: "Absalon's event categories with the number of occurrences from today on",
  args: z.object({}),
  uses: [listCalendar],
  run: async (_args, { call }) => {
    const { events } = await call(listCalendar, {});
    return { categories: categoryCounts(events, today()) };
  },
});
