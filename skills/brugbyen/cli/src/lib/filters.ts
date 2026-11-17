// The filter lists of brugbyen's search form, as the pages carry them.
export type Option = { id: string; name: string };
export type Filters = { categories: Option[]; groups: Option[]; districts: Option[] };

const pair = (ids: string[], names: string[]): Option[] =>
  ids.flatMap((id, i) => (id.trim() === "" ? [] : [{ id: id.trim(), name: (names[i] ?? "").trim() }]));

export const filtersOf = (r: { categoryIds: string[]; categoryNames: string[]; groupIds: string[]; groupNames: string[]; districtIds: string[]; districtNames: string[] }): Filters => ({
  categories: pair(r.categoryIds, r.categoryNames),
  groups: pair(r.groupIds, r.groupNames),
  districts: pair(r.districtIds, r.districtNames),
});

const ALIASES: Record<string, string> = {
  kids: "børn", children: "børn", child: "børn", boern: "børn", born: "børn",
  youth: "unge", teens: "unge", teenagers: "unge",
  adults: "voksne", adult: "voksne",
  seniors: "seniorer", senior: "seniorer",
};

/** Names or ids (repeated flags, each possibly comma-separated) to ids; the unknown ones come back apart. */
export function resolve(values: string[], options: Option[], aliases = false): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v !== "")) {
    const key = raw.toLowerCase();
    const wanted = aliases ? (ALIASES[key] ?? key) : key;
    const hit = options.find((o) => o.id === raw || o.name.toLowerCase() === wanted);
    if (!hit) unknown.push(raw);
    else if (!ids.includes(hit.id)) ids.push(hit.id);
  }
  return { ids, unknown };
}

/** The audience groups are fixed on the site. */
export const GROUPS: Option[] = [
  { id: "10", name: "Børn" },
  { id: "11", name: "Unge" },
  { id: "12", name: "Voksne" },
  { id: "13", name: "Seniorer" },
];

/** Group values (names, English aliases or ids) to ids from the fixed map; null when any value is not in it, so the lookup must decide. */
export function staticGroups(values: string[]): string[] | null {
  const r = resolve(values, GROUPS, true);
  return r.unknown.length > 0 ? null : r.ids;
}
