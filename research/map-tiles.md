# Which map library and tiles may a free public website use?

Research for [#68](https://github.com/hoaj/cph-activities/issues/68), part of the map [#65](https://github.com/hoaj/cph-activities/issues/65). Checked on 2026-11-28.

The site is free, public and non-commercial, served from the Bun server on Railway. It shows events as pins on a calm, light map of Københavns and Frederiksberg Kommune, zooms to a chosen district and must work well on phones.

## Answer

**Use MapLibre GL JS with OpenFreeMap's Positron style.** It needs no key, no account and no cookies, and has no request limit. It is a light, grey, vector style that matches the design. The required attribution is added automatically from the style.

**Fallback: the same library with our own tiles.** Serve a Protomaps PMTiles extract of Copenhagen (16 MB for zoom 0–15, 7 MB to zoom 14) from the Bun server, with the `grayscale`, `white` or `light` flavor. That leaves no third-party tile service at all. Switching to it means a different style: Protomaps uses its own schema, not OpenMapTiles, so it is more than a URL swap.

If a hosted fallback is preferred over self-hosting, CARTO's free non-commercial key (5M requests a month) brings back the `light_all`/Positron look.

## Options compared

| Option | Key / account | Limits | Attribution | Light style | Type | Self-host |
|---|---|---|---|---|---|---|
| **OpenFreeMap** (public instance) | None | None on views or requests; no SLA | OpenFreeMap, © OpenMapTiles, © OpenStreetMap (auto in MapLibre) | Positron (also Bright, Liberty, Dark, Fiord) | Vector | Yes (full planet images), heavy |
| **Protomaps PMTiles, self-hosted** | None | Our Railway egress only | © OpenStreetMap (ODbL produced work) | `light`, `grayscale`, `white` flavors | Vector | It *is* self-hosting: one 7–16 MB file |
| **OSM Foundation tiles** (`tile.openstreetmap.org`) | None | Best effort, may block without notice; no offline or prefetch | © OpenStreetMap, clearly visible | No: the busy standard style only | Raster | No (policy covers their servers) |
| **CARTO basemaps** | Free key by e-mail, no account | 5M requests/month non-commercial | © OpenStreetMap contributors, © CARTO | Positron / `light_all` | Raster and vector | No |
| **Stadia Maps** | Account; domain auth or key | Free plan 200,000 credits/month, commercial use not allowed | Required (exact text not checked) | Alidade Smooth (not checked) | Raster and vector | No |
| **MapTiler Cloud** | Account and key | Free: 5,000 map sessions, 100,000 requests/month; pauses until next month when exceeded | MapTiler logo required | Light styles exist (not checked) | Vector | Not on free plan |
| **Esri (ArcGIS Location Platform)** | Account and key | 2M basemap tiles free, then billed | Required (not checked) | Light Gray Canvas (not checked) | Raster and vector | No |
| **Protomaps hosted API** | Account and key | Free for non-commercial use; quota not stated | © OpenStreetMap | Same flavors | Vector | — |

### OpenFreeMap (recommended)

- **Terms.** "Using our public instance is completely free: there are no limits on the number of map views or requests. There's no registration, no user database, no API keys, and no cookies." Commercial use is allowed too. ([README](https://github.com/hyperknot/openfreemap#readme), [openfreemap.org](https://openfreemap.org/))
- **Risk.** No SLA ("At the moment, I don't offer SLA guarantees"), and the [terms](https://openfreemap.org/tos/) say the service "may be discontinued at any time without notice". It is one maintainer funded by donations. The terms forbid automated scraping; offline downloads are capped at 3,000 tiles / 50 MB each.
- **Attribution.** Required; "If you use MapLibre, it's added automatically" ([openfreemap.org](https://openfreemap.org/)). The TileJSON carries: `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`.
- **Light style.** Positron is light grey: background `rgb(242,243,240)`, parks `rgb(230,233,229)`, water `rgb(194,200,202)`, white roads (read from `https://tiles.openfreemap.org/styles/positron`). To tune it, edit it in Maputnik and host our own style JSON ([quick start](https://openfreemap.org/quick_start/)), or change paint properties at runtime with `map.setPaintProperty`.
- **Verified by fetching (2026-11-28), no key, no Referer:**
  - `https://tiles.openfreemap.org/styles/positron` → 200, 25 KB JSON, 55 layers; sources point at `https://tiles.openfreemap.org/backup_planet`.
  - `styles/liberty` and `styles/bright` → 200.
  - TileJSON `https://tiles.openfreemap.org/planet` → 200; tiles `…/planet/20261122_124456_pt/{z}/{x}/{y}.pbf`, maxzoom 14.
  - Tile 14/8763/5128 (central Copenhagen) → 200 `application/vnd.mapbox-vector-tile`, `access-control-allow-origin: *`, `cache-control: max-age=315360000`, served by Cloudflare. It is 344 KB raw and 209 KB on the wire gzipped. The densest tiles are large, which matters on phones.
  - Glyphs (`/fonts/Noto Sans Regular/0-255.pbf`) → 200.
  - There are no raster PNG tiles (`/styles/positron/14/…png` → 404), so Leaflet can show it only through the `maplibre-gl-leaflet` bridge.

### Protomaps PMTiles, self-hosted (fallback)

- **What it is.** A single-file tile archive read with HTTP Range requests. The browser reads it through the `pmtiles` JS library: `maplibregl.addProtocol("pmtiles", new Protocol().tile)`, then a source with `"url": "pmtiles://https://…/cph.pmtiles"` ([docs](https://docs.protomaps.com/pmtiles/maplibre)).
- **Licence and attribution.** The basemap is "distributed as an Open Database License Produced Work (OpenStreetMap attribution required)" ([downloads](https://docs.protomaps.com/basemaps/downloads)). The extract's own metadata carries `© OpenStreetMap`.
- **Daily planet builds.** These are at `https://build.protomaps.com/YYYYMMDD.pmtiles`, listed in `https://build-metadata.protomaps.dev/builds.json`; 20261128.pmtiles is 139.9 GB, v4.15.2. The docs discourage hotlinking and say to copy the tileset to your own storage. Builds are kept for a week, plus the latest per patch version ([downloads](https://docs.protomaps.com/basemaps/downloads)).
- **Making the extract (done for this research).** Use the `pmtiles` CLI v1.31.2, a single Go binary from [GitHub releases](https://github.com/protomaps/go-pmtiles/releases):

  ```sh
  pmtiles extract https://build.protomaps.com/20261128.pmtiles cph.pmtiles \
    --bbox=12.45,55.60,12.74,55.74 --download-threads=8   # add --maxzoom=14 for the smaller file
  ```

  | Extract (bbox, approximate; see below) | Tiles | File | Time |
  |---|---|---|---|
  | zoom 0–15 | 915 addressed / 793 unique | **16.2 MB** | 11 s, 53 requests |
  | zoom 0–14 | — | **7.1 MB** | 6 s |

  The CLI reads only the needed byte ranges, so the 140 GB planet file is never downloaded. Zoom 15 is the basemap's highest zoom; MapLibre overzooms beyond it. The bbox above is a rough box around both kommuner; Kalvebod Fælled reaches a little further south, so use 55.58 as the south edge, or `--region=kommuner.geojson` with the real boundary polygons ([CLI docs](https://docs.protomaps.com/pmtiles/cli)). Sizes change by a few percent.
- **Serving from our Bun server.** Bun 1.4.3 answers a `Range: bytes=0-126` request on `new Response(Bun.file(path))` and on a static `routes` entry with `206` and a correct `Content-Range` (tested locally). No extra tile server is needed.
  - The file can live in the repo (16 MB) or be fetched at build time.
  - Refresh it by re-running the extract now and then; the OSM data does not need to be daily.
  - Set the source's `maxBounds`/`minZoom` so nobody pans off the extract into blank map.
- **Style, glyphs, sprites.** `@protomaps/basemaps` v5.7.2 (BSD-3) generates the layers: `layers("protomaps", namedFlavor("grayscale"), {lang: "en"})` ([docs](https://docs.protomaps.com/basemaps/maplibre), [flavors](https://docs.protomaps.com/basemaps/flavors)).
  - Base colors per flavor (background / earth / park), read from the package source:

    | Flavor | Background | Earth | Park |
    |---|---|---|---|
    | `light` | `#cccccc` | `#e2dfda` | `#cfddd5` |
    | `grayscale` | `#a3a3a3` | `#cccccc` | `#c2c2c2` |
    | `white` | `#ffffff` | `#ffffff` | `#fcfcfc` |

  - Any color can be overridden (`{...namedFlavor("light"), water: "…"}`).
  - Glyphs and sprites are on GitHub Pages (`https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf`, `…/sprites/v4/light`, all answered 200). The docs offer them as ZIPs "if you need to host them yourself or offline". Serve only the fonts and sprite the style uses, from our server, so nothing third-party remains.
- **Cost.** Railway egress for our own tiles. A first view of Copenhagen is a handful of tiles. One zoom-14 tile of the centre in the extract is 55 KB.

### OSM Foundation tiles

- Allowed for a website, but under the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/):
  - Attribution must be shown "clearly on the map", not hidden behind toggles.
  - Browsers must send a valid `Referer`; don't set a restrictive `Referrer-Policy`, and don't strip it through a proxy.
  - Never send no-cache headers.
  - No bulk download, prefetch or offline use.
  - "Availability is best-effort: there is no SLA", and access "may be blocked without prior notice". Services "that seek donations" should be "especially aware that access may be withdrawn at any point".
- Fetching 14/8763/5128 answered 200 PNG.
- The only style is the full-colour OSM Carto look, which is not the calm design. Making it calm takes a CSS filter (grayscale/brightness) over the tile layer.
- Raster only. Not recommended beyond a throwaway prototype.

### CARTO

- `https://a.basemaps.cartocdn.com/light_all/14/8763/5128.png` answers 200 with a 256×256 placeholder tile reading "API KEY REQUIRED – carto.com/basemaps/apikey" (checked visually). So the note from the design work holds: no key, no map.
- The [key page](https://carto.com/basemaps/apikey) says the key is "Free, no account, in your inbox in a minute". Limits:
  - Non-commercial (personal projects, research, teaching, non-profits): "Free up to 5M requests a month".
  - Commercial: free up to 1M.
- Attribution: "© OpenStreetMap contributors, © CARTO, on every map".
- The key is visible in the browser, which is expected for a basemap key.
- The CARTO GL style (`basemaps.cartocdn.com/gl/positron-gl-style/style.json`) and its vector tiles still answered 200 without a key today. The key page covers raster and vector alike, so don't rely on that.

### Stadia, MapTiler, Esri, Protomaps API

All need an account, and all but Stadia's domain auth need a key in the page.

- **Stadia.** The free plan is "200,000 credits" a month and "Commercial use not allowed" ([pricing](https://stadiamaps.com/pricing)). Websites can use domain-based auth instead of a key ([auth docs](https://docs.stadiamaps.com/authentication/)). Its light style (Alidade Smooth, not checked) would fit. A workable hosted alternative to CARTO.
- **MapTiler.** The free plan has 5,000 map sessions and 100,000 requests a month and requires the MapTiler logo. "On a FREE plan service will pause until the next month" ([pricing](https://www.maptiler.com/cloud/pricing/)). 5,000 page loads is little for a public site.
- **Esri.** "2M free then $0.15 per 1,000 tiles" and "1K free" basemap sessions, then billed ([pricing](https://location.arcgis.com/pricing/)). The page doesn't say whether a card is needed. Billing beyond the free amount is a risk for a hobby site.
- **Protomaps hosted API.** "free for non-commercial use", "requires an API key"; no quota stated ([protomaps.com/api](https://protomaps.com/api)). Self-hosting the extract is simpler.

## Libraries

| | MapLibre GL JS | Leaflet |
|---|---|---|
| Current version | **6.20.0** (2026-11-27); 5.24.1 still maintained (`latest-5`, 2026-11-11) | **1.9.4** (2023-05-18); 2.0.0-beta.5 prerelease |
| Licence | BSD-3-Clause | BSD-2-Clause |
| JS, minified / gzip | 6.x: main 1,121 KB / 301 KB **+** worker 557 KB / 159 KB ≈ **460 KB gzip**. 5.24.1 UMD: 1,058 KB / 276 KB | 148 KB / **42 KB** |
| CSS, gzip | 10 KB | 3.5 KB |
| Tiles | Vector (and raster) | Raster only; vector needs the `maplibre-gl-leaflet` bridge, i.e. both libraries |
| Needs | WebGL2 in 6.x ("WebGL (v1) support has been removed") | Nothing special |
| Fit to a district | `map.fitBounds([[w,s],[e,n]], {padding})`; compute the polygon's bbox (a short loop over the coordinates, or `@turf/bbox`) | `map.fitBounds(L.geoJSON(feature).getBounds())`: built in |

- Sizes were measured from the published files on jsDelivr. The `pmtiles` client 4.5.0 adds 20 KB min / 8 KB gzip.
- **MapLibre 6 is ESM-only.** "The UMD bundles … are no longer published"; load it with `<script type="module">` or `import * as maplibregl from 'maplibre-gl'`. The worker is a separate `maplibre-gl-worker.mjs` file loaded by URL, so `worker-src blob:` is no longer needed ([CHANGELOG 6.0.0](https://github.com/maplibre/maplibre-gl-js/blob/v6.20.0/CHANGELOG.md)).
- Bun can bundle it (`Bun.build`), or serve both `.mjs` files from `node_modules`.
- 6.20.0 is a day old; pin an exact version and take a release that has been out a couple of weeks.
- Leaflet is ten times smaller but can't use the light vector styles that need no key. With raster tiles it is left with the OSM tiles (busy, policy-bound) or a keyed provider. MapLibre's size buys keyless, restylable, crisp vector maps. Its `fitBounds` signature is in the [API docs](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), Leaflet's in the [reference](https://leafletjs.com/reference.html).

## What it means for #65

- Library: MapLibre GL JS, pinned. Style: `https://tiles.openfreemap.org/styles/positron`, possibly restyled and hosted by us to match the design's desaturated look.
- Keep the attribution control on; it fills itself from the style. On phones the compact attribution button is enough, since it stays on the map and isn't hidden.
- For district zoom, compute the polygon's bounds and call `fitBounds` with padding that clears the phone's bottom sheet.
- If OpenFreeMap goes away or proves slow: extract Copenhagen with `pmtiles extract` (above) and serve it from Bun. Generate the style with `@protomaps/basemaps` (`grayscale` or `white`, recoloured) and self-host its fonts and sprite.

## Not verified

- MapLibre 6 on real phones: not tested here; the WebGL2 requirement comes from the changelog only.
- OpenFreeMap's real-world speed and uptime from Denmark.
- Stadia's free plan for a public non-commercial site: the pricing page says only "Commercial use not allowed"; whether domain auth is on the free plan isn't stated.
- Esri: whether a card is needed.
- Protomaps hosted API: the quota.
- Style names and exact attribution text for Stadia, MapTiler and Esri (from memory, marked "not checked" above).
- The Protomaps size per zoom-14 tile (55 KB) is as stored in the archive. I could not tell whether that figure is compressed.
