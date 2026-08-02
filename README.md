# TerraVision — Earth Observation Platform

An interactive Earth observation platform built with **React 18, TypeScript, Vite, Tailwind, Leaflet, and Three.js**. Explore NASA satellite imagery with a cinematic 3D globe, compare layers in split view, and keep two maps perfectly in sync.

## Features

- **Cinematic 3D Earth** — interactive Three.js globe with high-res NASA satellite textures, clouds, a sparse particle ring, and star field
- **Explore** — pick from multiple NASA GIBS layer products and pan/zoom the globe or 2D map
- **Split view** — compare two different layers side by side
- **Sync view** — two maps locked in perfect lockstep, sharing center + zoom
- **AI analysis** — analyze regions with generated time-series, charts, and AI-written insights (with a built-in mock fallback)
- **Missions & Eco Impact Tracker** — progress tracking with demo-mode persistence when no backend is configured
- **Accounts** — email/password login, with demo mode when the API is not configured

## Tech stack

- **Vite 5** + **React 18** + **TypeScript**
- **Tailwind CSS** + shadcn/ui primitives
- **Leaflet** / **react-leaflet** for 2D maps
- **Three.js** / **@react-three/fiber** for the 3D globe
- **TanStack Query**, **React Router**, **Recharts**, **Framer Motion**

## Getting started

```sh
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

### Available scripts

| Script            | Description                              |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Start the Vite dev server                |
| `npm run build`   | Production build to `dist/`              |
| `npm run preview` | Preview the production build locally     |
| `npm run lint`    | Run ESLint                               |
| `npm test`        | Run the Vitest suite once                |
| `npm run test:watch` | Run Vitest in watch mode              |

## Environment variables

Copy `.env.example` to `.env` if you want to connect a backend. All values are optional — the app runs in demo mode without them.

| Variable                    | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `VITE_API_BASE_URL`         | Backend API base URL (auth, missions, analyses)      |
| `VITE_AI_ANALYSIS_ENDPOINT` | AI map analysis endpoint URL                         |

Secrets (API keys, database credentials) must **never** be stored in frontend code or committed to the repo — keep them in the backend or in Netlify's environment settings.

## Project structure

```
src/
├── components/
│   ├── CinematicEarth.tsx   # 3D globe + particle ring (landing)
│   ├── ExploreMap.tsx       # Leaflet map engine
│   ├── LayerGlobe.tsx       # 3D globe used in map views
│   ├── Layout.tsx           # Navbar + page container
│   └── ui/                  # shadcn/ui primitives
├── context/
│   ├── AuthContext.tsx      # Email/password auth (demo fallback)
│   └── RegionContext.tsx    # Selected areas + region state
├── hooks/
├── lib/
│   ├── map-layers.ts        # NASA GIBS layer definitions
│   ├── layerCatalog.ts      # Quick regions + catalog helpers
│   ├── apiClient.ts         # fetch wrapper
│   └── analysisClient.ts    # AI analysis orchestration
├── pages/
│   ├── Landing.tsx          # Marketing landing + 3D Earth
│   ├── Explore.tsx          # Single map view
│   ├── SplitView.tsx        # Side-by-side comparison
│   ├── SyncView.tsx         # Locked-step synced maps
│   ├── Analysis.tsx         # AI analysis workflow
│   ├── Missions.tsx         # Mission progress
│   ├── Tracker.tsx          # Eco impact tracker
│   ├── Login.tsx            # Sign-in / sign-up
│   └── NotFound.tsx         # 404
└── test/                    # Vitest setup + tests
```

## Netlify deployment

This repo includes `netlify.toml`:

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **SPA redirect**: all routes (`/*`) redirect to `/index.html` so client-side routing works

### Option A — Git import (recommended)

1. Push this repo to GitHub/GitLab
2. Go to [app.netlify.com/start](https://app.netlify.com/start) → **Import from Git**
3. Select the repo — Netlify auto-detects the Vite config
4. Set `VITE_API_BASE_URL` and `VITE_AI_ANALYSIS_ENDPOINT` under Site settings → Environment variables
5. Deploy — every push rebuilds automatically

### Option B — Netlify Drop

```sh
npm run build
```

Then drag the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

### Option C — Netlify CLI

```sh
npm install -g netlify-cli
netlify deploy --prod --dir dist
```

## Tests

```sh
npm test
```

Vitest runs with `jsdom`. Existing tests cover login and map analysis flows with mocked API clients.