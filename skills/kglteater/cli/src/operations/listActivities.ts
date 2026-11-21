// From captures/show-list/GET-api-calendar-activities.shape.json: the calendar's own JSON, soonest first.
import { z } from "zod";
import { defineOperation } from "../runtime/operation";

const text = z.string().nullable().optional();

export default defineOperation({
  name: "GET /api/calendar/activities",
  effect: "read",
  rest: {
    method: "GET",
    path: "/api/calendar/activities",
    query: (v) => ({
      v: v.v,
      page: v.page,
      pageSize: v.pageSize,
      culture: v.culture,
      startDate: v.startDate,
      endDate: v.endDate,
      category: v.category,
      location: v.location,
      price: v.price,
      showCancelled: v.showCancelled,
    }),
  },
  variables: z.object({
    v: z.string().min(1),
    page: z.string().regex(/^\d+$/),
    pageSize: z.string().regex(/^\d+$/),
    culture: z.string().min(1),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    category: z.array(z.string()).optional(),
    location: z.array(z.string()).optional(),
    price: z.string().optional(),
    showCancelled: z.string().min(1),
  }),
  response: z.object({
    items: z.array(
      z.object({
        startDate: z.string().min(16),
        showName: z.string().min(1),
        showUrl: z.string().min(1),
        showId: z.number(),
        category: text,
        canceled: z.boolean(),
        isFree: z.boolean(),
        isTour: z.boolean(),
        minPrice: z.number().nullable().optional(),
        fullHouse: z.boolean().nullable().optional(),
        tixlySoldOut: z.boolean().nullable().optional(),
        tixlySaleStatusText: text,
        tixlyBuyLink: text,
        externalBuyLink: text,
        location: text,
        label: text,
        promotedLabel: text,
        specialMarking: text,
      }),
    ),
    hasMore: z.boolean(),
  }),
  needs: {
    v: { value: "20261012" },
    page: { value: "1" },
    pageSize: { value: "25" },
    culture: { value: "da-dk" },
    showCancelled: { value: "true" },
  },
});
