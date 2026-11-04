// Watchable worked examples for the Trends page. Each step points at a part of the page, may do
// something (ask a question, open a hotspot…) and may wait for NASA data before going on. Every
// number shown comes from a real scan; the captions describe what to look at, not the values.

import { bboxPolygon } from "../geo/geometry";
import { encodeGeometryForLink } from "../geo/polyline";
import type { Direction } from "../query/indicators";
import type { QueryEdit } from "../trends/query";

/** Parts of the Trends page a step can point at (each carries a matching data-demo attribute). */
export type DemoTarget = "question" | "mode" | "form" | "where" | "cover" | "find" | "tabs" | "results" | "whole-area" | "hint" | "filters" | "hotspots" | "hotspot-card" | "glossary";

export type DemoAction =
  | { kind: "ask"; text: string }
  | { kind: "mode"; mode: "ask" | "pick" }
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

const ARAL_REGION = encodeGeometryForLink(bboxPolygon([57.8, 43.3, 62.0, 47.2]));

export const DEMOS: DemoScript[] = [
  {
    id: "vegetation",
    title: "Is Uzbekistan's vegetation declining?",
    summary: "A question in plain words, a trend test for the whole country, and the hotspots that changed most.",
    steps: [
      {
        target: "question",
        action: { kind: "ask", text: "where did vegetation decline in Uzbekistan since 2015" },
        caption: "Ask in plain words. TerraScope turns the question into choices: the measure (vegetation, from NASA's MODIS satellites), the place, the years and the months.",
      },
      {
        target: "form",
        caption: "Every choice is in the form and can be changed. The sentence is rewritten to match, so the words and the choices never disagree.",
      },
      {
        target: "results",
        waitFor: "scan-done",
        caption:
          "TerraScope reads one NASA map per month — the growing season, April to September, of every year since 2015 — and tests each pixel for a trend. The first time takes a minute or two; after that the maps are kept on this device.",
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
    summary: "Sea surface temperature over a whole sea: only water is scanned, and the warming is tested for significance.",
    steps: [
      {
        target: "question",
        action: { kind: "ask", text: "is the Mediterranean sea temperature rising since 2003" },
        caption: "Sea temperature is one of thirteen NASA measures. TerraScope knows the Mediterranean's outline, so the whole sea is scanned — and land is left out.",
      },
      {
        target: "results",
        waitFor: "scan-done",
        caption: "Night-time sea surface temperature from MODIS, every month of the year. Large areas are read coarsely first, then the top hotspots are re-read in finer detail.",
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
    title: "Choose step by step: the Aral Sea",
    summary: "No question needed: pick an area, see what kind of place it is, choose the measures that suit it, then find changes.",
    steps: [
      {
        target: "mode",
        action: { kind: "mode", mode: "pick" },
        caption: "No question needed: choose everything yourself. Draw a rectangle, polygon or circle on the map, click a country, or type a place.",
      },
      {
        target: "where",
        action: { kind: "edit", edit: { area: { poly: ARAL_REGION, name: "Aral Sea region" }, indicators: ["dust"], time: { kind: "default" } } },
        caption: "Here a box around the Aral Sea is chosen — the lake that shrank to a fraction of its size, leaving a dusty seabed.",
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
