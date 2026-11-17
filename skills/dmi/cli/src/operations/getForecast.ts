// From captures/forecast/GET-NinJo2DmiDk-ninjo2dmidk.shape.json (GET /NinJo2DmiDk/ninjo2dmidk).
// The page sends cmd, id, stations and datatype; the CLI sends only cmd=llj and id (a GeoNames id,
// Copenhagen is 2618425). `NinJo2DmiDk` is a constant path segment (the Capture redacted it to :id).
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /NinJo2DmiDk/ninjo2dmidk",
  effect: "read",
  rest: { method: "GET", path: "/NinJo2DmiDk/ninjo2dmidk", query: (v) => ({ cmd: v.cmd, id: v.id }) },
  variables: z.object({
    cmd: z.literal("llj"),
    id: z.string().regex(/^\d+$/),
  }),
  response: z.object({
    city: z.string(),
    timezone: z.string().nullish(),
    sunrise: z.string().nullish(),
    sunset: z.string().nullish(),
    // About 10 days: 1-hour steps first, then 3 and 6 hours.
    timeserie: z.array(
      z.object({
        time: z.string() /* YYYYMMDDHHMMSS, UTC */,
        localTimeIso: z.string() /* Copenhagen time, YYYY-MM-DDTHH:MM:SS+HH:MM */,
        temp: z.number().nullish(),
        symbol: z.number().nullish(),
        precip1: z.number().nullish(),
        precip3: z.number().nullish(),
        precip6: z.number().nullish(),
        precipType: z.string().nullish(),
        windSpeed: z.number().nullish() /* m/s */,
        windGust: z.number().nullish(),
        prec90: z.number().nullish(),
      }),
    ),
    aggData: z.array(
      z.object({
        localTimeIso: z.string(),
        minTemp: z.number().nullish(),
        meanTemp: z.number().nullish(),
        maxTemp: z.number().nullish(),
        precipSum: z.number().nullish(),
      }),
    ),
  }),
  needs: { cmd: { value: "llj" }, id: { value: "2618425" } },
});
