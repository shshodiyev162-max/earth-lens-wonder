// The measured quantities in an analysis, each as a list of monthly values. Charts, yearly
// summaries, period comparisons, trend verdicts and driver correlations all start here.

import type { MonthlyValue } from "./stats";
import type { AnalysisResult, ClimatePoint, DatasetId, SatelliteSeries } from "./types";

export type MetricId = "ndvi" | "lst" | "airTemp" | "rain" | "soil" | "aod" | "snow";

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
  source: string;
}

export const METRICS: MetricDef[] = [
  { id: "ndvi", dataset: "vegetation", label: "Vegetation (NDVI)", subject: "Plant greenness (NDVI)", unit: "", decimals: 3, color: "#34d399", aggregate: "mean", percent: true, source: "MODIS Terra monthly NDVI" },
  { id: "lst", dataset: "surfaceHeat", label: "Surface heat (day)", subject: "Daytime ground temperature", unit: "°C", decimals: 1, color: "#fb923c", aggregate: "mean", percent: false, source: "MODIS Terra monthly land surface temperature" },
  { id: "airTemp", dataset: "climate", label: "Air temperature", subject: "Air temperature", unit: "°C", decimals: 1, color: "#38bdf8", aggregate: "mean", percent: false, source: "NASA POWER (MERRA-2)" },
  { id: "rain", dataset: "climate", label: "Rainfall", subject: "Rainfall", unit: "mm", decimals: 0, color: "#60a5fa", aggregate: "sum", percent: true, source: "NASA POWER (MERRA-2, bias-corrected)" },
  { id: "soil", dataset: "climate", label: "Soil moisture", subject: "Root-zone soil wetness", unit: "%", decimals: 1, color: "#a3e635", aggregate: "mean", percent: false, source: "NASA POWER (MERRA-2)" },
  { id: "aod", dataset: "air", label: "Aerosols (AOD)", subject: "Aerosol optical depth", unit: "", decimals: 3, color: "#facc15", aggregate: "mean", percent: true, source: "MERRA-2 monthly aerosol optical thickness" },
  { id: "snow", dataset: "snow", label: "Snow cover", subject: "Snow cover", unit: "%", decimals: 1, color: "#a5b4fc", aggregate: "mean", percent: false, source: "MODIS Terra monthly snow cover" },
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
    case "ndvi":
      return satelliteValues(result.satellite.vegetation);
    case "lst":
      return satelliteValues(result.satellite.surfaceHeat);
    case "aod":
      return satelliteValues(result.satellite.air);
    case "snow":
      return satelliteValues(result.satellite.snow);
    case "airTemp":
      return climateValues(climate, "temp");
    case "rain":
      return climateValues(climate, "precip");
    case "soil":
      return climateValues(climate, "soil");
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
