// The measured quantities in an analysis, each as a list of monthly values. Charts, yearly
// summaries, period comparisons, trend verdicts and driver correlations all start here.

import type { MonthlyValue } from "./stats";
import type { AnalysisResult, ClimatePoint, DatasetId, SatelliteSeries } from "./types";

export type MetricId =
  | "ndvi"
  | "evi"
  | "lst"
  | "nightHeat"
  | "airTemp"
  | "rain"
  | "soil"
  | "humidity"
  | "wind"
  | "sunshine"
  | "topsoil"
  | "waterStorage"
  | "snow"
  | "snowWater"
  | "snowfall"
  | "evaporation"
  | "waterVapour"
  | "upperAir"
  | "ozone"
  | "heatLeaving"
  | "aod"
  | "dust"
  | "fineDust"
  | "so2"
  | "co"
  | "coGround"
  | "methane"
  | "sst"
  | "salinity";

export interface MetricDef {
  id: MetricId;
  dataset: DatasetId;
  /** "Vegetation (NDVI)" */
  label: string;
  /** Sentence subject: "Plant greenness (NDVI)". */
  subject: string;
  /** In the middle of a sentence: "vegetation is rising". */
  noun: string;
  /** Unit after numbers ("" for indices). */
  unit: string;
  decimals: number;
  color: string;
  /** Yearly value: the average of the months, or their total (rainfall). */
  aggregate: "mean" | "sum";
  /** Whether "−12%" is meaningful (not for temperatures in °C). */
  percent: boolean;
  /** The direction of change that is usually a worry ("none" when neither is). */
  concern: "decline" | "increase" | "none";
  source: string;
  /** First and last month of the record, when it isn't the whole satellite era (YYYY-MM). */
  first?: string;
  last?: string;
  /** Left out when no month reaches this (no snow to speak of in a desert). */
  minLevel?: number;
}

export const METRICS: MetricDef[] = [
  { id: "airTemp", dataset: "climate", label: "Air temperature", subject: "Air temperature", noun: "air temperature", unit: "°C", decimals: 1, color: "#38bdf8", aggregate: "mean", percent: false, concern: "increase", source: "NASA POWER (MERRA-2)" },
  { id: "rain", dataset: "climate", label: "Rainfall", subject: "Rainfall", noun: "rainfall", unit: "mm", decimals: 0, color: "#60a5fa", aggregate: "sum", percent: true, concern: "decline", source: "NASA POWER (MERRA-2, bias-corrected)" },
  { id: "soil", dataset: "climate", label: "Soil moisture", subject: "Root-zone soil wetness", noun: "soil moisture", unit: "%", decimals: 1, color: "#a3e635", aggregate: "mean", percent: false, concern: "decline", source: "NASA POWER (MERRA-2)" },
  { id: "humidity", dataset: "climate", label: "Humidity", subject: "Relative humidity", noun: "humidity", unit: "%", decimals: 1, color: "#67e8f9", aggregate: "mean", percent: false, concern: "none", source: "NASA POWER (MERRA-2)" },
  { id: "wind", dataset: "climate", label: "Wind", subject: "Wind speed near the ground", noun: "wind speed", unit: "m/s", decimals: 2, color: "#94a3b8", aggregate: "mean", percent: true, concern: "none", source: "NASA POWER (MERRA-2)" },
  { id: "sunshine", dataset: "climate", label: "Sunshine", subject: "Sunshine at the ground", noun: "sunshine", unit: "kWh/m²/day", decimals: 2, color: "#fbbf24", aggregate: "mean", percent: true, concern: "none", source: "NASA POWER (CERES)" },

  { id: "ndvi", dataset: "vegetation", label: "Vegetation (NDVI)", subject: "Plant greenness (NDVI)", noun: "plant greenness", unit: "", decimals: 3, color: "#34d399", aggregate: "mean", percent: true, concern: "decline", source: "MODIS Terra monthly NDVI" },
  { id: "evi", dataset: "evi", label: "Leaf density (EVI)", subject: "Leaf density (EVI)", noun: "leaf density", unit: "", decimals: 3, color: "#22c55e", aggregate: "mean", percent: true, concern: "decline", source: "MODIS Terra monthly EVI" },
  { id: "lst", dataset: "surfaceHeat", label: "Surface heat (day)", subject: "Daytime ground temperature", noun: "daytime ground heat", unit: "°C", decimals: 1, color: "#fb923c", aggregate: "mean", percent: false, concern: "increase", source: "MODIS Terra monthly land surface temperature" },
  { id: "nightHeat", dataset: "nightHeat", label: "Surface heat (night)", subject: "Night-time ground temperature", noun: "night-time ground heat", unit: "°C", decimals: 1, color: "#f97316", aggregate: "mean", percent: false, concern: "increase", source: "MODIS Terra monthly night-time land surface temperature" },
  { id: "evaporation", dataset: "evaporation", label: "Evaporation", subject: "Evaporation from land", noun: "evaporation", unit: "mm", decimals: 0, color: "#2dd4bf", aggregate: "sum", percent: true, concern: "none", source: "MERRA-2 monthly evaporation from land" },

  { id: "topsoil", dataset: "topsoil", label: "Topsoil moisture", subject: "Water in the top 10 cm of soil", noun: "topsoil moisture", unit: "%", decimals: 1, color: "#84cc16", aggregate: "mean", percent: false, concern: "decline", source: "GLDAS Noah monthly soil moisture, top 10 cm" },
  { id: "waterStorage", dataset: "waterStorage", label: "Water storage", subject: "Water stored on and under the land", noun: "water storage", unit: "cm", decimals: 1, color: "#0ea5e9", aggregate: "mean", percent: false, concern: "decline", source: "GRACE and GRACE-FO monthly water storage", first: "2002-04", last: "2022-07" },
  { id: "snow", dataset: "snow", label: "Snow cover", subject: "Snow cover", noun: "snow cover", unit: "%", decimals: 1, color: "#a5b4fc", aggregate: "mean", percent: false, concern: "decline", source: "MODIS Terra monthly snow cover", minLevel: 1 },
  { id: "snowWater", dataset: "snowWater", label: "Snow water", subject: "Water held in the snowpack", noun: "snow water", unit: "mm", decimals: 1, color: "#818cf8", aggregate: "mean", percent: true, concern: "decline", source: "AMSR2 monthly snow water equivalent", first: "2012-07", last: "2025-09", minLevel: 1 },
  { id: "snowfall", dataset: "snowfall", label: "Snowfall", subject: "Snowfall", noun: "snowfall", unit: "mm", decimals: 0, color: "#c7d2fe", aggregate: "sum", percent: true, concern: "none", source: "MERRA-2 monthly snowfall", minLevel: 1 },

  { id: "waterVapour", dataset: "waterVapour", label: "Water vapour", subject: "Water vapour in the air", noun: "water vapour", unit: "mm", decimals: 1, color: "#22d3ee", aggregate: "mean", percent: true, concern: "none", source: "MERRA-2 monthly total water vapour" },
  { id: "upperAir", dataset: "upperAir", label: "Upper air (10 km)", subject: "Air temperature about 10 km up", noun: "upper-air temperature", unit: "°C", decimals: 2, color: "#93c5fd", aggregate: "mean", percent: false, concern: "none", source: "MERRA-2 monthly air temperature at 250 hPa" },
  { id: "ozone", dataset: "ozone", label: "Ozone layer", subject: "Ozone about 20 km up", noun: "the ozone layer", unit: "ppm", decimals: 3, color: "#a78bfa", aggregate: "mean", percent: true, concern: "decline", source: "MERRA-2 monthly ozone at 50 hPa" },
  { id: "heatLeaving", dataset: "heatLeaving", label: "Heat leaving for space", subject: "Heat radiated out to space", noun: "heat leaving for space", unit: "W/m²", decimals: 1, color: "#fca5a5", aggregate: "mean", percent: false, concern: "none", source: "AIRS (Aqua) monthly outgoing longwave radiation", first: "2002-09" },

  { id: "aod", dataset: "air", label: "Haze (AOD)", subject: "Haze in the air (aerosol optical depth)", noun: "haze", unit: "", decimals: 3, color: "#facc15", aggregate: "mean", percent: true, concern: "increase", source: "MERRA-2 monthly aerosol optical thickness" },
  { id: "dust", dataset: "dust", label: "Dust", subject: "Dust near the ground", noun: "dust", unit: "µg/m³", decimals: 1, color: "#d97706", aggregate: "mean", percent: true, concern: "increase", source: "MERRA-2 monthly dust near the ground" },
  { id: "fineDust", dataset: "fineDust", label: "Fine dust (PM2.5)", subject: "Fine dust near the ground", noun: "fine dust", unit: "µg/m³", decimals: 1, color: "#b45309", aggregate: "mean", percent: true, concern: "increase", source: "MERRA-2 monthly fine dust (PM2.5)" },
  { id: "so2", dataset: "so2", label: "Sulphur dioxide (SO₂)", subject: "Sulphur dioxide in the air", noun: "sulphur dioxide", unit: "mg/m²", decimals: 2, color: "#c084fc", aggregate: "mean", percent: true, concern: "increase", source: "MERRA-2 monthly SO₂ column" },
  { id: "co", dataset: "co", label: "Carbon monoxide (CO)", subject: "Carbon monoxide about 5 km up", noun: "carbon monoxide", unit: "ppb", decimals: 1, color: "#fdba74", aggregate: "mean", percent: true, concern: "increase", source: "AIRS (Aqua) monthly carbon monoxide at 500 hPa", first: "2002-09" },
  { id: "coGround", dataset: "coGround", label: "CO near the ground", subject: "Carbon monoxide near the ground", noun: "carbon monoxide near the ground", unit: "ppb", decimals: 1, color: "#fb7185", aggregate: "mean", percent: true, concern: "increase", source: "MOPITT (Terra) monthly carbon monoxide near the ground", last: "2024-11" },
  { id: "methane", dataset: "methane", label: "Methane (CH₄)", subject: "Methane about 7 km up", noun: "methane", unit: "ppb", decimals: 0, color: "#bef264", aggregate: "mean", percent: true, concern: "increase", source: "AIRS (Aqua) monthly methane at 400 hPa", first: "2002-09" },

  { id: "sst", dataset: "sst", label: "Sea temperature", subject: "Sea surface temperature (night)", noun: "sea temperature", unit: "°C", decimals: 2, color: "#f472b6", aggregate: "mean", percent: false, concern: "increase", source: "MODIS Terra monthly night sea surface temperature", first: "2000-08" },
  { id: "salinity", dataset: "salinity", label: "Sea salinity", subject: "Sea surface salinity", noun: "sea salinity", unit: "PSU", decimals: 2, color: "#7dd3fc", aggregate: "mean", percent: false, concern: "none", source: "SMAP monthly sea surface salinity", first: "2015-04" },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDef>;

/** Satellite months where less than this share of the area was measured are left out. */
export const MIN_COVERAGE = 0.1;

export function satelliteValues(series: SatelliteSeries | undefined): MonthlyValue[] {
  if (!series) return [];
  return series.points.map((p) => ({ month: p.month, value: p.value !== null && p.coverage >= MIN_COVERAGE ? p.value : null }));
}

export function climateValues(points: ClimatePoint[], key: keyof ClimatePoint): MonthlyValue[] {
  return points.map((p) => ({ month: p.month, value: (p[key] as number | null) ?? null }));
}

/** Which value of a NASA POWER month each climate measure is. */
const CLIMATE_KEYS: Partial<Record<MetricId, keyof ClimatePoint>> = {
  airTemp: "temp",
  rain: "precip",
  soil: "soil",
  humidity: "humidity",
  wind: "wind",
  sunshine: "solar",
};

export function metricValues(result: AnalysisResult, id: MetricId): MonthlyValue[] {
  const key = CLIMATE_KEYS[id];
  if (key) return climateValues(result.climate?.status === "ok" ? result.climate.points : [], key);
  // Every other measure is one NASA GIBS satellite or model map per month.
  return satelliteValues(result.satellite[METRIC_BY_ID[id].dataset as Exclude<DatasetId, "climate">]);
}

/** Metrics with at least one measured month (snow only when some snow was seen). */
export function measuredMetrics(result: AnalysisResult): MetricDef[] {
  return METRICS.filter((metric) => {
    const values = metricValues(result, metric.id);
    if (metric.minLevel !== undefined) return values.some((v) => (v.value ?? 0) >= (metric.minLevel as number));
    return values.some((v) => v.value !== null);
  });
}

export function formatValue(value: number, metric: MetricDef, decimals = metric.decimals): string {
  return `${value.toFixed(decimals)}${metric.unit ? ` ${metric.unit}` : ""}`;
}
