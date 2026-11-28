# Where do we get official area boundaries for Copenhagen's districts and Frederiksberg?

Research for hoaj/cph-activities#67 (child of map #65). Dated 2026-11-28. Primary sources only; every claim links to its source in "Sources". The numbers come from downloads made on 2026-11-28 and checks run with `@turf/turf` 7.4.0 and `mapshaper` 0.8.14 under Bun 1.4.3. Anything I could not confirm is marked **unverified**.

## Short answer

- **Københavns ten districts**: the dataset "Bydele" from Københavns Kommune on opendata.dk. It is served live as GeoJSON by the municipality's own WFS (`k101:bydel`), with no key needed. It has 10 MultiPolygons, takes 251 KB in EPSG:4326 and has 9,637 vertices. Licence: CC BY.
- **Frederiksberg**: the official boundary is DAGI's *Kommuneinddeling* (Klimadatastyrelsen, CC BY 4.0). DAWA, the old keyless API, has closed (`api.dataforsyningen.dk/kommuner/0147` answers 401, and `dawa.aws.dk` no longer resolves). Datafordeler's DAGI WFS needs a free API key. Københavns Kommune's WFS republishes a DAGI extract (`k101:kommunegraense`, extract date 2024-01-28) that you can fetch **without a key**: 1 MultiPolygon, 126 KB, 1,144 vertices.
- **The names match the filter list**, except that KK writes `Vesterbro-Kongens Enghave` where the filter has `Vesterbro/Kongens Enghave`. Key on `bydel_nr`, not on the name.
- **Coverage**: the districts do not overlap one another. Against Frederiksberg there are only slivers of up to 630 m², from digitising differences. Against DAGI's København there are coastal and harbour differences of 0.25 km² (2.7 ‰ of the area), plus one real gap at Nordhavn (67,000 m²). One `mapshaper -clean` pass removes the overlaps and fills the gaps.
- **For the browser**: after snapping, cleaning and Douglas–Peucker simplification at 10 m, the eleven areas take **25 KB as GeoJSON (6.4 KB gzip)** or **9.7 KB as TopoJSON (3.7 KB gzip)**, down from 377 KB raw. The tool is `mapshaper`, which runs under Bun. Place events on the server with the cleaned full-resolution shapes (185 KB), and send only the simplified ones to the browser.

## Sources and download URLs

### Københavns Kommune: Bydele

- Dataset page: <https://www.opendata.dk/city-of-copenhagen/bydele>. The description reads "Københavns Kommunes 10 bydele, anvendes blandt andet i forbindelse med byplanlægning", the author is "Bydata" (bydata@kk.dk), and the metadata was last modified on 2025-11-11 ([CKAN API](https://admin.opendata.dk/api/3/action/package_search?q=bydele)).
- GeoJSON in WGS84 (the URL the dataset links to):
  `https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=k101:bydel&outputFormat=json&SRSNAME=EPSG:4326`
- The same data in its native CRS: drop `&SRSNAME=EPSG:4326`. That returns EPSG:25832 (ETRS89 / UTM 32N, in metres), which `GetCapabilities` gives as the layer's `DefaultCRS`. A CSV is also offered (`outputFormat=csv`).
- WFS capabilities: `https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities`. It is GeoServer, with `Fees NONE` and `AccessConstraints NONE`, and holds 485 layers.
- Licence: each resource carries `license_id: "CC_BY"` on opendata.dk. CC BY requires attribution but asks for no fixed wording. Suggested credit: "Bydele: Københavns Kommune (opendata.dk), CC BY". The version of CC BY is not stated (**unverified**; the dataset-level `license_id` is empty, and only the resources carry `CC_BY`).

What came back (2026-11-28):

| `bydel_nr` | `navn` (as served) | Filter label | `areal_m2` | Vertices | Parts |
|---|---|---|---|---|---|
| 1 | Indre By | Indre By | 10,471,832 | 923 | 4 (main area + Trekroner, Middelgrundsfort, Flakfortet) |
| 2 | Østerbro | Østerbro | 9,772,909 | 1,915 | 1 |
| 3 | Nørrebro | Nørrebro | 4,107,777 | 524 | 1 |
| 4 | **Vesterbro-Kongens Enghave** | Vesterbro/Kongens Enghave | 8,262,147 | 1,390 | 1 |
| 5 | Valby | Valby | 9,235,113 | 866 | 1 |
| 6 | Vanløse | Vanløse | 6,699,013 | 601 | 1 |
| 7 | Brønshøj-Husum | Brønshøj-Husum | 8,740,777 | 530 | 1 |
| 8 | Bispebjerg | Bispebjerg | 6,829,937 | 592 | 1 |
| 9 | Amager Øst | Amager Øst | 9,345,320 | 1,629 | 1 |
| 10 | Amager Vest | Amager Vest | 19,364,649 | 665 | 1 |

Properties are `id`, `bydel_nr`, `navn`, `areal_m2` and `ogc_fid`. The geometry is MultiPolygon, 2D. The district names are written as above in UTF-8; only the separator in district 4 differs from the filter list. Indre By includes Christianshavn and Holmen, and Vesterbro-Kongens Enghave includes Sydhavn.

Not these layers: `k101:drift_bydel` (operations districts) has the same ten names, written `Vesterbro - Kongens Enghave`. Run through the same check, it had 158 m² of overlaps between districts and 1.2 km² of gaps, so it is worse than `bydel`. `k101:lokaludvalgsgraense` has 12 local committee areas (Christianshavn, Vesterbro and Kongens Enghave are split), which does not match the filter.

### Frederiksberg: DAGI Kommuneinddeling

- Owner and licence: Klimadatastyrelsen holds the rights to DAGI. Since 16.05.2024 the "CC BY 4.0 licens gælder for frie geografiske data"; "Du skal kreditere Klimadatastyrelsen på et passende sted" ([Datafordeler: Brugervilkår KDS – geografiske data](https://datafordeler.dk/vejledning/brugervilkaar/kds-geografiske-data/)). Suggested credit: "Kommunegrænse: Klimadatastyrelsen, DAGI, CC BY 4.0". The older 2022 terms (SDFI) asked for the dataset name and the download date as well ([PDF](https://www.sdfe.dk/Media/638052180760639799/Vilk%C3%A5r%20for%20brug%20af%20frie%20geografiske%20data,%20opdateret%20november%202022.pdf)), so adding "DAGI, hentet januar 2024" costs nothing.
- **Keyless route (works today)**: Københavns Kommune's WFS layer `k101:kommunegraense` is a DAGI extract. Its properties carry `id_namespace: http://data.gov.dk/dagi`, `dataspecifikation: "DAGI Objektspecifikation version 2.0"`, `skala: "1:10.000"`, `udtraeksdato: "2024-01-28"`, and `virkningfra` 2024-01-15 for København and Frederiksberg. It holds 8 municipalities (København and its neighbours; 1.38 MB). To get Frederiksberg alone:
  `https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=k101:kommunegraense&outputFormat=json&SRSNAME=EPSG:4326&CQL_FILTER=kommunekode%3D%270147%27`
  (the filter `kommunekode='0147'`, URL-encoded; drop `SRSNAME` to get EPSG:25832). The result is 1 MultiPolygon with `navn: "Frederiksberg"` and `kommunekode: "0147"`, 126 KB, 1,144 vertices. **The coordinates are 3D, with z = 0**, so strip z before use (mapshaper does this).
- **Authoritative live route (needs a free key)**: Datafordeler's DAGI WFS at `https://wfs.datafordeler.dk/DAGI/DAGI_WFS/1.0.0/WFS?...&apikey=...`. Access is "API-key~OAuth", you create a user and an "IT-system" in Datafordeler Administration, and the output is GeoJSON or GML ([DAGI WFS entiteter](https://datafordeler.dk/dataoversigt/danmarks-administrative-geografiske-inddeling-dagi/dagi-wfs-entiteter/)). Pre-generated files need the same login ([DAGI Fildownload](https://datafordeler.dk/dataoversigt/danmarks-administrative-geografiske-inddeling-dagi/dagi-fildownload/)). I did not fetch from it (no key), so the exact layer name and whether Frederiksberg's boundary has changed since 2024-01-28 are **unverified**. A municipal boundary in the inner city rarely moves, and a DAGI change would show as a new `virkningfra`.
- DAWA is closed: `https://api.dataforsyningen.dk/kommuner/0147?format=geojson` answers `401 Unauthorized` (`www-authenticate: Bearer error="invalid_token"`), and `dawa.aws.dk` does not resolve. Do not build on it.
- Other candidates: KK's `k101:kommunegr_frberg` is a separate, older Frederiksberg polygon (MapInfo origin, 557 vertices). The hole the ten districts leave in their union is 8.664 km², against 8.665 km² for DAGI's Frederiksberg, so KK drew the districts to fit DAGI. Frederiksberg Kommune publishes no boundary of its own on opendata.dk: none of its 14 datasets there (organisation `city-of-frederiksberg`) is a municipal boundary.

## Coverage: gaps and overlaps

These were computed with turf on the WGS84 downloads; areas are geodesic.

- **Districts against each other**: 0.0 m² of overlap across all 45 pairs.
- **Districts against DAGI Frederiksberg**: slivers only. Vanløse 630 m², Valby 105 m², Vesterbro-KE 26 m², Nørrebro 25 m², Bispebjerg 5 m², Indre By 1 m². DAGI København and Frederiksberg do not overlap (0 m²).
- **Districts against DAGI København** (91.23 km²; the districts sum to 92.36 km²):
  - 1.29 km² of the districts lie outside DAGI, almost all in the inner harbour (water at 12.599, 55.679). The districts include harbour water and DAGI does not.
  - 0.25 km² of DAGI lies in no district, in 1,371 pieces, of which 27 are over 1,000 m². These are coastline and land-reclamation differences. The largest piece is a 66,600 m² hole at Nordhavn (12.6017, 55.7149), enclosed by Østerbro. Smaller ones are at Amager Strand (23,700 m²), the Nordhavn edge (21,700 m²) and Kalvebod (11,400 m²). My reading is that the `bydel` layer has not been updated for newly built land (**unverified**).
  - The union of the districts also has a 0.99 km² hole at 12.557, 55.652. That is the Sydhavn basin, which is water and is not in DAGI either.
- **Point test** on a 100 m grid over DAGI København + Frederiksberg (10,013 points): 9,986 fall in exactly one area (10 districts + Frederiksberg), 27 in none, and 0 in several.

After the cleaning described below (snap 2 m, `-clean gap-fill-area=100000m2`), the same test gives **9,995 in exactly one area, 18 in none, and 0 in several**. Every one of the 18 lies within 24 m of an area, on the coast or a pier. `-clean` resolves the Frederiksberg slivers and fills every hole in the union. The Nordhavn hole goes to Østerbro, and the Sydhavn water basin goes to Vesterbro-Kongens Enghave, which does no harm.

## Simplifying for the browser

The tool is [mapshaper](https://github.com/mbloch/mapshaper) (npm `mapshaper`, MPL-2.0). It simplifies on a shared topology, so neighbouring areas keep one common border and simplifying opens no gaps between them. It also has `-clean` for overlaps and gaps. I ran it as `bun --bun node_modules/mapshaper/bin/mapshaper ...`, and the output was byte-for-byte the same as under Node. Use it as a build-time step (a dev dependency plus a script), not at runtime.

The pipeline I used, with the inputs in EPSG:25832 so that `interval` is in metres. First the districts are renamed to `name` (`-each 'name=navn' -filter-fields name`), and Frederiksberg gets `name="Frederiksberg"`.

```sh
mapshaper -i bydele_25832.json frederiksberg_25832.json combine-files snap snap-interval=2 \
  -merge-layers force -proj from=EPSG:25832 \
  -clean gap-fill-area=100000m2 \
  -simplify dp interval=10 keep-shapes -clean \
  -proj wgs84 -o areas.geojson format=geojson precision=0.00001
```

Sizes for the 11 areas (gzip -9):

| Version | Vertices | GeoJSON | gzip | TopoJSON | gzip |
|---|---|---|---|---|---|
| Raw downloads (bydel 4326 + Frederiksberg 4326) | 9,637 + 1,144 | 377 KB | – | – | – |
| Combined, full resolution, 6 decimals | 10,721 | 235 KB | 62 KB | – | – |
| Snapped and cleaned, full resolution (for the server) | ≈10,700 | 185 KB | 50 KB | – | – |
| DP 5 m, 5 decimals (no clean) | 2,318 | 47 KB | 11.9 KB | 27.5 KB | 10.4 KB |
| **DP 10 m, snapped and cleaned (recommended for the browser)** | **1,201** | **25 KB** | **6.4 KB** | **9.7 KB** | **3.7 KB** |
| DP 20 m, 5 decimals (no clean) | 1,432 | 30 KB | 7.2 KB | 20.9 KB | 8.2 KB |

How accurate the 10 m version is: of 40,495 points on a 50 m grid that fall in one original area, 40,416 (99.8 %) fall in the same area after simplifying, 34 in a neighbour, 45 in none, and 0 in several. Every miss lies within about 10 m of a border or the coast. There are 0 m² of overlap between areas. Five decimal places in WGS84 is about 1 m, well below the 10 m tolerance.

## What this means for the implementation (inputs to a later decision, not decisions)

- Keep one checked-in file of 11 areas with a stable key (`bydel_nr` 1–10, and for example 0 or `"frederiksberg"` for Frederiksberg) and a display label taken from the filter list. Do not key on `navn`.
- **Placement on the server**: use the snapped and cleaned full-resolution shapes (185 KB; size does not matter on the server) with point-in-polygon (`@turf/boolean-point-in-polygon`, MIT, or a few lines of ray casting). If a point is in no area, take the nearest area within about 100 m (all 18 misses above were ≤ 24 m away), and otherwise treat it as outside Copenhagen. The cleaning leaves no overlaps, so a point never falls in two areas.
- **Browser**: the 10 m version as TopoJSON (3.7 KB gzip, needs `topojson-client` to decode) or as GeoJSON (6.4 KB gzip, no decoder). Either is small enough to inline or serve as a static file.
- **Framing**: Indre By has three islet forts far out in the Øresund (Flakfortet at 12.731 E). Its full bounding box reaches 12.555–12.734 E, while its main part spans 12.555–12.631 E. Frame on the largest part, or on a precomputed bbox per area.
- **Attribution** on the map: "Bydele: Københavns Kommune (CC BY). Kommunegrænse: Klimadatastyrelsen, DAGI (CC BY 4.0)."
- **Refresh**: the boundaries rarely change. Re-run the build by hand when needed instead of fetching at runtime. That also avoids depending on the KK WFS being up.

## Gaps (unverified)

- The version of CC BY for the KK "Bydele" resources (opendata.dk says only `CC_BY`), and any attribution wording KK prefers.
- Whether DAGI's current Frederiksberg boundary differs from the 2024-01-28 extract on KK's WFS. Checking needs a free Datafordeler API key.
- The exact Datafordeler DAGI WFS layer name for Kommuneinddeling (see the [object catalogue](https://grunddatamodel.datafordeler.dk/objekttypekatalog/Danmarks%20Administrative%20Geografiske%20Inddeling/package-summary.html)).
- Why the `bydel` layer leaves the Nordhavn gap (probably newly built land not yet drawn in).

## Sources

- opendata.dk, Københavns Kommune, "Bydele": <https://www.opendata.dk/city-of-copenhagen/bydele>. CKAN metadata, including `license_id` per resource: <https://admin.opendata.dk/api/3/action/package_search?q=bydele>
- Københavns Kommune WFS (GeoServer) capabilities: <https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities>. Layer schema: `...&request=DescribeFeatureType&typeName=k101:bydel`
- KK WFS GeoJSON for `k101:bydel`, `k101:kommunegraense`, `k101:drift_bydel`, `k101:lokaludvalgsgraense` and `k101:kommunegr_frberg`, fetched 2026-11-28 (URLs above)
- Datafordeler, DAGI WFS entiteter (access, formats): <https://datafordeler.dk/dataoversigt/danmarks-administrative-geografiske-inddeling-dagi/dagi-wfs-entiteter/>
- Datafordeler, DAGI Fildownload: <https://datafordeler.dk/dataoversigt/danmarks-administrative-geografiske-inddeling-dagi/dagi-fildownload/>
- Datafordeler, Brugervilkår, KDS geografiske data (CC BY 4.0, 16.05.2024): <https://datafordeler.dk/vejledning/brugervilkaar/kds-geografiske-data/>
- SDFI, "Vilkår for brug af frie geografiske data", 1 December 2022 (earlier terms, attribution wording): <https://www.sdfe.dk/Media/638052180760639799/Vilk%C3%A5r%20for%20brug%20af%20frie%20geografiske%20data,%20opdateret%20november%202022.pdf>
- DAWA's closure, observed directly: `curl -i https://api.dataforsyningen.dk/kommuner/0147` returns 401 on 2026-11-28, and `dawa.aws.dk` does not resolve
- mapshaper (MPL-2.0, v0.8.14): <https://github.com/mbloch/mapshaper>. Turf (MIT, v7.4.0): <https://turfjs.org>
