## Frontend architecture overview

This project combines a **Terraview-style UI shell** with an **Eclipsar-style map engine** into a single SPA.

### Terraview UI shell (host app)

- **Primary responsibility**: layout, navigation, branding, and non-map pages.
- **Key pieces**:
  - `src/main.tsx` – bootstraps React and renders the app.
  - `src/App.tsx` – wraps the app with providers and defines the top-level routes.
  - `src/components/Navbar.tsx` – persistent navigation bar and primary branding.
  - `src/pages/Landing.tsx` – marketing-style landing page.
  - `src/pages/Login.tsx` – auth UI (email/password forms).
  - `src/pages/Missions.tsx` – missions UI and progress.
  - `src/pages/Analysis.tsx` – analysis UI (inputs, charts, AI insights).
  - `src/pages/NotFound.tsx` – 404 page.
- **Routing model**:
  - React Router (see `src/App.tsx`) is the single source of truth for top-level pages:
    - `/` → `Landing`
    - `/map` → `Explore`
    - `/split` → `SplitView`
    - `/sync` → `SyncView`
    - `/analysis` → `Analysis`
    - `/missions` → `Missions`
    - `/tracker` → `Tracker`
    - `/login` → `Login`
    - `*` → `NotFound`

The Terraview shell is the **primary host architecture** for the SPA: all user-visible routes live inside this shell and use its layout, theming, and navigation.

### Eclipsar-style map engine (embedded feature modules)

- **Primary responsibility**: interactive map rendering, NASA GIBS tiles, split/sync views, and map controls.
- **Key pieces**:
  - `src/components/ExploreMap.tsx` – core map engine component built with `react-leaflet`:
    - Manages center/zoom, tile layers, legends, and search.
    - Uses NASA GIBS tile endpoints and country border overlays.
  - `src/lib/map-layers.ts` – defines map layer metadata and tile URL templates (GIBS).
  - `src/components/MapLegend.tsx` – legend rendering for selected layers.
  - `src/pages/Explore.tsx` – hosts a single `ExploreMap` instance inside the Terraview layout.
  - `src/pages/SplitView.tsx` – hosts **two** `ExploreMap` instances in a draggable split-view.
  - `src/pages/SyncView.tsx` – hosts two `ExploreMap` instances kept in sync (center/zoom).

These pieces collectively form the **Eclipsar map engine**, but they are always rendered **inside** the Terraview shell (never as standalone full-screen routes).

### Locked-in host architecture decision

- The **Terraview UI shell** (Navbar, layout, and routed pages) is the **single host application**.
- The **Eclipsar map engine** is treated as a **set of feature modules** embedded into that shell:
  - Map-heavy routes (`/map`, `/split`, `/sync`, parts of `/analysis`) embed `ExploreMap` and related components in their content area.
  - Non-map routes (`/`, `/login`, `/missions`, `/tracker`) remain pure Terraview-style UI.
- All future features (auth, missions, analysis, AI) are implemented **within this Terraview shell**, reusing the Eclipsar map engine where map interaction is needed.

This document codifies the architecture choice so future work consistently uses **Terraview as the primary app shell** and **Eclipsar as the reusable map engine**.

