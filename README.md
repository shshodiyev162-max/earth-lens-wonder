# TerraVision

See any place on Earth through NASA's eyes. Search a city, region or coordinates, browse live NASA satellite layers, compare dates side by side, and get a measured report on vegetation, heat, rainfall, soil moisture, dust and snow for exactly the area you choose.

Everything runs in the browser against public NASA and OpenStreetMap services — no API keys, no backend required.

## Features

- **Explore** — 17 NASA GIBS layers (true color, false color, vegetation, land surface temperature, aerosols, carbon monoxide, precipitation, sea surface temperature, chlorophyll, snow, night lights). Every layer and its maximum zoom were checked against GIBS. The date picker snaps to days that actually exist for that product, legends come from NASA's own colormaps, and clicking the map reads the real value at that spot.
- **Search everywhere** — places, regions, countries, lakes, deserts and coordinates (`39.77, 64.42`, `39.77N 64.42E`, `lat: 40.7 lon: -74`). Search-as-you-type in every map and on the landing page, plus a global palette with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> (or <kbd>/</kbd>) that also finds NASA layers. Selected places are outlined with their real boundary.
- **Draw and measure** — rectangle, polygon and circle tools. Saved areas show live statistics of the active layer (mean, 10th–90th percentile range, share of the area measured) and stay on the device.
- **Compare** — one map with a draggable divider: two layers, or one layer on two dates.
- **Side by side** — two maps locked together for pan and zoom, with dates linked or independent.
- **Analysis** — pick a searched place, a saved or freshly drawn area, a clicked point with a radius, or your location. TerraVision pulls up to 10 years of monthly NASA data for that exact outline and explains what changed in plain language: headline, concern level, indicators with sparklines, charts, findings with their thresholds, and a methodology section. Reports are shareable links and can be downloaded as CSV.

## How the analysis works

1. **Satellite series (NASA GIBS).** For every month, TerraVision requests a WMS image of the area's bounding box at the product's native resolution (at most 320 px across), rasterizes the area's outline onto it, and converts each pixel back to its physical value using NASA's published colormap for that product (an exact RGB match). It then takes the mean, the 10th–90th percentile spread and the share of the area that had valid data.
   - Vegetation: MODIS Terra monthly NDVI
   - Surface heat: MODIS Terra monthly daytime land surface temperature
   - Aerosols & dust: MERRA-2 monthly aerosol optical thickness
   - Snow: MODIS Terra monthly snow cover
2. **Climate (NASA POWER).** Monthly air temperature (mean and monthly extremes), rainfall, sunshine, humidity, wind and root-zone soil wetness at 1, 3 or 5 points inside the area (depending on its size), compared with the 2001–2020 climatology.
3. **Findings.** Plain rules with fixed, stated thresholds. Examples: rainfall below 60 % of normal, monthly surface temperature above 45 °C, aerosol optical depth above 0.4, and a seasonally adjusted vegetation trend. Nothing is simulated. If a product has not been published yet for recent months, the report says so.

This was checked against the live services on 2 October 2026: all 21 layers load, all 13 science colormaps decode with 100 % exact color matches, and a full 24-month analysis of Bukhara takes about 10 seconds. The real Bukhara result is kept as a test fixture (`src/lib/analysis/__tests__/fixtures/bukhara-real.json`).

## Getting started

```sh
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:8080`).

| Script               | What it does                          |
| -------------------- | ------------------------------------- |
| `npm run dev`        | Start the Vite dev server             |
| `npm run build`      | Production build to `dist/`           |
| `npm run preview`    | Serve the production build locally    |
| `npm run lint`       | ESLint                                |
| `npm test`           | Run the Vitest suite once             |
| `npm run test:watch` | Vitest in watch mode                  |

## Environment variables (all optional)

Copy `.env.example` to `.env`.

| Variable                    | Purpose                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`         | Backend for accounts (`/auth/login`, `/auth/register`, `/auth/logout`, `/auth/me`). Accounts are switched off for now (`ACCOUNTS_ENABLED` in `src/config.ts`); every page is open. |
| `VITE_AI_ANALYSIS_ENDPOINT` | Your own endpoint for an optional AI briefing on the Analysis page. TerraVision POSTs the measured findings and expects `{ "summary": string, "bullets": string[] }`.             |

Never put secrets (model API keys, database credentials) in `VITE_` variables — they end up in the browser bundle. Keep them on the backend.

## Data sources

| Data                     | Source                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Satellite layers         | [NASA EOSDIS GIBS](https://www.earthdata.nasa.gov/gibs) (WMTS tiles, WMS, colormaps, time domains) |
| Climate                  | [NASA POWER](https://power.larc.nasa.gov/) monthly and climatology point API                     |
| Place search, boundaries | [OpenStreetMap](https://www.openstreetmap.org/copyright) via [Photon](https://photon.komoot.io/) and [Nominatim](https://nominatim.org/) |
| Country borders          | [Natural Earth](https://www.naturalearthdata.com/) 1:50m (bundled in `public/data`)             |
| Map labels               | NASA GIBS `Reference_Labels_15m` (from © OpenStreetMap contributors)                             |
| Globe textures           | three.js examples (bundled in `public/textures`)                                                 |

Nominatim is limited to one request per second; the app queues its calls accordingly. Near-real-time GIBS layers can be incomplete for the most recent day, and the newest months of MERRA-2 and of POWER's sunshine data appear with a delay. The app shows the latest available date in each case.

## Project structure

```
src/
├── App.tsx                  # Routes (lazy-loaded pages), providers, error boundary
├── components/
│   ├── analysis/            # Location picker, period and dataset controls, charts, report panels
│   ├── map/                 # Base map, GIBS tile layers, drawing, legends, date control, swipe clip…
│   ├── search/              # Inline place search and the Ctrl/⌘+K palette
│   ├── CinematicEarth.tsx   # Three.js globe on the landing page
│   ├── Layout.tsx, Navbar.tsx, ErrorBoundary.tsx, RequireAuth.tsx
│   └── ui/                  # shadcn/ui primitives
├── context/
│   ├── AuthContext.tsx      # Accounts (demo mode without a backend)
│   └── WorkspaceContext.tsx # Saved areas and last map view (kept on this device)
├── hooks/                   # Place search/selection, layer dates, analysis target and run
├── lib/
│   ├── gibs/                # Layer catalog, time domains, colormap decoding, area sampling
│   ├── geo/                 # Geometry (areas, centroids, circles) and geocoding
│   ├── analysis/            # Analysis engine, NASA POWER client, statistics, insights, CSV export
│   ├── async.ts             # Request de-duplication, cancellation and concurrency limits
│   └── analysisClient.ts    # Optional AI briefing endpoint
└── pages/                   # Landing, Explore, Split (SplitView), Sync (SyncView), Analysis, Login (off for now), 404
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## Deploying to Netlify

`netlify.toml` builds with `npm run build`, publishes `dist/` and redirects every route to `index.html` so deep links such as `/analysis?osm=R13070474` work.

- **From Git:** import the repository at [app.netlify.com/start](https://app.netlify.com/start). Optionally set the environment variables above under *Site settings → Environment variables*.
- **Drag and drop:** run `npm run build` and drop the `dist/` folder on [app.netlify.com/drop](https://app.netlify.com/drop).
- **CLI:** `netlify deploy --prod --dir dist`.

## Tests

```sh
npm test
```

Vitest covers colormap decoding, time-domain resolution, area rasterization and statistics, geocoding and coordinate parsing, geometry, the NASA POWER parser, the insight rules (including the real Bukhara fixture), the async helpers, and the Login and Analysis pages.
