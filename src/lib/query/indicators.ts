// What each searchable indicator means, which NASA product measures it as a gridded
// monthly map, and how to read a change in it.

import type { DatasetId } from "../analysis/types";

export type IndicatorId = "vegetation" | "heat" | "rainfall" | "soil" | "dust" | "snow";
export type Direction = "decline" | "increase" | "any";

export interface SeasonPreset {
  id: SeasonId;
  label: string;
  /** Calendar months 1–12 in the northern hemisphere (flipped for southern places). */
  months: number[];
}

export type SeasonId = "all" | "growing" | "summer" | "winter" | "spring" | "autumn" | "cold" | "custom";

export const SEASONS: Record<Exclude<SeasonId, "custom">, SeasonPreset> = {
  all: { id: "all", label: "All months", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  growing: { id: "growing", label: "Growing season (Apr–Sep)", months: [4, 5, 6, 7, 8, 9] },
  summer: { id: "summer", label: "Summer (Jun–Aug)", months: [6, 7, 8] },
  winter: { id: "winter", label: "Winter (Dec–Feb)", months: [12, 1, 2] },
  spring: { id: "spring", label: "Spring (Mar–May)", months: [3, 4, 5] },
  autumn: { id: "autumn", label: "Autumn (Sep–Nov)", months: [9, 10, 11] },
  cold: { id: "cold", label: "Snow season (Nov–Apr)", months: [11, 12, 1, 2, 3, 4] },
};

export interface Indicator {
  id: IndicatorId;
  /** Chip label. */
  label: string;
  /** Used in sentences: "vegetation decline". */
  noun: string;
  /** Sentence subject for verdicts: "Plant greenness fell…". */
  subject: string;
  /** NASA GIBS monthly layer scanned for hotspots. */
  layerId: string;
  /** Product name for sources and methods. */
  product: string;
  unit: string;
  decimals: number;
  /** Smallest change between baseline and recent periods worth flagging (in `unit`). */
  minChange: number;
  /** The direction that usually means trouble (drives colours and wording). */
  concern: "decline" | "increase";
  /** Default months to compare, so the seasonal cycle can't fake a change. */
  season: Exclude<SeasonId, "custom">;
  /** Colours for the change map: falling values / rising values. */
  colors: { decline: string; increase: string };
  /** Words for each direction in titles. */
  words: { decline: string; increase: string; any: string };
  /** Matching Analysis-page dataset (rainfall and soil moisture come from NASA POWER there). */
  dataset: DatasetId;
}

export const INDICATORS: Record<IndicatorId, Indicator> = {
  vegetation: {
    id: "vegetation",
    label: "Vegetation",
    noun: "vegetation health",
    subject: "Plant greenness (NDVI)",
    layerId: "MODIS_Terra_L3_NDVI_Monthly",
    product: "MODIS Terra monthly NDVI (MOD13A3), ~1 km",
    unit: "NDVI",
    decimals: 3,
    minChange: 0.02,
    concern: "decline",
    season: "growing",
    colors: { decline: "#b45309", increase: "#15803d" },
    words: { decline: "vegetation decline", increase: "greening", any: "vegetation change" },
    dataset: "vegetation",
  },
  heat: {
    id: "heat",
    label: "Surface heat",
    noun: "land surface temperature",
    subject: "Daytime land surface temperature",
    layerId: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    product: "MODIS Terra monthly daytime land surface temperature (MOD11C3), ~5 km",
    unit: "°C",
    decimals: 2,
    minChange: 0.5,
    concern: "increase",
    season: "summer",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "surface cooling", increase: "surface warming", any: "surface temperature change" },
    dataset: "surfaceHeat",
  },
  rainfall: {
    id: "rainfall",
    label: "Rainfall",
    noun: "rainfall",
    subject: "Average monthly rainfall",
    layerId: "MERRA2_Precipitation_Bias_Corrected_Monthly",
    product: "MERRA-2 bias-corrected monthly precipitation, ~50 km",
    unit: "mm/month",
    decimals: 1,
    minChange: 3,
    concern: "decline",
    season: "all",
    colors: { decline: "#a16207", increase: "#0369a1" },
    words: { decline: "drying", increase: "wetting", any: "rainfall change" },
    dataset: "climate",
  },
  soil: {
    id: "soil",
    label: "Soil moisture",
    noun: "root-zone soil moisture",
    subject: "Root-zone soil moisture",
    layerId: "MERRA2_Soil_Water_Root_Zone_Monthly",
    product: "MERRA-2 monthly root-zone soil water, ~50 km",
    unit: "% vol",
    decimals: 2,
    minChange: 1,
    concern: "decline",
    season: "all",
    colors: { decline: "#a16207", increase: "#0e7490" },
    words: { decline: "soil drying", increase: "soil wetting", any: "soil moisture change" },
    dataset: "climate",
  },
  dust: {
    id: "dust",
    label: "Dust",
    noun: "surface dust",
    subject: "Surface dust concentration",
    layerId: "MERRA2_Dust_Surface_Mass_Concentration_Monthly",
    product: "MERRA-2 monthly dust surface mass concentration, ~50 km",
    unit: "µg/m³",
    decimals: 1,
    minChange: 3,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#c2410c" },
    words: { decline: "less dust", increase: "dust increase", any: "dust change" },
    dataset: "air",
  },
  snow: {
    id: "snow",
    label: "Snow cover",
    noun: "snow cover",
    subject: "Snow cover",
    layerId: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
    product: "MODIS Terra monthly snow cover (MOD10CM), ~5 km",
    unit: "%",
    decimals: 1,
    minChange: 5,
    concern: "decline",
    season: "cold",
    colors: { decline: "#c2410c", increase: "#1d4ed8" },
    words: { decline: "snow cover loss", increase: "snow cover gain", any: "snow cover change" },
    dataset: "snow",
  },
};

export const INDICATOR_ORDER: IndicatorId[] = ["vegetation", "heat", "rainfall", "soil", "dust", "snow"];

/** Months for a season, flipped by six months for places south of the equator. */
export function seasonMonths(season: Exclude<SeasonId, "custom">, latitude = 0): number[] {
  const months = SEASONS[season].months;
  if (latitude >= 0 || season === "all") return months;
  return months.map((m) => ((m + 5) % 12) + 1);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Apr–Sep", "Jun–Aug", "Dec–Feb", "Jan, Mar, Jul" or "All months". */
export function monthsLabel(months: number[]): string {
  if (months.length >= 12) return "All months";
  if (!months.length) return "No months";
  // Consecutive (wrapping) runs read as ranges.
  const set = new Set(months);
  const start = months.find((m) => !set.has(((m + 10) % 12) + 1));
  if (start !== undefined) {
    const run: number[] = [];
    for (let m = start, i = 0; set.has(m) && i < 12; m = (m % 12) + 1, i++) run.push(m);
    if (run.length === months.length) return run.length === 1 ? MONTH_ABBR[run[0] - 1] : `${MONTH_ABBR[run[0] - 1]}–${MONTH_ABBR[run[run.length - 1] - 1]}`;
  }
  return [...months].sort((a, b) => a - b).map((m) => MONTH_ABBR[m - 1]).join(", ");
}
