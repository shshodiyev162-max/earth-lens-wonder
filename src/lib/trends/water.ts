// Open water, read from NASA's monthly vegetation maps (MOD13A3 from Terra, MYD13A3 from Aqua). NASA's
// map service draws NDVI at or below zero as see-through, and open water is always below zero, so a
// see-through pixel is water. Each monthly map keeps the greenest view of the month, so over water a
// hazy, cloudy or glinting view (slightly green) wins over a clear one and the water reads as land.
// So both satellites are read, a pixel is water when either saw it see-through, and a year counts
// it as water when any month of its season did. Snow and ice are below zero too: NASA's monthly snow
// map tells them apart, and where it shows snow the pixel is left out that month. But the snow map
// also mistakes salty, muddy or shallow water and salt flats for snow, even in a desert summer, so
// its snow only counts where NASA's surface temperature map says the ground was cold enough for it.

import { getLayer, type GibsLayer } from "../gibs/catalog";
import { rasterizeMask } from "../gibs/sample";
import type { BBox, PolygonGeometry } from "../geo/geometry";
import { pixelAreaKm2, type GridSpec } from "./hotspots";
import { scanGrid } from "./grid";

export const WATER_LAYER_ID = "MODIS_Terra_L3_NDVI_Monthly";
export const AQUA_WATER_LAYER_ID = "MODIS_Aqua_L3_NDVI_Monthly";
export const SNOW_LAYER_ID = "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct";
export const SURFACE_TEMP_LAYER_ID = "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day";
/** Aqua's first monthly vegetation map. */
export const AQUA_FIRST_MONTH = "2002-07";

/** Colours for open-water frames: land (0) to water (100). */
export const WATER_STOPS: { value: number; color: [number, number, number] }[] = [
  { value: 0, color: [214, 196, 150] },
  { value: 100, color: [3, 105, 161] },
];

/** Snow cover (%) above which a see-through pixel may be snow or ice rather than water. */
export const SNOW_LIMIT = 10;

/**
 * The month's average daytime surface temperature (°C) at or above which snow there can't be real:
 * snow and ice don't last on ground that warm, so the snow map's reading is water it mistook.
 */
export const SNOW_WARMEST = 5;

/** The snow map's snow, kept only where the ground was cold enough for it (`warmth` missing: kept). */
export function realSnow(snow: Float32Array, warmth: Float32Array | null): Float32Array {
  if (!warmth) return snow;
  return snow.map((value, i) => (value > SNOW_LIMIT && warmth[i] >= SNOW_WARMEST ? 0 : value));
}

/**
 * 100 = open water (see-through on either vegetation map), 0 = land (a reading on every map read),
 * NaN = can't tell (snow or ice).
 */
export function openWater(maps: (Float32Array | null)[], snow: Float32Array | null): Float32Array {
  const read = maps.filter((map): map is Float32Array => map !== null);
  const out = new Float32Array(read[0]?.length ?? 0);
  for (let i = 0; i < out.length; i++) {
    const seen = read.some((map) => !Number.isFinite(map[i]));
    if (!seen) out[i] = 0;
    else out[i] = snow && snow[i] > SNOW_LIMIT ? Number.NaN : 100;
  }
  return out;
}

export type MonthGridLoader = (layer: GibsLayer, grid: GridSpec, month: string, signal?: AbortSignal) => Promise<Float32Array>;

export interface WaterMonth {
  grid: Float32Array;
  /** False when the snow map couldn't be read: snow and ice may then count as water. */
  snowChecked: boolean;
  /** False when Aqua's map couldn't be read: the month then rests on Terra's alone. */
  bothRead: boolean;
}

/**
 * One month of open water: both vegetation maps (Terra's is needed), and the snow map, when they can
 * be read. The surface temperature map is read only when the snow map shows snow where water was seen.
 */
export async function openWaterMonth(load: MonthGridLoader, grid: GridSpec, month: string, signal?: AbortSignal): Promise<WaterMonth> {
  const optional = (id: string) =>
    load(getLayer(id) as GibsLayer, grid, month, signal).catch((error: unknown) => {
      if ((error as { name?: string }).name === "AbortError" || signal?.aborted) throw error;
      return null;
    });
  const [terra, aquaMap, snow] = await Promise.all([
    load(getLayer(WATER_LAYER_ID) as GibsLayer, grid, month, signal),
    month >= AQUA_FIRST_MONTH ? optional(AQUA_WATER_LAYER_ID) : Promise.resolve(null),
    optional(SNOW_LAYER_ID),
  ]);
  // A map with no reading anywhere is a month NASA hasn't got, not a sea: it would make every pixel water.
  const aqua = aquaMap && aquaMap.some(Number.isFinite) ? aquaMap : null;
  const seen = openWater([terra, aqua], null);
  const snowOnWater = snow !== null && seen.some((value, i) => value > 50 && snow[i] > SNOW_LIMIT);
  const warmth = snowOnWater ? await optional(SURFACE_TEMP_LAYER_ID) : null;
  return { grid: openWater([terra, aqua], snow && realSnow(snow, warmth)), snowChecked: snow !== null, bothRead: aqua !== null };
}

/**
 * Open water in an area for one month, in km², for the Analysis page: worked out pixel by pixel on
 * the Trends page's grid. Null when snow hid more than a twentieth of the area: snow lies on land and
 * ice, so what it hides can't be taken to be like the rest.
 */
export async function waterInArea(load: MonthGridLoader, geometry: PolygonGeometry, bbox: BBox, month: string, signal?: AbortSignal): Promise<number | null> {
  const grid = scanGrid(bbox, 200, 0.01);
  const { grid: water } = await openWaterMonth(load, grid, month, signal);
  const mask = rasterizeMask(geometry, grid);
  let inside = 0;
  let told = 0;
  let wet = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const area = pixelAreaKm2(grid, Math.floor(i / grid.width));
    inside += area;
    if (!Number.isFinite(water[i])) continue;
    told += area;
    if (water[i] > 50) wet += area;
  }
  return told >= inside * 0.95 && told > 0 ? (wet / told) * inside : null;
}

/**
 * Of the pixels that were water at some point in a season, the share that were water in only some
 * of its months, over all the years read. Shores that move do this, but so does green, algae-rich
 * or muddy water, or cloud, that the vegetation map reads as land some months.
 */
export function unsteadyShare(monthGrids: Map<string, Float32Array>, seasons: string[][], mask: Uint8Array): number {
  let wet = 0;
  let unsteady = 0;
  for (const months of seasons) {
    const grids = months.map((month) => monthGrids.get(month)).filter((grid): grid is Float32Array => Boolean(grid));
    if (grids.length < 2) continue;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      let water = 0;
      let read = 0;
      for (const grid of grids) {
        if (!Number.isFinite(grid[i])) continue;
        read += 1;
        if (grid[i] > 50) water += 1;
      }
      if (read < 2 || water === 0) continue;
      wet += 1;
      if (water < read) unsteady += 1;
    }
  }
  return wet ? unsteady / wet : 0;
}

/** Above this share of unsteady water pixels, the result says the area is rough. */
export const UNSTEADY_LIMIT = 0.35;

export function unsteadyNote(share: number): string | null {
  if (share < UNSTEADY_LIMIT) return null;
  return `${Math.round(share * 100)}% of the water here was water in only some months of each season. Moving shores do that, but so does green, algae-rich or muddy water, or cloud, which the vegetation map can read as land. Treat the water area here as rough: it may be too small, and swing with blooms and clouds.`;
}
