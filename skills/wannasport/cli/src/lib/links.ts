// The product page on www.wannasport.com where the user picks a time and books it themselves.
export const bookingUrl = (facilitySlug: string, productSlug: string): string =>
  `https://www.wannasport.com/dnk/da/product/${encodeURIComponent(facilitySlug)}/${encodeURIComponent(productSlug)}`;

/** "HH:MM" from wannasport's local date-time ("2026-11-16T07:30:00"), or null when it has no time. */
export const clock = (localDateTime: string): string | null => localDateTime.match(/T(\d{2}:\d{2})/)?.[1] ?? null;

/** The API's date parameter, as the page sends it: that day's midnight in ISO UTC. */
export const apiDate = (day: string): string => `${day}T00:00:00.000Z`;
