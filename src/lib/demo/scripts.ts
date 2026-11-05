// Watchable worked examples for the Trends page. Each step points at a part of the page, may do
// something (fill in a choice, start the scan, open a hotspot…) and may wait for NASA data before
// going on — exactly what a person would do by hand. Every number shown comes from a real scan;
// the captions describe what to look at, not the values.

import type { Direction } from "../query/indicators";
import type { QueryEdit } from "../trends/query";

/** Parts of the Trends page a step can point at (each carries a matching data-demo attribute). */
export type DemoTarget = "form" | "where" | "cover" | "find" | "tabs" | "results" | "whole-area" | "hint" | "filters" | "hotspots" | "hotspot-card" | "glossary";

export type DemoAction =
  | { kind: "edit"; edit: QueryEdit }
  | { kind: "run" }
  | { kind: "filter"; direction: Direction }
  | { kind: "select-hotspot"; rank: number }
  | { kind: "close-hotspot" };

/** Something the step waits for before it can go on. */
export type DemoWait = "scan-done" | "cover-ready";

export interface DemoStep {
  caption: string;
  target?: DemoTarget;
  action?: DemoAction;
  waitFor?: DemoWait;
  /** Skipped when its target isn't on the page (it depends on what the data shows). */
  optional?: boolean;
  /** On phones only one of the side panel and the map is visible. */
  panel?: "open" | "closed";
}

export interface DemoScript {
  id: string;
  title: string;
  /** One line for the chooser. */
  summary: string;
  steps: DemoStep[];
}

/** HTML attribute for a demo target: `<div {...demoAttr("form")}>`. */
export function demoAttr(target: DemoTarget): { "data-demo": DemoTarget } {
  return { "data-demo": target };
}

const ANY = { minFactor: 1, minAreaKm2: 0, strict: false };

export const DEMOS: DemoScript[] = [
  {
    id: "vegetation",
    title: "Is Uzbekistan's vegetation declining?",
    summary: "Choose a country, a measure and the years, then a trend test for the whole country and the hotspots that changed most.",
    steps: [
      {
        target: "where",
        action: { kind: "edit", edit: { area: { country: "UZB", name: "Uzbekistan" } } },
        caption: "First the place. Here Uzbekistan is picked by clicking it on the map with “Country or sea”; you can also draw a shape, search for a place, or choose a known region.",
      },
      {
        target: "form",
        action: { kind: "edit", edit: { indicators: ["vegetation"], filters: { vegetation: { direction: "decline", ...ANY } }, time: { kind: "since", start: 2015 }, season: null, months: null } },
        caption: "Then what to look for: vegetation, from NASA's MODIS satellites, since 2015, in its usual growing season (April to September). The results will show where it declined. The line at the top says the choices in words.",
      },
      {
        target: "find",
        action: { kind: "run" },
        caption: "Find changes starts the scan. Nothing is read from NASA until you press it.",
      },
      {
        target: "results",
        waitFor: "scan-done",
        caption:
          "TerraScope reads one NASA map per month — the growing season of every year since 2015 — and tests each pixel for a trend. The first time takes a minute or two; after that the maps are kept on this device.",
      },
      {
        target: "whole-area",
        caption:
          "The whole country first: average greenness then and now, the rate of change per year with its 95% range, and the Mann–Kendall test that says whether the trend is significant.",
      },
      {
        target: "hint",
        optional: true,
        caption: "When a short record shows no clear trend, one click tests every year since 2000 — a longer record often makes a real trend stand out.",
      },
      {
        target: "hotspot-card",
        action: { kind: "select-hotspot", rank: 1 },
        panel: "closed",
        caption: "Hotspots are the places that changed most. Each has its own trend test, year-by-year chart and 95% range, and a link to the full analysis.",
      },
      {
        target: "filters",
        action: { kind: "filter", direction: "any" },
        panel: "open",
        caption: "Filters regroup the pixels already read — here showing increases too — without loading a single new map.",
      },
      {
        target: "glossary",
        caption: "Unsure about a word? “Words used here” explains trend, p-value, 95% range and the rest in plain language.",
      },
    ],
  },
  {
    id: "sea",
    title: "Is the Mediterranean getting warmer?",
    summary: "Sea surface temperature over a whole sea: only its water is scanned, and the warming is tested for significance.",
    steps: [
      {
        target: "where",
        action: { kind: "edit", edit: { place: "Mediterranean Sea" } },
        caption: "Pick the sea: press “Country or sea” and click the water, search for it, or choose it from the list of known seas. TerraScope uses the sea's own shape, so only water is scanned.",
      },
      {
        target: "form",
        action: { kind: "edit", edit: { indicators: ["sst"], filters: { sst: { direction: "increase", ...ANY } }, time: { kind: "since", start: 2003 }, season: null, months: null } },
        caption: "Choose sea temperature — one of thirteen NASA measures — since 2003, every month of the year. The results will show where the water warmed.",
      },
      {
        target: "find",
        action: { kind: "run" },
        caption: "Find changes starts the scan: night-time sea surface temperature from MODIS, one map per month.",
      },
      {
        target: "results",
        waitFor: "scan-done",
        caption: "Large areas are read coarsely first, then the top hotspots are re-read in finer detail.",
      },
      {
        target: "whole-area",
        caption: "The whole sea: the rate per decade, its 95% range and the Mann–Kendall test. When the range stays above zero and p is below 0.05, the warming is significant.",
      },
      {
        target: "hotspots",
        caption: "The places that warmed most. Open water has no address, so hotspots at sea are named by their position.",
      },
    ],
  },
  {
    id: "pick",
    title: "What suits a place: the Aral Sea",
    summary: "Choose a place, see what kind of place it is from NASA's land cover map, take the measures that suit it, then find changes.",
    steps: [
      {
        target: "where",
        action: { kind: "edit", edit: { place: "Aral Sea", indicators: ["dust"], time: { kind: "default" }, season: null, months: null } },
        caption: "Here the Aral Sea is chosen from the list of known regions — the lake that shrank to a fraction of its size, leaving a dusty seabed.",
      },
      {
        target: "cover",
        waitFor: "cover-ready",
        caption: "TerraScope reads NASA's land cover map to see what kind of place this is, and suggests the measures that suit it, each with a reason.",
      },
      {
        target: "form",
        action: { kind: "edit", edit: { indicators: ["vegetation", "dust"] } },
        caption: "Pick measures — here vegetation and dust — then the years and the months. Nothing is read from NASA until you ask.",
      },
      {
        target: "find",
        action: { kind: "run" },
        caption: "Find changes starts the scan: one measure after another, each with its own progress.",
      },
      {
        target: "tabs",
        waitFor: "scan-done",
        caption: "Each measure gets its own tab, its own hotspots and its own trend test.",
      },
      {
        target: "whole-area",
        caption: "And the whole area in detail — the same numbers for any shape you draw.",
      },
    ],
  },
];

export function demoById(id: string | null): DemoScript | null {
  return DEMOS.find((demo) => demo.id === id) ?? null;
}
