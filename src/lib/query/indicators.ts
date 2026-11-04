// What each searchable indicator means, which NASA product measures it as a gridded
// monthly map, and how to read a change in it.

import type { DatasetId } from "../analysis/types";

export type IndicatorId = "vegetation" | "heat" | "rainfall" | "soil" | "dust" | "snow" | "airTemp" | "evaporation" | "sst" | "so2" | "co" | "upperAir" | "ozone";
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
  /** Ground resolution of the product in degrees (no point scanning finer than this). */
  nativeDeg: number;
  /** The direction that usually means trouble (drives colours and wording); "none" when neither does. */
  concern: "decline" | "increase" | "none";
  /** Default months to compare, so the seasonal cycle can't fake a change. */
  season: Exclude<SeasonId, "custom">;
  /** Colours for the change map: falling values / rising values. */
  colors: { decline: string; increase: string };
  /** Words for each direction in titles. */
  words: { decline: string; increase: string; any: string };
  /** Matching Analysis-page dataset (rainfall and soil moisture come from NASA POWER there). */
  dataset: DatasetId;
  /** Where the product has values: land only, the sea only, or everywhere (the air above both). */
  surface: "land" | "water" | "any";
  /** Group in the measure picker. */
  group: "land" | "air" | "ocean";
  /** First month NASA publishes, when later than the MODIS record (e.g. AIRS from September 2002). */
  firstMonth?: string;
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
    nativeDeg: 0.01,
    concern: "decline",
    season: "growing",
    colors: { decline: "#b45309", increase: "#15803d" },
    words: { decline: "vegetation decline", increase: "greening", any: "vegetation change" },
    dataset: "vegetation",
    surface: "land",
    group: "land",
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
    nativeDeg: 0.05,
    concern: "increase",
    season: "summer",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "surface cooling", increase: "surface warming", any: "surface temperature change" },
    dataset: "surfaceHeat",
    surface: "land",
    group: "land",
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
    nativeDeg: 0.5,
    concern: "decline",
    season: "all",
    colors: { decline: "#a16207", increase: "#0369a1" },
    words: { decline: "drying", increase: "wetting", any: "rainfall change" },
    dataset: "climate",
    surface: "land",
    group: "air",
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
    nativeDeg: 0.5,
    concern: "decline",
    season: "all",
    colors: { decline: "#a16207", increase: "#0e7490" },
    words: { decline: "soil drying", increase: "soil wetting", any: "soil moisture change" },
    dataset: "climate",
    surface: "land",
    group: "land",
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
    nativeDeg: 0.5,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#c2410c" },
    words: { decline: "less dust", increase: "dust increase", any: "dust change" },
    dataset: "air",
    surface: "land",
    group: "air",
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
    nativeDeg: 0.05,
    concern: "decline",
    season: "cold",
    colors: { decline: "#c2410c", increase: "#1d4ed8" },
    words: { decline: "snow cover loss", increase: "snow cover gain", any: "snow cover change" },
    dataset: "snow",
    surface: "land",
    group: "land",
  },

  airTemp: {
    id: "airTemp",
    label: "Air temperature",
    noun: "air temperature",
    subject: "Air temperature near the ground",
    layerId: "MERRA2_2m_Air_Temperature_Assimilated_Monthly",
    product: "MERRA-2 monthly air temperature at 2 m, ~50 km",
    unit: "°C",
    decimals: 2,
    minChange: 0.5,
    nativeDeg: 0.5,
    concern: "increase",
    season: "all",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "air cooling", increase: "air warming", any: "air temperature change" },
    dataset: "climate",
    surface: "any",
    group: "air",
  },
  evaporation: {
    id: "evaporation",
    label: "Evaporation",
    noun: "evaporation",
    subject: "Monthly evaporation from land",
    layerId: "MERRA2_Evaporation_Land_Monthly",
    product: "MERRA-2 monthly evaporation from land, ~50 km",
    unit: "mm/month",
    decimals: 1,
    minChange: 3,
    nativeDeg: 0.5,
    concern: "none",
    season: "all",
    colors: { decline: "#a16207", increase: "#0e7490" },
    words: { decline: "less evaporation", increase: "more evaporation", any: "evaporation change" },
    dataset: "evaporation",
    surface: "land",
    group: "land",
  },
  sst: {
    id: "sst",
    label: "Sea temperature",
    noun: "sea surface temperature",
    subject: "Sea surface temperature (night)",
    layerId: "MODIS_Terra_L3_SST_Thermal_4km_Night_Monthly",
    product: "MODIS Terra monthly night-time sea surface temperature, ~4 km",
    unit: "°C",
    decimals: 2,
    minChange: 0.3,
    nativeDeg: 0.04,
    concern: "increase",
    season: "all",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "sea cooling", increase: "sea warming", any: "sea temperature change" },
    dataset: "sst",
    surface: "water",
    group: "ocean",
    firstMonth: "2000-08",
  },
  so2: {
    id: "so2",
    label: "Sulphur dioxide",
    noun: "sulphur dioxide",
    subject: "Sulphur dioxide in the air",
    layerId: "MERRA2_SO2_Column_Mass_Density_Monthly",
    product: "MERRA-2 monthly sulphur dioxide (SO₂) column, ~50 km",
    unit: "mg/m²",
    decimals: 2,
    minChange: 1,
    nativeDeg: 0.5,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#b91c1c" },
    words: { decline: "less sulphur dioxide", increase: "more sulphur dioxide", any: "sulphur dioxide change" },
    dataset: "so2",
    surface: "any",
    group: "air",
  },
  co: {
    id: "co",
    label: "Carbon monoxide",
    noun: "carbon monoxide",
    subject: "Carbon monoxide about 5 km up",
    layerId: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Monthly_Day",
    product: "AIRS (Aqua) monthly carbon monoxide at 500 hPa, ~100 km",
    unit: "ppb",
    decimals: 1,
    minChange: 5,
    nativeDeg: 1,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#b91c1c" },
    words: { decline: "less carbon monoxide", increase: "more carbon monoxide", any: "carbon monoxide change" },
    dataset: "co",
    surface: "any",
    group: "air",
    firstMonth: "2002-09",
  },
  upperAir: {
    id: "upperAir",
    label: "Upper air (10 km)",
    noun: "upper-air temperature",
    subject: "Air temperature about 10 km up",
    layerId: "MERRA2_Air_Temperature_250hPa_Monthly",
    product: "MERRA-2 monthly air temperature at 250 hPa (about 10 km up), ~50 km",
    unit: "°C",
    decimals: 2,
    minChange: 0.5,
    nativeDeg: 0.5,
    concern: "none",
    season: "all",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "upper-air cooling", increase: "upper-air warming", any: "upper-air temperature change" },
    dataset: "upperAir",
    surface: "any",
    group: "air",
  },
  ozone: {
    id: "ozone",
    label: "Ozone layer",
    noun: "ozone layer",
    subject: "Ozone about 20 km up",
    layerId: "MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly",
    product: "MERRA-2 monthly ozone at 50 hPa (about 20 km up), ~50 km",
    unit: "ppm",
    decimals: 2,
    minChange: 0.1,
    nativeDeg: 0.5,
    concern: "decline",
    season: "all",
    colors: { decline: "#9333ea", increase: "#0369a1" },
    words: { decline: "ozone thinning", increase: "ozone recovery", any: "ozone change" },
    dataset: "ozone",
    surface: "any",
    group: "air",
  },
};

/** Every measure, in the order tabs and lists use. */
export const INDICATOR_ORDER: IndicatorId[] = ["vegetation", "heat", "rainfall", "soil", "dust", "snow", "airTemp", "evaporation", "sst", "so2", "co", "upperAir", "ozone"];

/** The six measures scanned for "what changed" when nothing better is known about the place. */
export const CORE_INDICATORS: IndicatorId[] = ["vegetation", "heat", "rainfall", "soil", "dust", "snow"];

/** The record's first month for a measure. */
export function firstMonthOf(id: IndicatorId): string {
  return INDICATORS[id].firstMonth ?? "2000-03";
}

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
