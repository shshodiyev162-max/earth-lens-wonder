// The measured quantities in an analysis, each as a list of monthly values. Charts, yearly
// summaries, period comparisons, trend verdicts and driver correlations all start here.

import type { MonthlyValue } from "./stats";
import type { AnalysisResult, ClimatePoint, DatasetId, SatelliteSeries } from "./types";

export type MetricId = "ndvi" | "lst" | "airTemp" | "rain" | "soil" | "aod" | "snow" | "evaporation" | "sst" | "so2" | "co" | "upperAir" | "ozone";

export interface MetricDef {
  id: MetricId;
  dataset: DatasetId;
  /** "Vegetation (NDVI)" */
  label: string;
  /** Sentence subject: "Plant greenness (NDVI)". */
  subject: string;
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
}

export const METRICS: MetricDef[] = [
  { id: "ndvi", dataset: "vegetation", label: "Vegetation (NDVI)", subject: "Plant greenness (NDVI)", unit: "", decimals: 3, color: "#34d399", aggregate: "mean", percent: true, concern: "decline", source: "MODIS Terra monthly NDVI" },
  { id: "lst", dataset: "surfaceHeat", label: "Surface heat (day)", subject: "Daytime ground temperature", unit: "°C", decimals: 1, color: "#fb923c", aggregate: "mean", percent: false, concern: "increase", source: "MODIS Terra monthly land surface temperature" },
  { id: "airTemp", dataset: "climate", label: "Air temperature", subject: "Air temperature", unit: "°C", decimals: 1, color: "#38bdf8", aggregate: "mean", percent: false, concern: "increase", source: "NASA POWER (MERRA-2)" },
  { id: "rain", dataset: "climate", label: "Rainfall", subject: "Rainfall", unit: "mm", decimals: 0, color: "#60a5fa", aggregate: "sum", percent: true, concern: "decline", source: "NASA POWER (MERRA-2, bias-corrected)" },
  { id: "soil", dataset: "climate", label: "Soil moisture", subject: "Root-zone soil wetness", unit: "%", decimals: 1, color: "#a3e635", aggregate: "mean", percent: false, concern: "decline", source: "NASA POWER (MERRA-2)" },
  { id: "aod", dataset: "air", label: "Aerosols (AOD)", subject: "Aerosol optical depth", unit: "", decimals: 3, color: "#facc15", aggregate: "mean", percent: true, concern: "increase", source: "MERRA-2 monthly aerosol optical thickness" },
  { id: "snow", dataset: "snow", label: "Snow cover", subject: "Snow cover", unit: "%", decimals: 1, color: "#a5b4fc", aggregate: "mean", percent: false, concern: "decline", source: "MODIS Terra monthly snow cover" },
  { id: "evaporation", dataset: "evaporation", label: "Evaporation", subject: "Evaporation from land", unit: "mm", decimals: 0, color: "#2dd4bf", aggregate: "sum", percent: true, concern: "none", source: "MERRA-2 monthly evaporation from land" },
  { id: "sst", dataset: "sst", label: "Sea temperature", subject: "Sea surface temperature (night)", unit: "°C", decimals: 2, color: "#fb7185", aggregate: "mean", percent: false, concern: "increase", source: "MODIS Terra monthly night sea surface temperature" },
  { id: "so2", dataset: "so2", label: "Sulphur dioxide (SO₂)", subject: "Sulphur dioxide in the air", unit: "mg/m²", decimals: 2, color: "#c084fc", aggregate: "mean", percent: true, concern: "increase", source: "MERRA-2 monthly SO₂ column" },
  { id: "co", dataset: "co", label: "Carbon monoxide (CO)", subject: "Carbon monoxide about 5 km up", unit: "ppb", decimals: 1, color: "#fdba74", aggregate: "mean", percent: true, concern: "increase", source: "AIRS (Aqua) monthly carbon monoxide at 500 hPa" },
  { id: "upperAir", dataset: "upperAir", label: "Upper air (10 km)", subject: "Air temperature about 10 km up", unit: "°C", decimals: 2, color: "#93c5fd", aggregate: "mean", percent: false, concern: "none", source: "MERRA-2 monthly air temperature at 250 hPa" },
  { id: "ozone", dataset: "ozone", label: "Ozone layer", subject: "Ozone about 20 km up", unit: "ppm", decimals: 3, color: "#a78bfa", aggregate: "mean", percent: true, concern: "decline", source: "MERRA-2 monthly ozone at 50 hPa" },
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

export function metricValues(result: AnalysisResult, id: MetricId): MonthlyValue[] {
  const climate = result.climate?.status === "ok" ? result.climate.points : [];
  switch (id) {
    case "airTemp":
      return climateValues(climate, "temp");
    case "rain":
      return climateValues(climate, "precip");
    case "soil":
      return climateValues(climate, "soil");
    default:
      // Every other measure is one NASA GIBS satellite or model map per month.
      return satelliteValues(result.satellite[METRIC_BY_ID[id].dataset as Exclude<DatasetId, "climate">]);
  }
}

/** Metrics with at least one measured month (snow only when some snow was seen). */
export function measuredMetrics(result: AnalysisResult): MetricDef[] {
  return METRICS.filter((metric) => {
    const values = metricValues(result, metric.id);
    if (metric.id === "snow") return values.some((v) => (v.value ?? 0) >= 1);
    return values.some((v) => v.value !== null);
  });
}

export function formatValue(value: number, metric: MetricDef, decimals = metric.decimals): string {
  return `${value.toFixed(decimals)}${metric.unit ? ` ${metric.unit}` : ""}`;
}
