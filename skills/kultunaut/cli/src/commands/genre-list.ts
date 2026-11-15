import { z } from "zod";
import { defineCommand } from "../runtime/command";
import listEvents from "../operations/listEvents";

export default defineCommand({
  name: "genre list",
  summary: "The genres KultuNaut sorts events into, for `event list --genre`",
  args: z.object({}),
  uses: [listEvents],
  run: async (_args, { call }) => {
    const page = await call(listEvents, { Area: "Kbh. og Frederiksberg", startnr: "1" });
    return { genres: page.genres.filter((g) => g.trim() !== "") };
  },
});
