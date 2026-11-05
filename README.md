# TerraScope

**An Earth system trend detective, built on NASA data.** Ask "where did vegetation decline in Uzbekistan since 2015?" or "is the Mediterranean getting warmer?", or pick a measure, a place and the years yourself. TerraScope reads one NASA map per month, tests every pixel and the whole area for a real trend, ranks the places that changed most, and says plainly when a change is *not* significant.

Built for the NASA Space Apps Challenge 2026, **Be an Earth System Trend Detective**. Everything runs in the browser against public NASA and OpenStreetMap services: no API keys, no backend, no simulated numbers.

**Try it:** `npm install && npm run dev`, open the app and press **Watch a demo** on the home page. Three worked examples play through the app with live NASA data (script for presenters: [DEMO.md](DEMO.md)).

## How TerraScope meets the challenge

| The challenge asks for… | Where it is in TerraScope |
| --- | --- |
| **Variables that may be trending** | 13 measures on land, in the air, at sea and in the upper atmosphere (table below), each with a one-line plain definition. A question reader turns everyday words ("drought", "ozone hole shrinking", "SO2", "warmer seas") into measures. Things NASA's monthly maps can't show (sea level, NO₂, river flow, fires…) are named as such, with the closest real measures offered. **"What changed?"** picks the measures that suit the place from NASA's land cover map: dust and heat for deserts, surface heat and SO₂ for cities, sea temperature for seas. |
| **Data for a particular region** | Any country or sea clicked on the map (“Country or sea”), any place with an OpenStreetMap boundary, a known region, sea or ocean from a list (Aral Sea, Pamirs, Central Asia, Mediterranean, the Atlantic and Pacific halves…), a rectangle, polygon or circle drawn on the map, a saved area, or the map view. A place is outlined, and its land cover described, as soon as it is chosen. Land measures leave out lakes and seas, sea measures leave out land, and air measures cover both, except over a named sea, where only its water is read. A measure that can't be read in a place (vegetation over open ocean, sea temperature over a landlocked country) is explained before any map is read. |
| **A time series long enough for statistics** | Monthly NASA maps from 2000 (MERRA-2 records reach back to 1980; the scan starts at the MODIS era). Each pixel and each area become one value per year for the chosen months, so the seasonal cycle can't fake a trend. Year-by-year charts for the whole area and every hotspot, a monthly animation on the map, monthly charts on the Analysis page, and a CSV download. |
| **Rate of change and significance** (t-test, Mann–Kendall, confidence intervals) | **Mann–Kendall** trend test (tie-corrected; seasonal version for monthly data) and **Sen's slope** with its **95% confidence range**, per year and per decade, for the whole area, every hotspot and every pixel. **Welch's t-test** when comparing two periods (e.g. 2001–2010 vs 2016–2025). When a trend isn't significant, TerraScope says so and offers to test the whole record. |

The challenge's other suggestions are covered too:
- **Audience: students and the public.** Plain words throughout, a "What does each one measure?" list, and a "Words used here" glossary of trend, p-value, 95% range, Sen's slope and the rest.
- **A short series of questions about what and where.** "Choose step by step" mode: what to measure, where, when and which months, without typing.
- **Demonstration examples users can watch.** Three guided demos with live data.
- **Data that suits a kind of place.** Land-cover-based suggestions, made by fixed written rules rather than AI.
- **Seasonal cycles removed.** Seasonal statistics and same-months-every-year comparisons.
- **"A trend is interesting even if it doesn't reach significance."** Every rate is shown with its range, and there's a one-click "test every year since 2000".

## The measures

| Group | Measure | NASA product | Record |
| --- | --- | --- | --- |
| Land | Vegetation (NDVI) | MODIS Terra monthly NDVI (MOD13A3), ~1 km | 2000– |
| Land | Surface heat | MODIS Terra monthly daytime land surface temperature (MOD11C3), ~5 km | 2000– |
| Land | Soil moisture | MERRA-2 root-zone soil water, ~50 km | 1980– |
| Land | Snow cover | MODIS Terra monthly snow cover (MOD10CM), ~5 km | 2000– |
| Land | Evaporation | MERRA-2 evaporation from land, ~50 km | 1980– |
| Air | Rainfall | MERRA-2 bias-corrected precipitation, ~50 km | 1980– |
| Air | Dust | MERRA-2 dust surface concentration, ~50 km | 1980– |
| Air | Air temperature (2 m) | MERRA-2 2-metre air temperature, ~50 km | 1980– |
| Air | Sulphur dioxide | MERRA-2 SO₂ column, ~50 km | 1980– |
| Air | Carbon monoxide (~5 km up) | AIRS (Aqua) CO at 500 hPa, ~100 km | 2002– |
| Air | Upper air (~10 km) | MERRA-2 air temperature at 250 hPa | 1980– |
| Air | Ozone layer (~20 km) | MERRA-2 ozone at 50 hPa | 1980– |
| Sea | Sea temperature | MODIS Terra night-time sea surface temperature, ~4 km | 2000– |

The Analysis page also reads NASA POWER (air temperature, rainfall, sunshine, humidity, wind and soil wetness, with 2001–2020 normals) and MERRA-2 aerosol optical depth. Land cover comes from MODIS yearly land cover type (IGBP classes, 2001–2024). Every layer, matrix set and colour scale was checked against NASA GIBS capabilities in November 2026.

**Examples measured with the app (5 November 2026):**
- Mediterranean Sea, night-time sea surface temperature 2003–2025: **+0.61 °C per decade**, 95% range +0.43 to +0.93, Mann–Kendall p < 0.001.
- Ozone at 50 hPa over Antarctica since 2005: a small rise (+0.009 ppm a year, p = 0.048), consistent with early signs of ozone-layer recovery.
- Uzbekistan growing-season NDVI since 2000: **no clear trend** for the country as a whole (p = 0.80), while hotspots on the dried-up Aral Sea shore show significant browning (Muynoq district: −0.0044 NDVI a year, 95% range −0.0060 to −0.0030, p < 0.001).

## How the trend detective works

1. **Reading the question.** A rule-based reader (`src/lib/query/parse.ts`) claims parts of the sentence in order: time, things it can't measure, measures, directions, then the place. Several measures and per-measure directions are supported ("vegetation decline and heat increase"). The form shows every choice, and editing it rewrites the sentence. An optional AI reader (`VITE_AI_ANALYSIS_ENDPOINT`) is only asked when the rules understand nothing.
2. **Reading NASA's maps.** For each month, a WMS image of the area is requested from NASA GIBS on a grid no finer than the product (at most 200 px on the long side) and turned back into physical values pixel by pixel using NASA's published colour scale. At most 180 monthly maps are read per measure (120 when scanning three or more); longer periods use evenly spread years, and the notes say so. Maps are cached on the device (IndexedDB) and requests are de-duplicated, cancelled when stale and limited to 6 at a time.
3. **Per-pixel trends.** Each pixel's chosen months become one value per year: the mean of the months measured, with at least half of them required. The change is the recent window minus the baseline window. The trend test is Mann–Kendall with Sen's slope. On the Analysis page, a year missing a month is adjusted using that month's own long-run mean.
4. **Hotspots.** Pixels that changed by at least the chosen amount, with their own trend pointing the same way (p < 0.1, or p < 0.05 with "Only clear trends"), are grouped into 8-connected patches. Patches are ranked by area × size of change, and very large areas are re-read finer for the top hotspots. The filters (direction, smallest change, smallest area, strictness) regroup the pixels already read, without new maps.
5. **The whole area and each hotspot.** An area-weighted yearly series gets a Mann–Kendall test, Sen's slope and its 95% range (Gilbert 1987), and a plain-language verdict.
6. **Analysis page.** For any place: monthly charts for every dataset, a trend card per measure (or a then-vs-now card with Welch's t-test), findings that lead with significant trends, and a CSV that includes the test results.

## Honest limits

- Values are decoded from the colour bins of NASA's map images, so their precision is that of the colour scale. When at least 5% of readings sit at the top of a scale (e.g. SO₂ over very polluted regions), the results say that real values and changes there may be larger.
- MERRA-2 is a reanalysis: a NASA model constrained by observations, at about 50 km. The MODIS products have cloud gaps, which are left as gaps. Sea temperature is night-time only, carbon monoxide is about 5 km up rather than at ground level, and SO₂ is the whole air column.
- Mann–Kendall assumes years are independent. Per-pixel tests are many tests at once, so hotspots also require a connected patch, a minimum change and a minimum area; "Only clear trends" tightens the test to p < 0.05.
- Land cover is classified by computer, so small shifts between years can be noise; the app says so where it shows them.
- Not measured, and the app says so: sea level, lake and river levels, groundwater, river flow, burned area, NO₂, CO₂, methane and ground-level ozone.

## Getting started

```sh
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:8080`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check of the app |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

## Environment variables (all optional)

Copy `.env.example` to `.env`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend for accounts. Accounts are switched off for now (`ACCOUNTS_ENABLED` in `src/config.ts`), so every page is open. |
| `VITE_AI_ANALYSIS_ENDPOINT` | Your own endpoint for two optional AI helpers: a briefing on the Analysis page, and reading a Trends question the built-in reader didn't understand. Everything works without it. |

Never put secrets (model API keys and the like) in `VITE_` variables: they end up in the browser bundle.

## Data sources

| Data | Source |
| --- | --- |
| Monthly maps, land cover, colour scales, time domains | [NASA EOSDIS GIBS](https://www.earthdata.nasa.gov/gibs): MODIS, MERRA-2, AIRS |
| Climate at points | [NASA POWER](https://power.larc.nasa.gov/) monthly and climatology API |
| Place search, boundaries | [OpenStreetMap](https://www.openstreetmap.org/copyright) via [Photon](https://photon.komoot.io/) and [Nominatim](https://nominatim.org/) (queued to one request a second) |
| Country outlines | [Natural Earth](https://www.naturalearthdata.com/) 1:50m (bundled in `public/data`) |
| Globe textures | three.js examples (day, clouds); NASA GIBS VIIRS Black Marble (night lights) |

## Project structure

```
src/
├── pages/            # Landing, Trends, Analysis, Explore, Split, Sync, 404
├── components/
│   ├── trends/       # Question box, form, area picker, land cover card, tabs, filters, whole-area and hotspot cards
│   ├── analysis/     # Location picker, period/months/dataset controls, charts, trend cards, report panels
│   ├── demo/         # The guided demo player
│   ├── common/       # Month picker, glossary
│   ├── map/          # Base map, GIBS layers, drawing, legends
│   └── search/       # Navbar search and the Ctrl/⌘K palette
├── lib/
│   ├── query/        # Question reader, measures, unmeasurable concepts, period planning
│   ├── trends/       # Monthly grids, land/sea masks, per-pixel trends, hotspots, scans, land cover, URL state
│   ├── analysis/     # Analysis engine, statistics (Mann–Kendall, Sen, Welch), trend tests, insights, CSV
│   ├── gibs/         # Layer catalog, time domains, colour-scale decoding, area sampling
│   ├── geo/          # Geometry, geocoding, country outlines, link-safe outlines
│   ├── demo/         # Demo scripts
│   └── glossary.ts   # Plain definitions of measures and statistics words
└── hooks/            # Trend scans, land cover, analysis runs, frames
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## Tests

```sh
npm run typecheck && npm run lint && npm test
```

The Vitest suite covers:
- the question reader (a golden table of about 60 questions)
- sentence ⇄ choices round trips
- URL state
- statistics against textbook values (Mann–Kendall, Sen's slope and its range, Welch's t-test)
- yearly aggregation and period comparison
- per-pixel trends, hotspot clustering and whole-area summaries on synthetic grids
- land/sea/air masks and the top-of-scale note
- colour-scale decoding and unit conversions
- land cover grouping and suggestions
- the scan hook
- the Analysis page (trend cards, compare mode, picked months, big-request gate)
- the demo player
- plain-language checks on every definition

## Deploying

`netlify.toml` builds with `npm run build`, publishes `dist/` and sends every route to `index.html`, so deep links like `/trends?q=…` work. You can import the repository at [app.netlify.com/start](https://app.netlify.com/start), or run `netlify deploy --prod --dir dist`.
