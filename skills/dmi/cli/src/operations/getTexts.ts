// From captures/forecast/GET-dmidk_byvejrWS-rest-texts-varsler-geonameid-id.shape.json
// (GET /dmidk_byvejrWS/rest/texts/varsler/geonameid/:id): DMI's own Danish text for today + N days
// (day0 to day5) and the warnings in force, for a GeoNames id.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

export default defineOperation({
  name: "GET /dmidk_byvejrWS/rest/texts/varsler/geonameid/:id",
  effect: "read",
  rest: { method: "GET", path: "/dmidk_byvejrWS/rest/texts/varsler/geonameid/:id" },
  variables: z.object({ id: z.string().regex(/^\d+$/) }),
  response: z.object({
    day0: z.string().nullish(),
    day1: z.string().nullish(),
    day2: z.string().nullish(),
    day3: z.string().nullish(),
    day4: z.string().nullish(),
    day5: z.string().nullish(),
    warnings: z.array(z.unknown()).nullish(),
  }),
  needs: { id: { value: "2618425" } },
});
