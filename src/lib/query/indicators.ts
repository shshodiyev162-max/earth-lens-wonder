// What each searchable indicator means, which NASA product measures it as a gridded
// monthly map, and how to read a change in it.

import type { DatasetId } from "../analysis/types";

export type IndicatorId =
  | "vegetation"
  | "heat"
  | "rainfall"
  | "soil"
  | "dust"
  | "snow"
  | "airTemp"
  | "evaporation"
  | "sst"
  | "so2"
  | "co"
  | "upperAir"
  | "ozone"
  | "evi"
  | "nightHeat"
  | "sunlight"
  | "topsoil"
  | "waterStorage"
  | "snowWater"
  | "snowfall"
  | "humidity"
  | "waterVapour"
  | "wind"
  | "heatLeaving"
  | "fineDust"
  | "haze"
  | "coGround"
  | "methane"
  | "salinity";
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
  group: MeasureGroup;
  /** First month NASA publishes, when later than the MODIS record (e.g. AIRS from September 2002). */
  firstMonth?: string;
  /** Last month NASA publishes, when the record has ended (e.g. GRACE to July 2022). */
  lastMonth?: string;
}

export type MeasureGroup = "land" | "water" | "air" | "gases" | "ocean";

/** The groups in the measure pickers, in order. */
export const MEASURE_GROUPS: { id: MeasureGroup; label: string }[] = [
  { id: "land", label: "Land and plants" },
  { id: "water", label: "Water and snow" },
  { id: "air", label: "Weather and upper air" },
  { id: "gases", label: "Gases and dust" },
  { id: "ocean", label: "Sea" },
];

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
    group: "water",
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
    group: "water",
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
    group: "gases",
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
    group: "water",
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
    group: "gases",
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
    group: "gases",
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
    noun: "the ozone layer",
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

  evi: {
    id: "evi",
    label: "Leaf density (EVI)",
    noun: "leaf density",
    subject: "Leaf density (EVI)",
    layerId: "MODIS_Terra_L3_EVI_Monthly",
    product: "MODIS Terra monthly enhanced vegetation index (MOD13A3), ~1 km",
    unit: "EVI",
    decimals: 3,
    minChange: 0.02,
    nativeDeg: 0.01,
    concern: "decline",
    season: "growing",
    colors: { decline: "#b45309", increase: "#15803d" },
    words: { decline: "thinning leaves", increase: "denser leaves", any: "leaf density change" },
    dataset: "evi",
    surface: "land",
    group: "land",
  },
  nightHeat: {
    id: "nightHeat",
    label: "Night heat",
    noun: "night-time land temperature",
    subject: "Night-time land surface temperature",
    layerId: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night",
    product: "MODIS Terra monthly night-time land surface temperature (MOD11C3), ~5 km",
    unit: "°C",
    decimals: 2,
    minChange: 0.5,
    nativeDeg: 0.05,
    concern: "increase",
    season: "summer",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "cooler nights", increase: "warmer nights", any: "night-time temperature change" },
    dataset: "nightHeat",
    surface: "land",
    group: "land",
  },
  sunlight: {
    id: "sunlight",
    label: "Sunlight at ground",
    noun: "sunlight at the ground",
    subject: "Sunlight reaching the ground",
    layerId: "MERRA2_Incident_Shortwave_Over_Land_Monthly",
    product: "MERRA-2 monthly sunlight reaching the land, ~50 km",
    unit: "W/m²",
    decimals: 1,
    minChange: 3,
    nativeDeg: 0.5,
    concern: "none",
    season: "all",
    colors: { decline: "#475569", increase: "#ca8a04" },
    words: { decline: "dimming", increase: "brightening", any: "sunlight change" },
    dataset: "climate",
    surface: "land",
    group: "land",
  },
  topsoil: {
    id: "topsoil",
    label: "Topsoil moisture",
    noun: "topsoil moisture",
    subject: "Water in the top 10 cm of soil",
    layerId: "GLDAS_Underground_Soil_Moisture_Monthly",
    product: "GLDAS Noah monthly soil moisture, top 10 cm, ~25 km",
    unit: "% vol",
    decimals: 1,
    minChange: 1,
    nativeDeg: 0.25,
    concern: "decline",
    season: "all",
    colors: { decline: "#a16207", increase: "#0e7490" },
    words: { decline: "topsoil drying", increase: "topsoil wetting", any: "topsoil moisture change" },
    dataset: "topsoil",
    surface: "land",
    group: "water",
  },
  waterStorage: {
    id: "waterStorage",
    label: "Water storage",
    noun: "water storage",
    subject: "Water stored on and under the land",
    layerId: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
    product: "GRACE and GRACE-FO monthly water storage (change in the water held on and under the land), ~300 km",
    unit: "cm",
    decimals: 1,
    minChange: 3,
    nativeDeg: 0.5,
    concern: "decline",
    season: "all",
    colors: { decline: "#b91c1c", increase: "#0369a1" },
    words: { decline: "water loss", increase: "water gain", any: "water storage change" },
    dataset: "waterStorage",
    surface: "land",
    group: "water",
    firstMonth: "2002-04",
    lastMonth: "2022-07",
  },
  snowWater: {
    id: "snowWater",
    label: "Snow water",
    noun: "snow water",
    subject: "Water held in the snowpack",
    layerId: "AMSRU2_Snow_Water_Equivalent_Monthly",
    product: "AMSR2 monthly snow water equivalent, ~25 km",
    unit: "mm",
    decimals: 1,
    minChange: 3,
    nativeDeg: 0.25,
    concern: "decline",
    season: "cold",
    colors: { decline: "#c2410c", increase: "#1d4ed8" },
    words: { decline: "thinner snowpack", increase: "deeper snowpack", any: "snowpack change" },
    dataset: "snowWater",
    surface: "land",
    group: "water",
    firstMonth: "2012-07",
    lastMonth: "2025-09",
  },
  snowfall: {
    id: "snowfall",
    label: "Snowfall",
    noun: "snowfall",
    subject: "Monthly snowfall",
    layerId: "MERRA2_Snowfall_Monthly",
    product: "MERRA-2 monthly snowfall, ~50 km",
    unit: "mm/month",
    decimals: 1,
    minChange: 3,
    nativeDeg: 0.5,
    concern: "none",
    season: "cold",
    colors: { decline: "#c2410c", increase: "#1d4ed8" },
    words: { decline: "less snowfall", increase: "more snowfall", any: "snowfall change" },
    dataset: "snowfall",
    surface: "any",
    group: "water",
  },
  humidity: {
    id: "humidity",
    label: "Humidity",
    noun: "humidity",
    subject: "Relative humidity near the surface",
    layerId: "AIRS_L3_Surface_Relative_Humidity_Monthly_Day",
    product: "AIRS (Aqua) monthly daytime relative humidity near the surface, ~100 km",
    unit: "%",
    decimals: 1,
    minChange: 1.5,
    nativeDeg: 1,
    concern: "none",
    season: "all",
    colors: { decline: "#a16207", increase: "#0e7490" },
    words: { decline: "drier air", increase: "more humid air", any: "humidity change" },
    dataset: "climate",
    surface: "any",
    group: "air",
    firstMonth: "2002-09",
  },
  waterVapour: {
    id: "waterVapour",
    label: "Water vapour",
    noun: "water vapour",
    subject: "Water vapour in the air",
    layerId: "MERRA2_Total_Precipitable_Water_Vapor_Monthly",
    product: "MERRA-2 monthly water vapour in the whole column of air, ~50 km",
    unit: "mm",
    decimals: 1,
    minChange: 1,
    nativeDeg: 0.5,
    concern: "none",
    season: "all",
    colors: { decline: "#a16207", increase: "#0e7490" },
    words: { decline: "less water vapour", increase: "more water vapour", any: "water vapour change" },
    dataset: "waterVapour",
    surface: "any",
    group: "air",
  },
  wind: {
    id: "wind",
    label: "Wind",
    noun: "wind speed",
    subject: "Wind speed near the surface",
    layerId: "MERRA2_Surface_Wind_Speed_Monthly",
    product: "MERRA-2 monthly wind speed near the surface, ~50 km",
    unit: "m/s",
    decimals: 2,
    minChange: 0.2,
    nativeDeg: 0.5,
    concern: "none",
    season: "all",
    colors: { decline: "#475569", increase: "#0f766e" },
    words: { decline: "calmer winds", increase: "stronger winds", any: "wind speed change" },
    dataset: "climate",
    surface: "any",
    group: "air",
  },
  heatLeaving: {
    id: "heatLeaving",
    label: "Heat leaving for space",
    noun: "the heat leaving for space",
    subject: "Heat radiated out to space",
    layerId: "AIRS_L3_All_Sky_Outgoing_Longwave_Radiation_Monthly_Day",
    product: "AIRS (Aqua) monthly daytime outgoing longwave radiation, ~100 km",
    unit: "W/m²",
    decimals: 1,
    minChange: 2,
    nativeDeg: 1,
    concern: "none",
    season: "all",
    colors: { decline: "#2563eb", increase: "#dc2626" },
    words: { decline: "less heat leaving", increase: "more heat leaving", any: "outgoing heat change" },
    dataset: "heatLeaving",
    surface: "any",
    group: "air",
    firstMonth: "2002-09",
  },
  fineDust: {
    id: "fineDust",
    label: "Fine dust (PM2.5)",
    noun: "fine dust",
    subject: "Fine dust near the ground",
    layerId: "MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly",
    product: "MERRA-2 monthly fine dust (PM2.5) near the ground, ~50 km",
    unit: "µg/m³",
    decimals: 1,
    minChange: 2,
    nativeDeg: 0.5,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#c2410c" },
    words: { decline: "less fine dust", increase: "more fine dust", any: "fine dust change" },
    dataset: "fineDust",
    surface: "any",
    group: "gases",
  },
  haze: {
    id: "haze",
    label: "Haze (AOD)",
    noun: "haze",
    subject: "Haze in the air (aerosol optical depth)",
    layerId: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    product: "MERRA-2 monthly aerosol optical thickness at 550 nm, ~50 km",
    unit: "AOD",
    decimals: 3,
    minChange: 0.02,
    nativeDeg: 0.5,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#b45309" },
    words: { decline: "clearer air", increase: "hazier air", any: "haze change" },
    dataset: "air",
    surface: "any",
    group: "gases",
  },
  coGround: {
    id: "coGround",
    label: "CO near the ground",
    noun: "carbon monoxide near the ground",
    subject: "Carbon monoxide near the ground",
    layerId: "MOPITT_CO_Monthly_Surface_Mixing_Ratio_Day",
    product: "MOPITT (Terra) monthly daytime carbon monoxide near the ground, ~100 km",
    unit: "ppb",
    decimals: 1,
    minChange: 5,
    nativeDeg: 1,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#b91c1c" },
    words: { decline: "less carbon monoxide near the ground", increase: "more carbon monoxide near the ground", any: "ground-level carbon monoxide change" },
    dataset: "coGround",
    surface: "any",
    group: "gases",
    lastMonth: "2024-11",
  },
  methane: {
    id: "methane",
    label: "Methane",
    noun: "methane",
    subject: "Methane about 7 km up",
    layerId: "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day",
    product: "AIRS (Aqua) monthly daytime methane at 400 hPa, ~100 km",
    unit: "ppb",
    decimals: 1,
    minChange: 15,
    nativeDeg: 1,
    concern: "increase",
    season: "all",
    colors: { decline: "#0f766e", increase: "#b91c1c" },
    words: { decline: "less methane", increase: "more methane", any: "methane change" },
    dataset: "methane",
    surface: "any",
    group: "gases",
    firstMonth: "2002-09",
  },
  salinity: {
    id: "salinity",
    label: "Sea salinity",
    noun: "sea salinity",
    subject: "Sea surface salinity",
    layerId: "SMAP_L3_Sea_Surface_Salinity_CAP_Monthly",
    product: "SMAP monthly sea surface salinity, ~70 km",
    unit: "PSU",
    decimals: 2,
    minChange: 0.1,
    nativeDeg: 0.25,
    concern: "none",
    season: "all",
    colors: { decline: "#0369a1", increase: "#b45309" },
    words: { decline: "fresher sea", increase: "saltier sea", any: "salinity change" },
    dataset: "salinity",
    surface: "water",
    group: "ocean",
    firstMonth: "2015-04",
  },
};

/** Every measure, in the order tabs and lists use. */
export const INDICATOR_ORDER: IndicatorId[] = ["vegetation", "heat", "rainfall", "soil", "dust", "snow", "airTemp", "evaporation", "sst", "so2", "co", "upperAir", "ozone", "evi", "nightHeat", "sunlight", "topsoil", "waterStorage", "snowWater", "snowfall", "humidity", "waterVapour", "wind", "heatLeaving", "fineDust", "haze", "coGround", "methane", "salinity"];

/** The six measures scanned for "what changed" when nothing better is known about the place. */
export const CORE_INDICATORS: IndicatorId[] = ["vegetation", "heat", "rainfall", "soil", "dust", "snow"];

/** The record's first month for a measure. */
export function firstMonthOf(id: IndicatorId): string {
  return INDICATORS[id].firstMonth ?? "2000-03";
}

/** A short tag for a record that started late or has ended ("from 2015", "to 2022", "2012–2025"), or null for the full record. */
export function recordTag(id: IndicatorId): string | null {
  const { firstMonth, lastMonth } = INDICATORS[id];
  const first = firstMonth && firstMonth >= "2005" ? firstMonth.slice(0, 4) : null;
  const last = lastMonth?.slice(0, 4) ?? null;
  if (first && last) return `${first}–${last}`;
  if (first) return `from ${first}`;
  return last ? `to ${last}` : null;
}

/** "−12%" says nothing for a temperature, a value that is already a share, or one measured from an average (water storage crosses zero). */
export function percentChangeMeansSomething(indicator: Pick<Indicator, "id" | "unit">): boolean {
  return indicator.unit !== "°C" && indicator.unit !== "%" && indicator.id !== "waterStorage";
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** "twenty-nine", for counts written in sentences. */
export function numberInWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n >= 100) return String(n);
  return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)];
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
