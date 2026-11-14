// The world change atlas: six headline measures scanned once over the whole map with the app's own
// scanner (scripts/measure-atlas.browser.js), bundled with the app so the answer shows instantly.

import type { BBox, LatLng } from "../geo/geometry";
import { INDICATORS, type IndicatorId } from "../query/indicators";
import type { TrendDirection } from "../analysis/stats";
import type { GridSpec } from "../trends/hotspots";
import { hexToRgb, type ChangeScale } from "../trends/render";
import { ATLAS } from "./atlasData";

export interface AtlasVerdict {
  direction: TrendDirection;
  p: number;
  slopePerYear: number;
  lowerPerYear: number;
  upperPerYear: number;
  slopePerDecade: number | null;
  years: number;
  carryOver: number | null;
}

export interface AtlasHotspot {
  rank: number;
  /** Place name from OpenStreetMap, or its position over open sea. */
  name: string | null;
  /** -1 a decline, +1 a rise. */
  sign: -1 | 1;
  center: LatLng;
  bbox: BBox;
  /** Its outline, encoded as in a link (lib/geo/polyline). */
  outline: string;
  areaKm2: number;
  meanChange: number;
  /** Share of its pixels whose own trend is clear. */
  significantShare: number;
  verdict: AtlasVerdict | null;
}

export interface AtlasMeasure {
  id: IndicatorId;
  /** The change map, in public/data/atlas. */
  file: string;
  startYear: number;
  endYear: number;
  yearsRead: number;
  mapsRead: number;
  notes: string[];
  /** The first and last years compared for a pixel's change. */
  baseline: [number, number];
  recent: [number, number];
  /**
   * A change is mapped as a patch when the recent years differ from the first by at least this
   * (raised above the measure's usual bar where widespread change joins into continent-sized patches)
   * and the pixel's trend is clear with every pixel tested allowed for.
   */
  minChange: number;
  /**
   * true: a pixel counts only if its trend stays clear with every pixel tested allowed for (5% false
   * discovery rate). false: that test found too few patches, so the Trends page's usual test is used
   * (each pixel at p < 0.1).
   */
  strict: boolean;
  grid: GridSpec;
  scale: { max: number; unit: string };
  region: { verdict: AtlasVerdict | null; meanChange: number | null; scannedKm2: number; validShare: number };
  hotspots: AtlasHotspot[];
}

export interface Atlas {
  measuredOn: string;
  bbox: BBox;
  measures: AtlasMeasure[];
}

export const WORLD_ATLAS = ATLAS as unknown as Atlas;

export function atlasMeasure(id: string | null): AtlasMeasure {
  return WORLD_ATLAS.measures.find((m) => m.id === id) ?? WORLD_ATLAS.measures[0];
}

/** The legend's colour scale, as the Trends page draws it. */
export function atlasScale(measure: AtlasMeasure): ChangeScale {
  const colors = INDICATORS[measure.id].colors;
  return { mode: "perDecade", max: measure.scale.max, unit: measure.scale.unit, decline: hexToRgb(colors.decline), increase: hexToRgb(colors.increase) };
}

/** Width of a grid pixel in degrees, and roughly in km at the equator. */
export function atlasPixel(measure: AtlasMeasure): { degrees: number; km: number } {
  const degrees = (measure.grid.bbox[2] - measure.grid.bbox[0]) / measure.grid.width;
  return { degrees, km: Math.round((degrees * 111.32) / 5) * 5 };
}

/** A hotspot's name, or its rank when it has none. */
export function hotspotName(hotspot: AtlasHotspot): string {
  return hotspot.name ?? `Change ${hotspot.rank}`;
}

/** The Trends page for one hotspot: its outline, the same measure, direction and years, every month. */
export function atlasTrendsHref(measure: AtlasMeasure, hotspot: AtlasHotspot): string {
  const params = new URLSearchParams({
    ind: measure.id,
    dir: hotspot.sign < 0 ? "decline" : "increase",
    poly: hotspot.outline,
    name: hotspotName(hotspot),
    t: `since-${measure.startYear}`,
    season: "all",
  });
  return `/trends?${params}`;
}
