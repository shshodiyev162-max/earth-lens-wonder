// What an area is like, from NASA's yearly MODIS land cover map (17 IGBP classes, ~500 m), and
// which measures suit it. No AI: the suggestions follow the fixed rules written below.

import { createLimiter, createSharedCache, withRetry } from "../async";
import { cachedValue, TTL } from "../cache/store";
import type { BBox, PolygonGeometry } from "../geo/geometry";
import { GIBS_COLORMAPS, getLayer, type GibsLayer } from "../gibs/catalog";
import { fetchRgba, rasterizeMask, wmsGetMapUrl } from "../gibs/sample";
import { fetchTimeDomain } from "../gibs/time";
import type { WaterKind } from "../geo/waters";
import { CORE_INDICATORS, INDICATORS, type IndicatorId } from "../query/indicators";
import { scanGrid } from "./grid";
import { pixelAreaKm2, type GridSpec } from "./hotspots";

export const LAND_COVER_LAYER_ID = "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual";
const LEGEND = "MODIS_IGBP_Land_Cover_Type";
/** First year of the record; the latest is read from NASA. */
export const FIRST_COVER_YEAR = 2001;
const FALLBACK_LATEST = 2024;

export type CoverGroup = "forest" | "grass" | "cropland" | "urban" | "barren" | "snow" | "wetland" | "water";
export const COVER_GROUPS: CoverGroup[] = ["forest", "grass", "cropland", "urban", "barren", "snow", "wetland", "water"];

export const COVER_LABEL: Record<CoverGroup, string> = {
  forest: "Forest",
  grass: "Grassland, shrubs and savanna",
  cropland: "Cropland",
  urban: "Towns and cities",
  barren: "Bare ground and desert",
  snow: "Snow and ice",
  wetland: "Wetlands",
  water: "Water",
};

/** Colours from NASA's own land cover legend, for the bar. */
export const COVER_COLOR: Record<CoverGroup, string> = {
  forest: "rgb(33,138,33)",
  grass: "rgb(240,185,103)",
  cropland: "rgb(250,239,115)",
  urban: "rgb(255,0,0)",
  barren: "rgb(191,191,189)",
  snow: "rgb(255,255,255)",
  wetland: "rgb(71,131,181)",
  water: "rgb(134,202,227)",
};

/** The eight groups from NASA's class names ("Evergreen Broadleaf Forests" → forest). */
export function groupOf(className: string): CoverGroup | null {
  const name = className.toLowerCase();
  if (/forest/.test(name)) return "forest";
  if (/cropland/.test(name)) return "cropland";
  if (/urban|built/.test(name)) return "urban";
  if (/shrub|savanna|grass/.test(name)) return "grass";
  if (/snow|ice/.test(name)) return "snow";
  if (/barren/.test(name)) return "barren";
  if (/wetland/.test(name)) return "wetland";
  if (/water/.test(name)) return "water";
  return null;
}

const rgbKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

export interface CoverLegend {
  colors: { key: number; rgb: [number, number, number]; group: CoverGroup | null }[];
}

/** Class colours and names from NASA's legend file. */
export function parseCoverLegend(xml: string): CoverLegend {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const colors = Array.from(doc.getElementsByTagName("LegendEntry")).map((entry) => {
    const rgb = (entry.getAttribute("rgb") ?? "0,0,0").split(",").map(Number) as [number, number, number];
    return { key: rgbKey(...rgb), rgb, group: groupOf(entry.getAttribute("tooltip") ?? "") };
  });
  return { colors };
}

/** Group index per pixel (255 = transparent, unclassified or unknown). */
export function classifyPixels(rgba: Uint8ClampedArray, legend: CoverLegend): Uint8Array {
  const exact = new Map(legend.colors.map((c) => [c.key, c.group]));
  const out = new Uint8Array(rgba.length / 4).fill(255);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    let group = exact.get(rgbKey(rgba[o], rgba[o + 1], rgba[o + 2]));
    if (group === undefined) {
      // Edge pixels can be blended slightly: take the nearest class colour if it's close.
      let best = Infinity;
      for (const c of legend.colors) {
        const d = (c.rgb[0] - rgba[o]) ** 2 + (c.rgb[1] - rgba[o + 1]) ** 2 + (c.rgb[2] - rgba[o + 2]) ** 2;
        if (d < best) {
          best = d;
          group = c.group;
        }
      }
      if (best > 3 * 12 * 12) group = null;
    }
    if (group) out[i] = COVER_GROUPS.indexOf(group);
  }
  return out;
}

export interface LandCover {
  year: number;
  km2: Record<CoverGroup, number>;
  /** Classified area (unclassified pixels left out). */
  totalKm2: number;
  shares: Record<CoverGroup, number>;
}

/** Area of each group inside the mask, weighted by pixel size (pixels shrink towards the poles). */
export function summarizeCover(classes: Uint8Array, mask: Uint8Array, grid: GridSpec, year: number): LandCover {
  const km2 = Object.fromEntries(COVER_GROUPS.map((g) => [g, 0])) as Record<CoverGroup, number>;
  let totalKm2 = 0;
  for (let i = 0; i < classes.length; i++) {
    if (!mask[i] || classes[i] === 255) continue;
    const a = pixelAreaKm2(grid, Math.floor(i / grid.width));
    km2[COVER_GROUPS[classes[i]]] += a;
    totalKm2 += a;
  }
  const shares = Object.fromEntries(COVER_GROUPS.map((g) => [g, totalKm2 ? km2[g] / totalKm2 : 0])) as Record<CoverGroup, number>;
  return { year, km2, totalKm2, shares };
}

/** "Mostly bare ground and desert (62%), with grassland, shrubs and savanna (20%) and cropland (8%)." */
export function describeCover(cover: LandCover): string {
  const top = COVER_GROUPS.filter((g) => cover.shares[g] >= 0.03).sort((a, b) => cover.shares[b] - cover.shares[a]);
  if (!top.length) return "NASA's land cover map has no classified pixels here.";
  const part = (g: CoverGroup) => `${COVER_LABEL[g].toLowerCase()} (${Math.round(cover.shares[g] * 100)}%)`;
  const [first, ...rest] = top.slice(0, 3);
  const lead = cover.shares[first] >= 0.5 ? `Mostly ${part(first)}` : `${part(first).charAt(0).toUpperCase()}${part(first).slice(1)}`;
  if (!rest.length) return `${lead}.`;
  return `${lead}, with ${rest.length === 1 ? part(rest[0]) : `${part(rest[0])} and ${part(rest[1])}`}.`;
}

export interface CoverChange {
  group: CoverGroup;
  from: number;
  to: number;
}

/** Groups whose share moved by at least one percentage point between two years. */
export function coverChanges(first: LandCover, last: LandCover, minPoints = 0.01): CoverChange[] {
  return COVER_GROUPS.map((group) => ({ group, from: first.shares[group], to: last.shares[group] }))
    .filter((c) => Math.abs(c.to - c.from) >= minPoints)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

// ---------------------------------------------------------------------------
// Which measures suit the place

export interface Suggestion {
  indicator: IndicatorId;
  reason: string;
}

/** Each group, once it covers at least `min` of the area, brings its measures, in order. */
const RULES: { group: CoverGroup; min: number; measures: [IndicatorId, string][] }[] = [
  {
    group: "water",
    min: 0.4,
    measures: [
      ["sst", "Mostly water: sea temperature shows warming or cooling water."],
      ["airTemp", "The air over the water warms and cools too."],
      ["rainfall", "Rain on its coasts and islands (rain is read on land)."],
      ["salinity", "Rain, rivers and evaporation change how salty the water is."],
    ],
  },
  {
    group: "barren",
    min: 0.25,
    measures: [
      ["dust", "Bare ground and desert send up dust."],
      ["heat", "Bare ground heats up fast in the sun."],
      ["rainfall", "Deserts live on rare rain."],
      ["vegetation", "The edges of deserts can green or brown."],
      ["fineDust", "The finest dust travels far and reaches the lungs."],
    ],
  },
  {
    group: "forest",
    min: 0.2,
    measures: [
      ["vegetation", "Forest loss or regrowth shows in plant greenness."],
      ["rainfall", "Forests depend on rain."],
      ["evaporation", "Forests return much of their rain to the air."],
      ["heat", "Cleared forest gets hotter at the surface."],
      ["evi", "Leaf density keeps responding over thick forest."],
    ],
  },
  {
    group: "cropland",
    min: 0.15,
    measures: [
      ["vegetation", "Crop health shows in plant greenness."],
      ["soil", "Crops need water in the soil."],
      ["rainfall", "Farming depends on rain."],
      ["evaporation", "Watered fields send water into the air."],
      ["waterStorage", "Irrigation can draw down the water held underground."],
    ],
  },
  {
    group: "grass",
    min: 0.25,
    measures: [
      ["vegetation", "Grassland greens and browns with the rain."],
      ["rainfall", "Grassland depends on rain."],
      ["soil", "Drying soil shows drought early."],
      ["heat", "Dry grassland gets hotter at the surface."],
      ["topsoil", "The top of the soil dries first in a drought."],
    ],
  },
  {
    group: "urban",
    min: 0.03,
    measures: [
      ["heat", "Towns and cities get hotter than the land around them."],
      ["airTemp", "Air temperature where people live."],
      ["so2", "Burning coal and oil adds sulphur dioxide."],
      ["co", "Traffic, industry and fires add carbon monoxide."],
      ["nightHeat", "Cities hold their heat through the night."],
    ],
  },
  {
    group: "snow",
    min: 0.05,
    measures: [
      ["snow", "Snow and ice cover part of the area."],
      ["airTemp", "Warmer air melts snow and ice."],
      ["snowfall", "How much new snow falls each season."],
    ],
  },
  {
    group: "wetland",
    min: 0.08,
    measures: [
      ["soil", "Wetlands rise and fall with the water in the ground."],
      ["rainfall", "Wetlands are fed by rain."],
      ["evaporation", "Wet ground and open water evaporate fast."],
      ["waterStorage", "Wetlands rise and fall with the water held in the land."],
    ],
  },
];

export const MAX_SUGGESTIONS = 6;

/**
 * Up to six measures for a place, from its land cover: the biggest kind of land first. Places near
 * the South Pole also get the ozone layer (the ozone hole forms there each spring). A sea or ocean
 * gets no land measures (it is only water), but measures of the air over it.
 */
export function suggestMeasures(cover: LandCover, latitude: number, water?: WaterKind): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (indicator: IndicatorId, reason: string) => {
    if (water && INDICATORS[indicator].surface === "land") return;
    if (out.length < MAX_SUGGESTIONS && !out.some((s) => s.indicator === indicator)) out.push({ indicator, reason });
  };
  const rules = [...RULES].filter((r) => cover.shares[r.group] >= r.min).sort((a, b) => cover.shares[b.group] - cover.shares[a.group]);
  // Take turns: the first measure of every kind of land present (biggest first), then the second…
  const longest = Math.max(0, ...rules.map((r) => r.measures.length));
  for (let k = 0; k < longest; k++) for (const rule of rules) if (rule.measures[k]) add(...rule.measures[k]);
  if (latitude < -60) add("ozone", "The ozone hole forms over Antarctica every spring.");
  if (out.length < 3) {
    if (water) for (const id of ["airTemp", "co", "so2"] as IndicatorId[]) add(id, "Measured in the air over the sea as well as over land.");
    else for (const id of ["airTemp", "rainfall", "vegetation"] as IndicatorId[]) add(id, "A good general measure for any place.");
  }
  return out;
}

/** Measures for "what changed": the suggestions, or (when land cover is unknown) the six main measures, or sea and air ones for a sea. */
export function measuresForEverything(cover: LandCover | null, latitude: number, water?: WaterKind): IndicatorId[] {
  if (cover && cover.totalKm2 > 0) return suggestMeasures(cover, latitude, water).map((s) => s.indicator);
  return water ? ["sst", "airTemp"] : [...CORE_INDICATORS];
}

// ---------------------------------------------------------------------------
// Reading the map

const limit = createLimiter(4);
const shared = createSharedCache<Uint8Array>({ forgetSettled: true });
let legendPromise: Promise<CoverLegend> | null = null;
let latestPromise: Promise<number> | null = null;

function layer(): GibsLayer {
  return getLayer(LAND_COVER_LAYER_ID) as GibsLayer;
}

function fetchLegend(): Promise<CoverLegend> {
  legendPromise ??= fetch(`${GIBS_COLORMAPS}/${LEGEND}.xml`)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Land cover legend request failed (${r.status})`))))
    .then(parseCoverLegend)
    .catch((error) => {
      legendPromise = null;
      throw error;
    });
  return legendPromise;
}

/** The latest year NASA has published. */
export function latestCoverYear(): Promise<number> {
  latestPromise ??= fetchTimeDomain(layer())
    .then((domain) => (domain ? Number(domain.latest.slice(0, 4)) : FALLBACK_LATEST))
    .catch(() => FALLBACK_LATEST);
  return latestPromise;
}

const gridKey = (grid: GridSpec) => `${grid.bbox.map((v) => v.toFixed(3)).join(",")}|${grid.width}x${grid.height}`;

function fetchClasses(grid: GridSpec, year: number, signal?: AbortSignal): Promise<Uint8Array> {
  const key = `cover:${gridKey(grid)}|${year}`;
  return shared(
    key,
    (inner) =>
      cachedValue(key, TTL.grid, () =>
        limit(
          () =>
            withRetry(
              async () => {
                const [legend, rgba] = await Promise.all([fetchLegend(), fetchRgba(wmsGetMapUrl(layer(), grid, `${year}-01-01`), grid, inner)]);
                return classifyPixels(rgba, legend);
              },
              { signal: inner, retries: 2 },
            ),
          inner,
        ),
      ),
    signal,
  );
}

/** Land cover of an area in one year (the latest when not given). About 120 pixels on the long side. */
export async function fetchLandCover(geometry: PolygonGeometry, bbox: BBox, options: { year?: number; signal?: AbortSignal } = {}): Promise<LandCover> {
  const year = options.year ?? (await latestCoverYear());
  const grid = scanGrid(bbox, 120, 0.005);
  const classes = await fetchClasses(grid, year, options.signal);
  return summarizeCover(classes, rasterizeMask(geometry, grid), grid, year);
}
