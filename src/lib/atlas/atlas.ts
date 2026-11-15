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
  /** Its average's trend: the rate and range. Not proof on its own, since the patch was picked for changing. */
  verdict: AtlasVerdict | null;
  /** The chance check: shuffles (of the measure's chanceRuns) that made a patch at least this strong. */
  chance: number;
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
   * and the pixel's trend is clear with every pixel tested allowed for (5% false discovery rate).
   */
  minChange: number;
  /** The chance check: how many times the years were shuffled, and in how many a patch passed. */
  chanceRuns: number;
  chanceRunsWithPatches: number;
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
/** Patches at least this big are named by their country: a province's name would undersell them. */
const COUNTRY_SIZE_KM2 = 100_000;

function baseName(hotspot: AtlasHotspot): string {
  const name = hotspot.name ?? `Change ${hotspot.rank}`;
  if (hotspot.areaKm2 < COUNTRY_SIZE_KM2 || !name.includes(", ")) return name;
  return name.slice(name.lastIndexOf(", ") + 2);
}

/**
 * A patch's name. One of 194,000 km² is "Poland", not "Silesian Voivodeship, Poland" (where its
 * middle happens to be). Given the measure's other patches, a name shared with a bigger one gets a number.
 */
export function hotspotName(hotspot: AtlasHotspot, all: AtlasHotspot[] = [hotspot]): string {
  const name = baseName(hotspot);
  const same = all.filter((other) => baseName(other) === name).sort((a, b) => a.rank - b.rank);
  const k = same.findIndex((other) => other.rank === hotspot.rank);
  return k > 0 ? `${name} (${k + 1})` : name;
}

/** The Trends page for one hotspot: its outline, the same measure, direction and years, every month. */
export function atlasTrendsHref(measure: AtlasMeasure, hotspot: AtlasHotspot): string {
  const params = new URLSearchParams({
    ind: measure.id,
    dir: hotspot.sign < 0 ? "decline" : "increase",
    poly: hotspot.outline,
    name: hotspotName(hotspot, measure.hotspots),
    t: `since-${measure.startYear}`,
    season: "all",
  });
  return `/trends?${params}`;
}
