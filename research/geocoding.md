# Coordinates for the map: which sources carry them, and which free geocoder places the rest

Research for [#66](https://github.com/hoaj/cph-activities/issues/66) (map [#65](https://github.com/hoaj/cph-activities/issues/65)). Measured on 28 Nov 2026 against `main` at 2e1896a.

## Answer in short

- **Three sources already have coordinates, and nothing keeps them today.** Billetto puts them on every search hit (`_geoloc`). Teaterbilletter puts them on every venue (`venue.geoLat`/`geoLon`). Kultunaut has them on each event page and venue page, though not on the list page the CLI reads. Four more sources have a fixed set of places (kglteater's four stages, plus absalon, culturebox and hangaren with one address each), so a table of coordinates covers them. That leaves **kulturkbh, brugbyen and visitorservice** as the sources that must be geocoded. Kultunaut also needs geocoding unless the pipeline reads one page per new venue.
- **DAWA can no longer be used.** It closed on 1 Oct 2026. Every endpoint under `api.dataforsyningen.dk` (DAWA and Gsearch) now answers `401 Unauthorized` without a token. Its successor, DAR on Datafordeleren, needs a registered user and an API key, and it looks up addresses only, not venue names. Our rows are mostly venue names.
- **The recommended geocoder is Nominatim (OSM), with Photon as a fallback.** Send the source's street address when it has one. Otherwise send the venue name up to its first comma, without "København". Keep the first result that lies inside Københavns + Frederiksberg Kommune (the polygon in `skills/billetto/cli/src/lib/cph-boundary.ts`). Run this way over 178 real venue strings, it placed **146 (82 %) at the right place, 9 (5 %) at the wrong place and gave nothing for 21 (12 %)**. Run alone, Nominatim gets fewer right but also fewer wrong. Photon finds more, but its wrong hits look plausible.
- **Geocode once per venue and keep the result forever.** Venues recur: 875 kultunaut rows in three days came from 353 venues. Nominatim's policy requires caching, OSMF's geocoding guideline allows it, and a job run at regular intervals is limited to 4 requests a minute. Geocode in the pipeline, never from a visitor's browser. The site must credit OpenStreetMap.

## 1. Which sources carry coordinates, and where

| Source | Coordinates? | Where in the raw data | Shape and quality | Kept today? |
|---|---|---|---|---|
| billetto | **yes** | Algolia hit `_geoloc: {lat, lng}` (`skills/billetto/cli/src/operations/searchEvents.ts`; captures `event-search/POST-1-indexes-events-query.shape.json`) | Live, 28 Nov: 190 of 190 hits had it. Precision is 4 decimals (169) or 3 (21), about 10 m. One hit with no venue and postcode `0` sat exactly on `55.6761,12.5683`, the city centre the search is centred on, so that pair is a placeholder and not a place. | Read in `commands/event-search.ts` to set `area` (`areaAt`), then left out of the output |
| teaterbilletter | **yes** | `GET /api/events` → `items[].venue.geoLat`, `geoLon`, plus `municipality` (captures `show-list/teaterbilletter.dk-GET-api-events.shape.json`, also `explore/…-GET-api-venues.shape.json`) | Live: 86 of 86 venues across 356 productions, 5 to 13 decimals. `municipality` ("Københavns Kommune", "Frederiksberg Kommune", …) settles the area by itself. | No. `operations/listEvents.ts` leaves both fields out of its schema |
| kultunaut | **on the detail page only** | The list (`/perl/arrlist/type-nynaut`, what the CLI reads) has none. Each event page (`/perl/arrmore/type-nynaut?ArrNr=…`) and venue page (`/perl/sted/type-nynaut/nr-<id>`) has `L.marker([55.6989,12.5422])`, a `maps.google.com/maps?daddr=lat,lng` link and "Lat:/Lon:" text | 80 of 80 sampled event pages had it, at 4 decimals. That costs one request per new venue, and the result can be cached by venue name. | No |
| kulturkbh | no | `events-list.json` has `addr` (67 of 264 rows live) and `location` (146 of 264): free-text strings. `kilder.html` has each source's address | Text only. Note: kulturkbh filters by **postcode**, not coordinates (`lib/events.ts` `areaOf`), so the ticket's premise holds only for billetto | Partly. `planner/normalise.ts` puts the `location` string in `address` and drops the command's own `address` (`addr`). 11 of 34 snapshot rows have no venue at all |
| brugbyen | no | The list gives only `div.field--name-contact` ("Venue, room"). Each event page has JSON-LD `location: {Place, name, address: PostalAddress{streetAddress, postalCode, addressLocality}}` with no `geo` | Street address, one request per event. 43 of the 78 snapshot event pages were already gone (404) ten days later, and one more had no address | No |
| visitorservice | no | Market page `#places .kk-contact__…`: address and postcode. One page checked, with no map data | Street address | Yes (`address`) |
| kglteater | no | `location` is one of four stage names (`lib/shows.ts` `CPH_STAGES`) | A fixed set. Teaterbilletter has three of them: Operaen 55.6821091,12.6000738; Skuespilhuset 55.680452,12.59465; Gamle Scene 55.6802335,12.5868569. Nominatim gives Stærekassen at 55.6792030,12.5868463 | n/a |
| absalon, culturebox, hangaren | no | One constant address each in `lib/events.ts` | Nominatim: Sønder Boulevard 73 → 55.66539,12.55031; Kronprinsessegade 54 → 55.68640,12.58406; Refshalevej 185 → 55.69144,12.61695 (all inside the polygon) | n/a |

`planner/types.ts` `Item` has no coordinate field, so whatever a source has is lost by the time rows reach the planner.

## 2. Candidate geocoders: terms and limits

| Service | Status (28 Nov 2026) | Terms that matter |
|---|---|---|
| **DAWA** (Dataforsyningen) | **Closed on 1 Oct 2026 at 10:00** ([BiQ](https://biq.dk/biq-nyheder/dawa-er-lukket/), [OSM DK forum](https://community.openstreetmap.org/t/dawa-adresse-api-lukker-den-1-oktober-2026-hvad-med-autoaws/148055)). Checked live: `api.dataforsyningen.dk/adresser`, `/autocomplete` and `/steder` answer `401 Unauthorized` (`www-authenticate: Bearer error="invalid_token"`), and `dawa.aws.dk` no longer answers. I could not load the official notice: `dataforsyningen.dk/data/4924` returned 404 | n/a |
| **Gsearch** (Dataforsyningen) | `api.dataforsyningen.dk/rest/gsearch/v2.0/{adresse,stednavn}` answers 401 without a token. Secondary sources say it takes a free token and may close as well | Not tested: no token |
| **DAR on Datafordeleren** (DAWA's official successor) | [DAR GraphQL](https://datafordeler.dk/dataoversigt/danmarks-adresseregister-dar/dar-graphql/) needs a Datafordeler user (MitID or e-mail) and an "IT-system med tilhørende API key" or OAuth. It is the authoritative address register and has no venue names | Not tested: no key. It could only replace the address step |
| **Nominatim** (nominatim.openstreetmap.org) | Works without a key | [Usage policy](https://operations.osmfoundation.org/policies/nominatim/): "an absolute maximum of 1 request per second"; a User-Agent "identifying the application" ("stock User-Agents … will not do"); "Results must be cached on your side"; "Scripts … that are run at regular intervals are restricted to 4 requests per minute"; a single thread on one machine; no client-side autocomplete; for end-user traffic, "the sum of traffic by all your users should not exceed the limits"; attribution required |
| **Photon** (photon.komoot.io, OSM data) | Works without a key | [README](https://github.com/komoot/photon): use is welcome "as long as the number of requests stay in a reasonable limit. Extensive usage will be throttled or completely banned", with no guarantee of availability. No numeric limit is published. It can be self-hosted (Java 21+) |
| OSM data licence (both above) | — | [OSMF geocoding guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline): "Geocoding Results may be stored (either permanently or temporarily) together with the external data used for querying", with no share-alike unless results are collected systematically into a substantial copy of OSM. An application using such a geocoder must credit OpenStreetMap (ODbL 4.3) |

I found no other free, keyless geocoder worth testing. Keyed free tiers (LocationIQ, Geoapify, OpenCage, DanskAdresseAPI's 1 000 free requests) were left out because the brief asked for free and open.

## 3. Measurement

**Test set (178 distinct venue strings from `planner/fixtures/snapshot.json`)**, all from sources without coordinates: kultunaut 80 (a random sample of its 353 venues, seed 66), brugbyen 78 (all), kulturkbh 19 (all with a venue) and absalon 1.

**Truth.**
- Kultunaut (80): kultunaut's own map point from the event page. This is independent of the geocoders.
- Brugbyen, kulturkbh and absalon (69): the source's street address, from brugbyen's JSON-LD (also borrowed by other rooms of the same venue) or kulturkbh's address text. A point was accepted only where Nominatim and Photon agreed on the address within 100 m.
- The remaining 29 had no truth. I reviewed those picks by hand against the venue name.

**Scoring.** Right is within 150 m of the truth, near is 150 to 500 m, wrong is more than 500 m away. "Unverified" means a hit inside Copenhagen with no truth to compare.

**Queries.** One thread per service at 1 request per second, with User-Agent `cph-activities-research/1.0 (…)` and no personal data.
- Nominatim: `countrycodes=dk`, `viewbox=12.43,55.74,12.66,55.60` (bias, not bounded), `limit=5`.
- Photon: `lat=55.6761&lon=12.5683` (bias), `limit=5`.
- Unless stated otherwise, the result kept is the first one inside the Københavns + Frederiksberg polygon.

Query shapes:
- `raw`: the venue string as is.
- `head`: the text before the first comma ("Vesterbro Bibliotek og Kulturhus, Helgasalen" → "Vesterbro Bibliotek og Kulturhus").
- `head_kbh`: head + ", København".
- `address`: the street address, where the source has one.

### Kultunaut, independent truth (n = 80)

| Service, shape | Right | Near | Wrong | No answer |
|---|---|---|---|---|
| Nominatim raw | 47 | 1 | 3 | 29 |
| **Nominatim head** | **48 (60 %)** | 1 | **4 (5 %)** | 27 |
| Nominatim head + København | 41 | 1 | 4 | 34 |
| Photon raw | 52 | 2 | 7 | 19 |
| Photon head | 54 (68 %) | 1 | 8 (10 %) | 17 |
| Photon head + København | 54 | 3 | 14 (18 %) | 9 |

Distance from kultunaut's point for Nominatim `head` hits: median 21 m, 90th percentile 127 m.

### All 178 venues

| Service, shape | Right | Near | Wrong | Unverified | No answer |
|---|---|---|---|---|---|
| Nominatim raw | 81 | 2 | 3 | 14 | 78 |
| Nominatim head | 111 | 2 | 5 | 23 | 37 |
| Nominatim head + København | 104 | 2 | 5 | 22 | 45 |
| Photon raw | 96 | 2 | 10 | 21 | 49 |
| Photon head | 117 | 1 | 9 | 26 | 25 |
| Photon head + København | 119 | 3 | 17 | 26 | 13 |
| Without the polygon filter (top result): Nominatim head | 112 | 2 | 6 | 23 (+2 outside) | 33 |
| Without the polygon filter (top result): Photon head | 116 | 1 | 22 | 24 (+5 outside) | 10 |
| **Address, else Nominatim head, else Photon head if its name matches** | **123** | 1 | 7 | 26 | 21 |

In the last row I checked the 26 unverified picks by hand. 23 are the named place (libraries, culture houses, Cisternerne and so on). 2 are wrong: "HUSET, Stairway" and "Stairway" both went to V-huset in Ørestad, because brugbyen's JSON-LD gives "HUSET" as the street address. 1 is right only at street level (Kay Fiskers Plads). **In total: 146 right (82 %), 2 near, 9 wrong (5 %), 21 without an answer (12 %).**

**Street addresses (49 distinct).** Nominatim found 47. Its two misses were "Højbro Plads, 1200 København K", a square with no house number, and "Masnedøgade 20, 2. sal, 2100 København Ø", where the floor text breaks the query, so floor and room text should be stripped first. Photon found all 49, and the two services agreed within 100 m on 45.

### What the misses and wrong hits look like

- **Nominatim misses** come from spellings or extra text that OSM does not use: "Helligaandskirken" (OSM: Helligåndskirken), "Nordhavn Bio (tidl. Big Bio Nordhavn)", "KLEIN - Sydhavnens spillested || Karens Minde Kulturhus", "Det Kgl. Danske Musikkonservatorium, Konservatoriets Koncertsal". They also come from sports halls and small businesses OSM does not name: "Voldparken-hallen", "Rört Yoga", "Charlie Scott's".
- **Photon's wrong hits are fuzzy matches that look right**: KBK-hallen → Valby Hallen, Teater ZeBU → Det Kongelige Teater, Nordisk Film Biografer - Reservoir → Imperial, Panik Fabrikken → "Fabrikken" on Christiania. Adding ", København" makes this worse (8 → 14 wrong on kultunaut), because the city word scores as a match on its own.
- **Some are wrong on any geocoder**: "Københavns Universitet, Søndre Campus" lands on the main building, "København K" is a shop of that name, and "Sundby BK" resolves to a street.
- **Room and floor text kills a name match on Nominatim** (raw 81 right against head 111). Cutting the string at the first comma is the single biggest gain.
- **The Copenhagen polygon matters for Photon**: without it, Photon's top results have 22 wrong and 5 outside Copenhagen, against 9 and 0 with it.

## 4. What this means for caching

- Cache by **normalised venue head per source**, not per event. The three snapshot days have 875 kultunaut rows from 353 venues, 126 brugbyen rows from 78, and 102 billetto rows from 79. Once the cache is warm, a day brings only a handful of new venues.
- **Store results permanently, with the query text.** Nominatim requires it ("Results must be cached on your side"), and the OSMF guideline allows storing individual results with the data used for querying.
- **Mind the 4-requests-a-minute rule.** A daily ingest is a script "run at regular intervals", so it may send at most 4 requests a minute to Nominatim. That is enough for new venues. A one-off warm-up of a few hundred venues at 1 request a second takes minutes.
- **Geocode in the pipeline, never per visitor.** Nominatim forbids client-side autocomplete, and all users' traffic together counts against the limit.
- **Keep a small hand-made override table.** About 12 % of names find nothing, and about 5 % find the wrong place, mostly the same venues every day. A row with no point needs a decision; the evidence does not settle it.
- **Do not geocode when the source has a point.** Billetto (with its city-centre placeholder filtered out), teaterbilletter and the fixed-venue sources need no geocoding. For kultunaut, one detail page per new venue name gives the source's own point. That is the same order of request count as geocoding it, and it was 100 % available in the sample, against 60 to 68 % right by name.
- Credit "© OpenStreetMap contributors" on the site when OSM-geocoded points are shown.

## 5. Could not verify

- **DAR, Gsearch and keyed free tiers**: not measured, since I had no Datafordeler API key or Dataforsyningen token.
- **The DAWA closing date** comes from secondary sources (BiQ, the OSM Denmark forum). The official Dataforsyningen page was unreachable (404). The 401 answers were observed directly.
- **Visitorservice, kglteater, culturebox and hangaren rows** are not in the snapshot, so they were not part of the measurement.
- **Truth for brugbyen and kulturkbh** comes from geocoding their own street addresses (where both services agreed). This measures name-against-address agreement, not survey accuracy. Kultunaut's points are the only independent truth.
- **The manual review of 26 picks** is my judgement from the venue names and OSM's answers. I did not check them against a map.

## Method, for re-running

The scripts were kept outside the repo. In outline:

1. Pick the snapshot's distinct venue strings per source, and fetch each kultunaut event page (for the `L.marker` point) and each brugbyen event page (for the JSON-LD address), at 1 request a second.
2. Send each query shape to Nominatim and Photon, one thread each at 1 request a second, and cache every raw answer.
3. Score the first result inside the polygon from `skills/billetto/cli/src/lib/cph-boundary.ts` by distance to the truth.

The whole run was 375 distinct queries per service.
