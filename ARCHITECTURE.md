# Architecture

TerraScope is a single-page React app (Vite, TypeScript, Tailwind, shadcn/ui, react-leaflet, Recharts, three.js). There is no required backend: every map tile, measurement and search result comes straight from public NASA, NOAA and OpenStreetMap services, and the app's own state lives in the URL and on the device.

## Routes

| Path        | Page                     | What it does                                                         |
| ----------- | ------------------------ | -------------------------------------------------------------------- |
| `/`         | `Landing`                | A pinned NASA globe and a scroll story of three measured findings    |
| `/map`      | `Explore`                | One map: layer, date, search, click-to-read values, drawing           |
| `/split`    | `SplitView` ("Compare")  | One map, two layers or dates, draggable divider                       |
| `/sync`     | `SyncView` ("Side by side") | Two maps locked together                                          |
| `/trends`   | `Trends` ("Trend detective") | Choose a measure, place and period; hotspot scan, trend tests, demos |
| `/atlas`    | `Atlas`                  | Where six measures changed most worldwide, measured ahead of time      |
| `/analysis` | `Analysis`               | Measured report for a place, area or point, with trend tests          |
| `/login`    | `Login`                  | Accounts when `VITE_API_BASE_URL` is set; explains demo mode otherwise |
| `*`         | `NotFound`               | 404                                                                   |

Pages are lazy-loaded and each one is wrapped in an error boundary (`App.tsx`). The map and analysis routes sit behind `RequireAuth`, which lets everyone through in demo mode.

**The URL is the state.** Layer, date and view (`/map?layer=…&date=…&lat=…&lon=…&z=…`), both sides of a comparison (`left`, `right`, `leftDate`, `rightDate`, `link`), the analysis target, period, months and datasets (`osm`, `area`, `lat/lon/r`, `bbox`, `period`, `start/end`, `base/recent`, `season`, `ds`), and a trend search (`q`, `ind`, `dir`, `f`, `place`, `country/osm/poly`, `t`, `season`, `tab`, `mode`) are all query parameters. Any view can be shared or bookmarked, and the back button works.

## Modules

### `lib/gibs` — NASA GIBS

- `catalog.ts` lists every layer with its WMTS matrix set. The matrix set also gives the deepest zoom GIBS serves; Leaflet scales tiles up past it instead of requesting tiles that would fail. Each entry also records the period (daily, 8-day, 16-day, monthly, yearly or static), the colormap name and the unit conversion (Kelvin to °C). 40 of the 47 layers make up the picker: the daily photos and science maps, the monthly records Trends and the Analysis page read (rainfall, soil moisture, ozone, methane, salinity…) and the yearly land cover. The other 7 are monthly copies of a listed layer (`hidden`), which the analysis still reads. A coarse layer records its pixel size (`pixelKm`), shown with a note that close up it shows as squares; land cover names its categories (`classes`, NASA's legend). The map pages read monthly records month by month (`resolveForLayer`), since NASA's date lists for some of them have stray single days with gaps between, and date them as people say them (`formatLayerDate`: “Aug 2026”).
- `time.ts` fetches each layer's `DescribeDomains` document and resolves a requested date to one that exists: exact, snapped to the 8- or 16-day composite, nearest across a gap, or clamped to the earliest or latest. The default date for daily layers is yesterday, or two days back for the night band.
- `colormap.ts` parses NASA's colormap XML (v1.3) into a lookup from exact RGB to value, plus a legend. `decodePixel` turns a pixel back into a number. Transparent and no-data entries become `null`, and a nearest-color fallback covers anti-aliased edges.
- `sample.ts` builds WMS GetMap requests (EPSG:4326, so 1.3.0 axis order is latitude first) sized to the layer's native resolution. It rasterizes outlines through `coverCells` in `lib/geo/combine.ts` (scanline, even-odd within each polygon, so holes work; a pixel inside any polygon counts once, so the overlapping parts of a combined area never cancel out) and reduces the decoded pixels to mean, median, p10, p90, standard deviation and coverage. `probePoint` reads one value for click-to-read.

### `lib/geo` — places and shapes

- `geocode.ts` turns typed text into results in this order: coordinates (several notations), then the seas, oceans and named regions TerraScope knows the shape of (`regions.ts`; OpenStreetMap only has a point for them, which is left out), then Photon (built for search-as-you-type), then Nominatim as a fallback. Boundaries, OSM lookups and reverse geocoding go through Nominatim, queued to one request per second. Results are classified (country, state, region, city, water, nature…), which decides the icon, the zoom for point-only results and the analysis radius; villages are told apart from towns by their OpenStreetMap tag (Photon files both as “city”), and `typeLabel` gives the closer word shown (Village, Lake, Airport). A result named exactly what was typed is ranked first. OpenStreetMap's copies of a known region, and islands named like a country found with them, are left out; shops and streets show only when nothing else is found. Short country names (`countryNames.ts`: USA, UK, UAE, Burma…) also search the full name, and every country found gets its code in the bundled outlines, so the Analysis page, Trends and the map read its land, not OpenStreetMap's boundary with its coastal waters.
- `geometry.ts` covers geodesic area (spherical excess), point-in-polygon with holes, centroids and a guaranteed interior point, geodesic circles, and well-spread sample points for climate averaging.

- `regions.ts` lists the continents, named regions (Western Europe, Southeast Asia, the Balkans, Central Asia, the Aral Sea, the Pamirs…) and, from `waters.ts`, the seas and oceans. `regionGeometry` gives a region's shape: a sea's water, a box (for mountains and deserts, which have no agreed edge), or its countries together. A region lists country codes, where `"RUS:europe"` keeps only that country's land on that continent, or whole continents less some countries (Sub-Saharan Africa). Each can carry a `note` in plain words on how it was drawn, shown under its name in the Trends form. Search, the Trends form, the Analysis page (`?region=`) and saved areas all refer to them by name.
- `continents.ts` makes the continents from the bundled country outlines: countries by the UN's list of world regions (M49), lands overseas placed by where they are (`AWAY`: French Guiana, Réunion…), and Russia and Kazakhstan cut along `EUROPE_ASIA_LINE` (the Urals, the Ural River, the Caspian). Land across the 180° line and a few remote islands are left out (`LEFT_OUT`, `AWAY` with no continent), so no continent wraps around the globe. Results are kept per outline set.
- `clip.ts` cuts one polygon by another (Greiner and Hormann's method), keeping both outlines' points exactly. A corner lying exactly on the cutting line nudges the line by about a centimetre and tries again.
- `combine.ts` reads several places as one area: their outlines side by side in one shape (`combineGeometries`), their names joined ("Uzbekistan + Kazakhstan", `combinedName`) and their size with shared land counted once (`combinedAreaKm2`: each part's exact size, minus any overlap measured on a fine grid; neighbouring countries only touch, so their sizes simply add up).
- `waters.ts` keeps rough outlines of seas and oceans. Neighbouring waters share edges drawn through the land between them (the Americas between the Atlantic and the Pacific), so `waterAt` finds the right one under a click. Their water areas — outline minus Natural Earth land, and for oceans minus the enclosed seas — are built by `scripts/build-waters.ts` (`npm run data:waters`, no download) into `public/data/waters.json` (0.2 MB) and loaded when needed. The Pacific comes in two halves because a scan can't wrap around the 180° line.

### `lib/areas` — places added together

- `parts.ts` describes each place of a combined area (a country, a sea or region, a place typed by name, an OpenStreetMap boundary, a drawn outline, a circle, a box, or a saved area) and how it is written in a page address: the first in the page's usual keys (`?country=`, `?region=`, `?osm=`, `?poly=`…), every other one as an `?add=` entry such as `add=country:KAZ!Kazakhstan` or `add=region:Black Sea`. Picking a place that is already in takes it out again. Saved areas go into links by name or outline when they can, so a link works on any device.
- `resolve.ts` loads each part's outline (bundled countries and seas need no network; OpenStreetMap is asked once, then cached) and joins the parts (`combineParts`). An area is water only when every part is a sea or ocean.
- `hooks/useResolvedParts.ts` loads the added parts on a page; `useAnalysisTarget` joins them with the first place (`withAddedParts`), and the Trends scan does the same (`areaFor` in `useTrendScans`).
- On Analysis and Trends, "Add another place" turns on adding: search results, map clicks, drawn shapes, countries and seas picked one after another, known regions and saved areas then join the area instead of replacing it. Each place is listed with its size and a button to take it out. On Explore, Split and Sync, "Combine" in Your areas saves ticked areas as one new area (the originals stay). Climate on Analysis is read at one point or more in every place (`climatePoints` in `run.ts`, up to eight).

### `lib/query` — measures and periods

- `indicators.ts` lists the 29 measures: GIBS layer, unit, smallest change worth flagging, native resolution, usual season, the worrying direction, the surface it is read on (land, water or any), its picker group and, when the record isn't the whole satellite era, its first and last month.
- `period.ts` turns a time choice into baseline and recent windows and the years to read, within a budget of monthly maps.

### `lib/trends` — the trend detective

- `query.ts` is the search as URL state: the form ⇄ the address (every combination round-trips; tested), and the sentence written from the choices. Places added to the chosen one are `extra` (`?add=`); `trendParts` lists every place and `editForParts` makes a list of places the search's area.
- `grid.ts` fetches one month of a layer as a decoded grid (cached on the device) and the land/water mask (OSM land/water map).
- `pixels.ts` gives each pixel a seasonal mean per year, its change, and a Mann–Kendall p-value and Sen's slope, corrected for carry-over from one year to the next where the pixel's own years show it.
- `hotspots.ts` flags pixels, groups them into 8-connected patches, ranks them and traces outlines. "Only clear trends" sets the pixel cut-off from every pixel's p-value at once (`pixelCutoff`: Benjamini–Hochberg, 5% false discovery rate).
- `scan.ts` runs a scan:
  - availability, then the monthly maps (6 at a time), one map a year first (`firstLookMonths`, `readingOrder`) so a provisional answer (`ScanProgress.preview`, shown by `components/trends/FirstLook.tsx`) is ready within seconds
  - the masks, then the per-pixel trends and the hotspots
  - the whole-area series and verdict, and the top-of-colour-scale note
  - finer re-reads of the top hotspots for large areas
  - `rebuildHotspots` regroups the pixels for new filters without network.
- `landcover.ts` reads NASA's yearly MODIS land cover, groups the 17 classes by NASA's own class names, and suggests measures by fixed rules. It is read one year at a time and never compared across years: NASA's user guide advises against measuring change that way.
- `place.ts` resolves a place: named regions, seas and oceans, countries from the bundled outlines, otherwise OpenStreetMap (found places are kept for the session, so the preview and the scan ask once). A sea or ocean is its water only: air measures are read over that water, and land measures there are refused with a plain explanation before any map is read (`surfaceFor`, `mismatch` in `scan.ts`).

### `lib/analysis` — the report

- `run.ts` orchestrates a run. For each satellite dataset it takes the months that exist in the GIBS time domain, samples them through a shared, abortable cache with a concurrency limit of 6, and retries server errors. Climate comes from NASA POWER monthly and climatology requests at the sample points (limit 3). Satellite datasets are read one after another (they share the limit, so this takes no longer) and each finished dataset is handed to `onPartial`, so the report fills in as data arrives. Progress is reported per step and per dataset, and changing the target or period cancels the previous run.
- `power.ts` parses POWER responses (`-999` means no data; month `13` is the annual value and is dropped) and averages across sample points.
- `stats.ts` provides means, extremes and year-over-year change. It also has the statistics behind every verdict, checked against textbook values:
  - the Mann–Kendall test (tie-corrected, plus a seasonal version)
  - Sen's slope with its confidence range (Gilbert 1987)
  - the carry-over correction (`lag1Autocorrelation`, `carryOverFactor`: Yue and Wang 2004, applied only when the lag-1 autocorrelation of the detrended years is clearly above zero) and years-to-detect (`yearsToDetect`: Weatherhead et al. 1998)
  - the false discovery rate (`falseDiscoveryThreshold`: Benjamini–Hochberg)
  - Welch's t-test and plain-language verdicts
- `aggregate.ts` turns monthly values into one value per (season) year and compares two periods. `period.ts` reads periods, comparisons and months from the URL. `trend.ts` runs a trend test or comparison for every measure of a report and suggests testing the whole record when a short one shows no clear trend.
- `insights.ts` writes the answer from the trend tests alone (one hot month or a dry spell can't change it), a note on how far to trust it, the latest months against the 2001–2020 normal, and caveats. It has no randomness and no language model.
- `export.ts` produces the CSV: one row per month read, blank where there is no data, with the trend results as header lines. `printReport` opens the browser's print dialog with the page in its light colours (`print:` styles hide the controls and navigation), so "Save as PDF" gives a report on white paper.
- `../analysisClient.ts` is optional: when `VITE_AI_ANALYSIS_ENDPOINT` is set, the measured findings are sent there for a short AI-written briefing shown next to the built-in summary.

### `lib/stations` — checked against the ground

- `ncei.ts` asks NOAA's free search service for Global Summary of the Month stations within 75 km of the place (`stationSearchUrl`, `parseStationSearch`), then reads their monthly mean temperature and rainfall in metric units (`stationDataUrl`, `parseStationData`). Answers are cached like NASA's series, and requests go through the shared limiter.
- `groundCheck.ts` turns a station's months into years: each month becomes a departure from that station's own average for the calendar month, and a year needs at least half its months (`stationYearly`). `compareWithStations` picks the station with the most years shared with NASA's record (at least 10), tests both over the same years, calls them in agreement when their 95% ranges overlap, and adds how closely the years follow each other (Pearson r). `groundCheckText` says it in a sentence, naming the years and the station.
- `hooks/useGroundCheck.ts` runs it once an Analysis report is in; `components/analysis/GroundCheck.tsx` shows "Checked against the ground" with both lines on one chart, or says why there is no station to compare with.

### `lib/atlas` — the world change atlas

`scripts/measure-atlas.browser.js` runs the app's own scanner over 60°S–80°N for six measures, every month of every year since 2003, on a half-degree grid. Where widespread change joins into continent-sized patches, it raises the smallest change step by step until the biggest patch is a region, and saves the bar it used. It saves each change map as a PNG (`public/data/atlas`) and the verdicts, patches and names as `atlasData.ts`. `atlas.ts` gives them types, the legend scale (`atlasScale`) and the Trends search for each patch (`atlasTrendsHref`). `pages/Atlas.tsx` draws the map with the Trends page's own layers (`GridImageLayer`, `HotspotLayer`, `TrendLegend`).

### `lib/causes` — possible causes

Runs only when someone asks, and only for a clear change in a measure that has causes to test (plants, ground heat, water, snow, dust: `familyOfIndicator`, `familyOfMetric`).

- `model.ts` holds the statistics, all pure functions:
  - `weatherCheck` fits the measure to two kinds of weather by least squares, scores the fit on years left out one at a time, and splits the measure's trend into the weather's share and what's left (`leftOver` needs a clear trend that is also at least a tenth of the measure's own).
  - `changeShape` tries every split year and calls a jump when two flat levels beat a straight line by half and differ clearly (Welch's t-test, Bonferroni over the splits).
  - `judgeFire` and `judgePeople` grade the fire days and the population change.
- `rules.ts` holds the fixed rules: which weather each kind of measure is tested against (`FAMILY_DRIVERS`), when fires and people apply, the human causes that fit the land (`fitsWith`), and `possibleCauses`, which ranks up to three causes by strength and writes every sentence and check line.
- `gather.ts` reads the data: NASA POWER through the Analysis page's shared cache (`readPowerMonthly`); fire days from MODIS fire detections in GIBS (one small picture per day, one day in eight then every day around a fire, only after a sudden change); population from SEDAC's maps in GIBS; and land cover for the year before the change. Each check fails on its own without stopping the others, and cancelling stops them all.
- `requests.ts` builds a request from an Analysis trend or a Trends area or hotspot, or gives the reason it can't run (fewer than 8 years).
- `hooks/usePossibleCauses.ts` runs a look on request and keeps finished answers for the visit, so the phone and desktop copies of a hotspot card share them. `components/causes/PossibleCauses.tsx` shows the section in the panel and page styles.

### `lib/demo` and `components/demo`

`scripts.ts` holds three worked examples as steps. Each step has a caption, a page part to point at (a typed `data-demo` target), an optional action (fill in a choice, run, filter, open a hotspot) and an optional wait for NASA data. `DemoPlayer` plays them with a spotlight, Back/Next/Play and Esc to leave. The Trends page gives it a small set of controls.

### `lib/glossary.ts`

Plain one- or two-sentence definitions of every measure and of the statistics words, shown in the measure picker, the result tabs, the Analysis report and a "Words used here" panel. A test keeps them short and free of jargon.

### `lib/async.ts`

`createSharedCache` lets several callers share one in-flight request. It cancels the request only when every caller has aborted, and it never caches failures. `createLimiter` provides concurrency limits that skip cancelled work, and `withRetry` adds back-off for 5xx and 429 responses.

### Components

- `components/map`:
  - `BaseMap` is the shared Leaflet setup.
  - `GibsTileLayer` and `LayerStack` show a science layer over a dimmed Blue Marble so gaps still show context.
  - `ReferenceOverlays` draws the bundled Natural Earth 1:50m country outlines (borders and coastlines, `public/data/countries-50m.json`, built by `scripts/build-borders.mjs`) on one canvas, cyan over a soft dark edge so they stay visible over clouds, snow and desert. Each outline carries its name and 3-letter code; `lib/geo/countries.ts` loads them once and answers "which country is here?" (`countryAt`) and "which outline is this code?" (`findCountry`). There are no label tiles: CARTO's need a key and NASA's `Reference_Labels_15m` come back as solid black tiles.
  - `DrawTools` and `DrawToolbar` provide pointer-based rectangle, circle and polygon drawing, with no plugin, and a "Pick a country" mode (`CountryPickTool`: hover highlight with the name, click to select). On Trends the same tool also picks the sea or ocean under the pointer (`onPickWater`), which is the same as naming it. On Explore/Split/Sync a picked country is saved as a named area; on Analysis it becomes `?country=UZB` (a shareable link resolved from the bundled outlines).
  - `MapDetails` (inside `ReferenceOverlays`) adds what a map shows besides imagery: country and sea names, a latitude and longitude grid with degrees along the edges, a scale bar, and a readout of the coordinates and place under the cursor. It uses only bundled data, and the choices it makes (`lib/map/details.ts`) keep names whole and apart. A map too small for it can turn it off (`details={false}`).
  - `ValueProbe` handles click-to-read.
  - `SwipeClip` clips Leaflet panes for the comparison divider.
  - Also here: the legend, date control, layer picker and the shared page shell.
- `components/search`: `PlaceSearch` (an ARIA combobox used on the landing page, map sidebars and the analysis picker) and `GlobalSearch` (the <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> palette for places and layers).
- `components/analysis`:
  - `AnalysisMap`, the page's big map, where a place is chosen: click for a circle around a point, draw a shape, or pick countries and seas. With no place yet the page shows only this map, with a "Pick a place to start" card. Once there is a place, a Map / Report switch at the top moves between it and the report. Picking a place opens its report; while places are being added the map holds still and nothing is read until "Done adding".
  - `LocationPicker`, the sidebar's choices without the map: search, your location, radius, saved areas, and the places of a combined area with "Add another place".
  - Period and dataset controls, Recharts charts, the report panels, and `PlaceCover` (the report's cover: a GIBS Blue Marble image of the place with its outline).

### State

- `WorkspaceContext` holds saved areas (drawn, picked, found or combined; `combineAreas` saves several as one) and the last map view, persisted to `localStorage` behind safe wrappers (`lib/storage.ts`), so the app still works in private windows.
- `AuthContext` uses a local "Explorer" profile in demo mode. With `VITE_API_BASE_URL` set, it calls `/auth/*` through `lib/apiClient.ts`.

### Look and feel

Every page uses the home page's design, built from a few parts in `src/index.css`:

- **Colour means something.** The interface is near-black or warm paper, with hairlines and neutral ink. Colour is kept for tested results: amber for a change that worries, green for a welcome one, plain ink for a neutral one, grey for no clear change (`components/analysis/tone.ts`).
- **Three typefaces.** Instrument Serif for headlines (`font-editorial`), JetBrains Mono for small labels and numbers (`.eyebrow`, `.field-label`), Inter for everything else.
- **One main action.** The white pill (`.btn-solid`) marks the one thing to do next; quieter actions use `.btn-line` and `.link-quiet`. A selected choice is inverted (`.chip-on`, `.segment-on`).
- **One layout.** A 24rem panel on the left and a map or report beside it. Map pages share `components/map/MapPageShell.tsx`, which also fades the map's edges into the dark. On a map, cyan is a country border and white is always your own chosen area. Trends' panel shows either the search form or its results, never both.
- **The report opens on the planet.** `components/analysis/PlaceCover.tsx` shows NASA's Blue Marble of the place with its real outline. The 404 and error pages use the planet's edge (`components/common/PlanetLimb.tsx`).
- **Touch.** Controls grow to 44 px on touch screens through the `pointer-coarse:` variant, defined in `tailwind.config.ts`.
- **Motion.** Keyboard-only focus ring, `prefers-reduced-motion` support, a `skeleton` shimmer for loading placeholders and a fade between pages.
- **Search** lives in the top navigation bar (`components/search/NavSearch.tsx`). Ctrl/⌘K and "/" focus it; on phones the search icon opens `GlobalSearch`. Both share `useUniversalSearch`, which puts NASA layers first when the words are a layer's own name (`layerMatchScore`). The Trends “Where” box is a `PlaceSearch` too: the place picked is kept by its OpenStreetMap id or country code, and a place typed into a link is resolved by name, the exact name first (“Samarkand” is the city, not its province).
- **Light and dark mode.** Every visit starts in dark mode (`class="dark"` on `<html>`); the sun/moon button in the navbar switches, and the choice is not saved. `src/context/ThemeProvider.tsx` holds the state; `useTheme()` comes from `src/context/theme.ts`.
  - Colours are CSS variables: light values in `:root`, dark in `.dark` (`src/index.css`).
  - The planet, the report cover and the home hero keep the `dark` class in both modes, because they show Earth in space.
  - Chart colours come from `useChartColors()` in `components/analysis/Charts.tsx` (SVG attributes can't read CSS variables).

## Design decisions

- **Say when it isn't significant.** Every rate comes with its 95% range and a test. "No clear trend" is a result, shown as plainly as a significant one, with a way to test a longer record.
- **Possible causes, never proof.** The cause finder lists what fits the measured evidence, with how strong it is, every check it ran, and what it can't measure. Its rules are written down and tested; there's no trained model, because there is no worldwide record of true causes to train one on honestly.
- **Nothing heavy starts by itself.** Reading NASA's maps takes minutes the first time, so the Analysis page reads only after **Start the analysis** (showing the maps it will read and the time first, with Stop while it runs), and a Trends link opens with its search filled in until **Find changes**. Buttons that say they scan (a worked example, "Scan inside", "Test every year since 2000") start straight away.
- **Measure, don't simulate.** Every number on the Analysis page is decoded from NASA imagery or read from NASA POWER, and gaps stay gaps. A verdict comes from a stated test, never from a fixed threshold on one month's value.
- **Ask GIBS what exists.** Dates come from the live time domain and zoom limits from the matrix set, so the maps never request tiles that cannot exist.
- **Keyless and static.** The build is plain static files (Netlify config included, with safe browser headers and long caching for the globe pictures). Fonts are bundled, so no font service is contacted. Optional services (accounts, AI briefing) are switched on with environment variables and never need secrets in the browser.
- **Check against an independent record.** NASA's model and satellite records are compared with ground weather stations wherever one is near, and a disagreement is shown, not hidden.
- **Measure ahead where it can't be fast.** A whole-world scan reads thousands of maps, too many for a visitor to wait for, so the atlas is measured with the same code ahead of time and bundled with the date it was measured.
- **Polite to free services.** Searches are debounced, Nominatim calls are queued at one per second, and analysis requests are de-duplicated, cancelled when no longer needed, and concurrency-limited.
