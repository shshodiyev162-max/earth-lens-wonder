# Architecture

TerraScope is a single-page React app (Vite, TypeScript, Tailwind, shadcn/ui, react-leaflet, Recharts, three.js). There is no required backend: every map tile, measurement and search result comes straight from public NASA and OpenStreetMap services, and the app's own state lives in the URL and on the device.

## Routes

| Path        | Page                     | What it does                                                         |
| ----------- | ------------------------ | -------------------------------------------------------------------- |
| `/`         | `Landing`                | Globe with real day and night (Now / Custom / Auto), entry points    |
| `/map`      | `Explore`                | One map: layer, date, search, click-to-read values, drawing           |
| `/split`    | `SplitView` ("Compare")  | One map, two layers or dates, draggable divider                       |
| `/sync`     | `SyncView` ("Side by side") | Two maps locked together                                          |
| `/trends`   | `Trends` ("Trend detective") | Ask or choose what changed where; hotspot scan, trend tests, demos |
| `/analysis` | `Analysis`               | Measured report for a place, area or point, with trend tests          |
| `/login`    | `Login`                  | Accounts when `VITE_API_BASE_URL` is set; explains demo mode otherwise |
| `*`         | `NotFound`               | 404                                                                   |

Pages are lazy-loaded and each one is wrapped in an error boundary (`App.tsx`). The map and analysis routes sit behind `RequireAuth`, which lets everyone through in demo mode.

**The URL is the state.** Layer, date and view (`/map?layer=…&date=…&lat=…&lon=…&z=…`), both sides of a comparison (`left`, `right`, `leftDate`, `rightDate`, `link`), the analysis target, period, months and datasets (`osm`, `area`, `lat/lon/r`, `bbox`, `period`, `start/end`, `base/recent`, `season`, `ds`), and a trend search (`q`, `ind`, `dir`, `f`, `place`, `country/osm/poly`, `t`, `season`, `tab`, `mode`) are all query parameters. Any view can be shared or bookmarked, and the back button works.

## Modules

### `lib/gibs` — NASA GIBS

- `catalog.ts` lists every layer with its WMTS matrix set. The matrix set also gives the deepest zoom GIBS serves; Leaflet scales tiles up past it instead of requesting tiles that would fail. Each entry also records the period (daily, 8-day, 16-day, monthly, yearly or static), the colormap name and the unit conversion (Kelvin to °C). The visible layers make up the picker; four hidden monthly products feed the analysis.
- `time.ts` fetches each layer's `DescribeDomains` document and resolves a requested date to one that exists: exact, snapped to the 8- or 16-day composite, nearest across a gap, or clamped to the earliest or latest. The default date for daily layers is yesterday, or two days back for the night band.
- `colormap.ts` parses NASA's colormap XML (v1.3) into a lookup from exact RGB to value, plus a legend. `decodePixel` turns a pixel back into a number. Transparent and no-data entries become `null`, and a nearest-color fallback covers anti-aliased edges.
- `sample.ts` builds WMS GetMap requests (EPSG:4326, so 1.3.0 axis order is latitude first) sized to the layer's native resolution. It rasterizes polygon outlines (scanline, even-odd, so holes and multipolygons work) and reduces the decoded pixels to mean, median, p10, p90, standard deviation and coverage. `probePoint` reads one value for click-to-read.

### `lib/geo` — places and shapes

- `geocode.ts` turns typed text into results in this order: coordinates (several notations), then Photon (built for search-as-you-type), then Nominatim as a fallback. Boundaries, OSM lookups and reverse geocoding go through Nominatim, queued to one request per second. Results are classified (country, state, region, city, water, nature…), which decides the icon, the zoom for point-only results and the analysis radius.
- `geometry.ts` covers geodesic area (spherical excess), point-in-polygon with holes, centroids and a guaranteed interior point, geodesic circles, and well-spread sample points for climate averaging.

### `lib/query` — reading a question

- `indicators.ts` lists the 13 measures: GIBS layer, unit, smallest change worth flagging, native resolution, usual season, the worrying direction, the surface it is read on (land, water or any) and its picker group.
- `parse.ts` is a rule-based reader. It claims parts of the sentence in order: time, things it can't measure (`concepts.ts`), measures (strong words like "NDVI", weak ones like "hotter"), directions (per clause, with "increase or decrease" meaning both), then the place. The result is several measures, each with its own direction. "What changed" asks for measures picked for the place.
- `period.ts` turns a time choice into baseline and recent windows and the years to read, within a budget of monthly maps.
- `ai.ts` is the optional AI fallback; it is only used when the rules understand nothing.

### `lib/trends` — the trend detective

- `query.ts` is the search as URL state: the form ⇄ the address, and the sentence written from the choices (round-trips through the reader; tested).
- `grid.ts` fetches one month of a layer as a decoded grid (cached on the device) and the land/water mask (OSM land/water map).
- `pixels.ts` gives each pixel a seasonal mean per year, its change, and a Mann–Kendall p-value and Sen's slope.
- `hotspots.ts` flags pixels, groups them into 8-connected patches, ranks them and traces outlines.
- `scan.ts` runs a scan:
  - availability, then the monthly maps (6 at a time)
  - the masks, then the per-pixel trends and the hotspots
  - the whole-area series and verdict, and the top-of-colour-scale note
  - finer re-reads of the top hotspots for large areas
  - `rebuildHotspots` regroups the pixels for new filters without network.
- `landcover.ts` reads NASA's yearly MODIS land cover, groups the 17 classes by NASA's own class names, and suggests measures by fixed rules.
- `place.ts` resolves a place: named regions, seas and oceans, countries from the bundled outlines, otherwise OpenStreetMap (found places are kept for the session, so the preview and the scan ask once). A sea or ocean marks the area as water: air measures are then read over the water only, and land measures over an ocean are refused with a plain explanation (`surfaceFor`, `mismatch` in `scan.ts`).
- `lib/geo/waters.ts` keeps the rough outlines of seas and oceans. Neighbouring waters share edges drawn through the land between them (the Americas between the Atlantic and the Pacific), so a click lands in the right one; `waterAt` returns the smallest outline at a point. The Pacific comes in two halves because a scan can't wrap around the 180° line. A test checks that all open water on a 3° grid belongs to some sea or ocean.

### `lib/analysis` — the report

- `run.ts` orchestrates a run. For each satellite dataset it takes the months that exist in the GIBS time domain, samples them through a shared, abortable cache with a concurrency limit of 6, and retries server errors. Climate comes from NASA POWER monthly and climatology requests at the sample points (limit 3). Progress is reported per step, and changing the target or period cancels the previous run.
- `power.ts` parses POWER responses (`-999` means no data; month `13` is the annual value and is dropped) and averages across sample points.
- `stats.ts` provides means, extremes and year-over-year change. It also has the statistics behind every verdict, checked against textbook values:
  - the Mann–Kendall test (tie-corrected, plus a seasonal version)
  - Sen's slope with its confidence range (Gilbert 1987)
  - Welch's t-test and plain-language verdicts
- `aggregate.ts` turns monthly values into one value per (season) year and compares two periods. `period.ts` reads periods, comparisons and months from the URL. `trend.ts` runs a trend test or comparison for every measure of a report and suggests testing the whole record when a short one shows no clear trend.
- `insights.ts` turns the numbers into a headline, a summary, findings, indicators and caveats using fixed thresholds that are stated in the text. It has no randomness and no language model.
- `export.ts` produces the CSV: one row per month read, blank where there is no data, with the trend results as header lines.
- `../analysisClient.ts` is optional: when `VITE_AI_ANALYSIS_ENDPOINT` is set, the measured findings are sent there for a short AI-written briefing shown next to the built-in summary.

### `lib/demo` and `components/demo`

`scripts.ts` holds three worked examples as steps. Each step has a caption, a page part to point at (a typed `data-demo` target), an optional action (ask, edit, run, filter, open a hotspot) and an optional wait for NASA data. `DemoPlayer` plays them with a spotlight, Back/Next/Play and Esc to leave. The Trends page gives it a small set of controls.

### `lib/glossary.ts`

Plain one- or two-sentence definitions of every measure and of the statistics words, shown in the measure picker, the result tabs, the Analysis cards and a "Words used here" panel. A test keeps them short and free of jargon.

### `lib/async.ts`

`createSharedCache` lets several callers share one in-flight request. It cancels the request only when every caller has aborted, and it never caches failures. `createLimiter` provides concurrency limits that skip cancelled work, and `withRetry` adds back-off for 5xx and 429 responses.

### Components

- `components/map`:
  - `BaseMap` is the shared Leaflet setup.
  - `GibsTileLayer` and `LayerStack` show a science layer over a dimmed Blue Marble so gaps still show context.
  - `ReferenceOverlays` draws the bundled Natural Earth 1:50m country outlines (borders and coastlines, `public/data/countries-50m.json`, built by `scripts/build-borders.mjs`) on one canvas, cyan over a soft dark edge so they stay visible over clouds. Each outline carries its name and 3-letter code; `lib/geo/countries.ts` loads them once and answers "which country is here?" (`countryAt`) and "which outline is this code?" (`findCountry`). There are no label tiles: CARTO's need a key and NASA's `Reference_Labels_15m` come back as solid black tiles.
  - `DrawTools` and `DrawToolbar` provide pointer-based rectangle, circle and polygon drawing, with no plugin, and a "Pick a country" mode (`CountryPickTool`: hover highlight with the name, click to select). On Trends the same tool also picks the sea or ocean under the pointer (`onPickWater`), which is the same as naming it. On Explore/Split/Sync a picked country is saved as a named area; on Analysis it becomes `?country=UZB` (a shareable link resolved from the bundled outlines).
  - `ValueProbe` handles click-to-read.
  - `SwipeClip` clips Leaflet panes for the comparison divider.
  - Also here: the legend, date control, layer picker and the shared page shell.
- `components/search`: `PlaceSearch` (an ARIA combobox used on the landing page, map sidebars and the analysis picker) and `GlobalSearch` (the <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> palette for places and layers).
- `components/analysis`: location picker (search, location, mini map with click-to-pick and drawing, radius, saved areas), period and dataset controls, Recharts charts, the report panels, and `PlaceThumbnail` (a GIBS Blue Marble image of the place with its outline, used in the report header).

### State

- `WorkspaceContext` holds saved areas and the last map view, persisted to `localStorage` behind safe wrappers (`lib/storage.ts`), so the app still works in private windows.
- `AuthContext` uses a local "Explorer" profile in demo mode. With `VITE_API_BASE_URL` set, it calls `/auth/*` through `lib/apiClient.ts`.

### Look and feel

The design is the original TerraView design from the GitHub version, unchanged where it existed:

- The theme colours in `src/index.css` are the original ones: a dark "space" theme, `gradient-hero`, `glass` and `glass-strong` cards, `gradient-primary` + `glow-primary` buttons and `font-display` (Space Grotesk) headings.
- The landing, sign-in, 404 and Analysis pages use these theme classes, exactly as the GitHub pages did.
- The map pages (Explore, Split, Sync) use the original navy-and-cyan sidebar (`bg-[#07111d]`, `border-white/10`, `text-slate-*`, `text-cyan-400`), with the floating top row, Quick regions, the info card, Selected areas, the bottom Explore/Split/Sync ribbon, vertical draw tools and bright cyan country borders.
- Search lives in the top navigation bar (`components/search/NavSearch.tsx`), where the old "World" picker was. Ctrl/⌘K and "/" focus it; on phones the search icon opens `GlobalSearch`. Both share `useUniversalSearch`.
- Additions that don't change the look: a keyboard-only focus ring, `prefers-reduced-motion` support, a `skeleton` shimmer for loading placeholders and a fade between pages.
- **Light and dark mode.** Every visit starts in dark mode (`class="dark"` on `<html>`); the sun/moon button in the navbar switches, and the choice is not saved. `src/context/ThemeProvider.tsx` holds the state; `useTheme()` comes from `src/context/theme.ts`.
  - Colours are CSS variables: light values in `:root`, the original dark values in `.dark` (`src/index.css`). The map-page chrome uses `panel-*`, `accent-cyan` and `tone-*` tokens (navy/cyan in dark, white/teal in light); map controls use `--lf-*`.
  - The landing hero keeps the `dark` class in both modes, because it shows Earth in space.
  - Chart greys come from `useChartColors()` in `components/analysis/Charts.tsx` (SVG attributes can't read CSS variables).
  - Both modes pass axe WCAG 2.1 AA on every page.

## Design decisions

- **Say when it isn't significant.** Every rate comes with its 95% range and a test. "No clear trend" is a result, shown as plainly as a significant one, with a way to test a longer record.
- **Measure, don't simulate.** Every number on the Analysis page is decoded from NASA imagery or read from NASA POWER, and gaps stay gaps. The thresholds behind each finding are written into the finding itself.
- **Ask GIBS what exists.** Dates come from the live time domain and zoom limits from the matrix set, so the maps never request tiles that cannot exist.
- **Keyless and static.** The build is plain static files (Netlify config included). Optional services (accounts, AI briefing) are switched on with environment variables and never need secrets in the browser.
- **Polite to free services.** Searches are debounced, Nominatim calls are queued at one per second, and analysis requests are de-duplicated, cancelled when no longer needed, and concurrency-limited.
