# Architecture

TerraVision is a single-page React app (Vite, TypeScript, Tailwind, shadcn/ui, react-leaflet, Recharts, three.js). There is no required backend: every map tile, measurement and search result comes straight from public NASA and OpenStreetMap services, and the app's own state lives in the URL and on the device.

## Routes

| Path        | Page                     | What it does                                                         |
| ----------- | ------------------------ | -------------------------------------------------------------------- |
| `/`         | `Landing`                | Globe, hero search, entry points                                     |
| `/map`      | `Explore`                | One map: layer, date, search, click-to-read values, drawing           |
| `/split`    | `SplitView` ("Compare")  | One map, two layers or dates, draggable divider                       |
| `/sync`     | `SyncView` ("Side by side") | Two maps locked together                                          |
| `/analysis` | `Analysis`               | Measured report for a place, area or point                            |
| `/login`    | `Login`                  | Accounts when `VITE_API_BASE_URL` is set; explains demo mode otherwise |
| `*`         | `NotFound`               | 404                                                                   |

Pages are lazy-loaded and each one is wrapped in an error boundary (`App.tsx`). The map and analysis routes sit behind `RequireAuth`, which lets everyone through in demo mode.

**The URL is the state.** Layer, date and view (`/map?layer=…&date=…&lat=…&lon=…&z=…`), both sides of a comparison (`left`, `right`, `leftDate`, `rightDate`, `link`), and the analysis target, period and datasets (`osm`, `area`, `lat/lon/r`, `bbox`, `period`, `start/end`, `ds`) are all query parameters. Any view can be shared or bookmarked, and the back button works.

## Modules

### `lib/gibs` — NASA GIBS

- `catalog.ts` lists every layer with its WMTS matrix set. The matrix set also gives the deepest zoom GIBS serves; Leaflet scales tiles up past it instead of requesting tiles that would fail. Each entry also records the period (daily, 8-day, 16-day, monthly, yearly or static), the colormap name and the unit conversion (Kelvin to °C). The visible layers make up the picker; four hidden monthly products feed the analysis.
- `time.ts` fetches each layer's `DescribeDomains` document and resolves a requested date to one that exists: exact, snapped to the 8- or 16-day composite, nearest across a gap, or clamped to the earliest or latest. The default date for daily layers is yesterday, or two days back for the night band.
- `colormap.ts` parses NASA's colormap XML (v1.3) into a lookup from exact RGB to value, plus a legend. `decodePixel` turns a pixel back into a number. Transparent and no-data entries become `null`, and a nearest-color fallback covers anti-aliased edges.
- `sample.ts` builds WMS GetMap requests (EPSG:4326, so 1.3.0 axis order is latitude first) sized to the layer's native resolution. It rasterizes polygon outlines (scanline, even-odd, so holes and multipolygons work) and reduces the decoded pixels to mean, median, p10, p90, standard deviation and coverage. `probePoint` reads one value for click-to-read.

### `lib/geo` — places and shapes

- `geocode.ts` turns typed text into results in this order: coordinates (several notations), then Photon (built for search-as-you-type), then Nominatim as a fallback. Boundaries, OSM lookups and reverse geocoding go through Nominatim, queued to one request per second. Results are classified (country, state, region, city, water, nature…), which decides the icon, the zoom for point-only results and the analysis radius.
- `geometry.ts` covers geodesic area (spherical excess), point-in-polygon with holes, centroids and a guaranteed interior point, geodesic circles, and well-spread sample points for climate averaging.

### `lib/analysis` — the report

- `run.ts` orchestrates a run. For each satellite dataset it takes the months that exist in the GIBS time domain, samples them through a shared, abortable cache with a concurrency limit of 6, and retries server errors. Climate comes from NASA POWER monthly and climatology requests at the sample points (limit 3). Progress is reported per step, and changing the target or period cancels the previous run.
- `power.ts` parses POWER responses (`-999` means no data; month `13` is the annual value and is dropped) and averages across sample points.
- `stats.ts` provides means, extremes, year-over-year change and a seasonally adjusted trend (a within-month regression, so the seasonal cycle cannot leak into the slope).
- `insights.ts` turns the numbers into a headline, a summary, findings, indicators and caveats using fixed thresholds that are stated in the text. It has no randomness and no language model.
- `export.ts` produces the CSV (one row per month, blank where there is no data).
- `../analysisClient.ts` is optional: when `VITE_AI_ANALYSIS_ENDPOINT` is set, the measured findings are sent there for a short AI-written briefing shown next to the built-in summary.

### `lib/async.ts`

`createSharedCache` lets several callers share one in-flight request. It cancels the request only when every caller has aborted, and it never caches failures. `createLimiter` provides concurrency limits that skip cancelled work, and `withRetry` adds back-off for 5xx and 429 responses.

### Components

- `components/map`:
  - `BaseMap` is the shared Leaflet setup.
  - `GibsTileLayer` and `LayerStack` show a science layer over a dimmed Blue Marble so gaps still show context.
  - `ReferenceOverlays` adds the bundled borders and NASA GIBS place labels (`Reference_Labels_15m`, no key).
  - `DrawTools` and `DrawToolbar` provide pointer-based rectangle, circle and polygon drawing, with no plugin.
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

## Design decisions

- **Measure, don't simulate.** Every number on the Analysis page is decoded from NASA imagery or read from NASA POWER, and gaps stay gaps. The thresholds behind each finding are written into the finding itself.
- **Ask GIBS what exists.** Dates come from the live time domain and zoom limits from the matrix set, so the maps never request tiles that cannot exist.
- **Keyless and static.** The build is plain static files (Netlify config included). Optional services (accounts, AI briefing) are switched on with environment variables and never need secrets in the browser.
- **Polite to free services.** Searches are debounced, Nominatim calls are queued at one per second, and analysis requests are de-duplicated, cancelled when no longer needed, and concurrency-limited.
