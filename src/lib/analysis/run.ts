// The analysis engine: every number it returns comes from a NASA service.
//  • Satellite datasets: monthly GIBS products decoded pixel-by-pixel inside the area.
//  • Climate: NASA POWER monthly values (and 2001–2020 normals) at the area's centre,
//    averaged over several points for large areas.

import { createLimiter, createSharedCache, isAbortError, withRetry } from "../async";
import { cachedValue, TTL } from "../cache/store";
import { defaultEndMonth } from "./period";
import { areaKm2 as geometryArea, representativePoints, type PolygonGeometry } from "../geo/geometry";
import { getLayer, type GibsLayer } from "../gibs/catalog";
import { sampleArea, type AreaStats } from "../gibs/sample";
import { addMonthsToMonth, fetchTimeDomain, monthRange, monthsInDomain } from "../gibs/time";
import {
  averageClimatology,
  averageMonthly,
  daysInMonth,
  fetchPowerClimatology,
  fetchPowerMonthly,
  mjToKwh,
  type PowerClimatology,
  type PowerMonthly,
} from "./power";
import type {
  AnalysisProgress,
  AnalysisRequest,
  AnalysisResult,
  ClimatePoint,
  ClimateSeries,
  DatasetId,
  DatasetInfo,
  SatellitePoint,
  SatelliteSeries,
} from "./types";

export const DATASETS: DatasetInfo[] = [
  {
    id: "vegetation",
    label: "Vegetation health",
    description: "Plant greenness (NDVI) measured by MODIS every month.",
    source: "MODIS Terra monthly NDVI (MOD13A3) · NASA GIBS",
    layerId: "MODIS_Terra_L3_NDVI_Monthly",
    unit: "NDVI",
    decimals: 2,
    color: "#34d399",
  },
  {
    id: "surfaceHeat",
    label: "Surface heat",
    description: "Daytime temperature of the ground itself.",
    source: "MODIS Terra monthly land surface temperature (MOD11C3) · NASA GIBS",
    layerId: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    unit: "°C",
    decimals: 1,
    color: "#fb923c",
  },
  {
    id: "climate",
    label: "Climate",
    description: "Air temperature, rainfall, sunshine and soil moisture vs. the 2001–2020 normal.",
    source: "NASA POWER (MERRA-2 & CERES)",
    unit: "",
    decimals: 1,
    color: "#38bdf8",
  },
  {
    id: "air",
    label: "Aerosols & dust",
    description: "How hazy the air is (aerosol optical depth).",
    source: "MERRA-2 monthly aerosol optical thickness · NASA GIBS",
    layerId: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    unit: "AOD",
    decimals: 2,
    color: "#facc15",
  },
  {
    id: "snow",
    label: "Snow cover",
    description: "Average share of the area covered by snow.",
    source: "MODIS Terra monthly snow cover · NASA GIBS",
    layerId: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
    unit: "%",
    decimals: 0,
    color: "#a5b4fc",
  },
  {
    id: "evaporation",
    label: "Evaporation",
    description: "Water rising from the land into the air each month.",
    source: "MERRA-2 monthly evaporation from land · NASA GIBS",
    layerId: "MERRA2_Evaporation_Land_Monthly",
    unit: "mm/month",
    decimals: 1,
    color: "#2dd4bf",
  },
  {
    id: "sst",
    label: "Sea temperature",
    description: "Night-time temperature of the sea surface (areas with sea only).",
    source: "MODIS Terra monthly night sea surface temperature · NASA GIBS",
    layerId: "MODIS_Terra_L3_SST_Thermal_4km_Night_Monthly",
    unit: "°C",
    decimals: 1,
    color: "#fb7185",
  },
  {
    id: "so2",
    label: "Sulphur dioxide",
    description: "Sulphur dioxide in the air, from coal, oil, smelters and volcanoes.",
    source: "MERRA-2 monthly SO₂ column · NASA GIBS",
    layerId: "MERRA2_SO2_Column_Mass_Density_Monthly",
    unit: "mg/m²",
    decimals: 2,
    color: "#c084fc",
  },
  {
    id: "co",
    label: "Carbon monoxide",
    description: "Carbon monoxide about 5 km up, from fires, traffic and industry (from Sep 2002).",
    source: "AIRS (Aqua) monthly carbon monoxide at 500 hPa · NASA GIBS",
    layerId: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Monthly_Day",
    unit: "ppb",
    decimals: 0,
    color: "#fdba74",
  },
  {
    id: "upperAir",
    label: "Upper air (10 km)",
    description: "Air temperature about 10 km up, near where airliners fly.",
    source: "MERRA-2 monthly air temperature at 250 hPa · NASA GIBS",
    layerId: "MERRA2_Air_Temperature_250hPa_Monthly",
    unit: "°C",
    decimals: 1,
    color: "#93c5fd",
  },
  {
    id: "ozone",
    label: "Ozone layer",
    description: "Ozone about 20 km up, in the layer that blocks the Sun's ultraviolet light.",
    source: "MERRA-2 monthly ozone at 50 hPa · NASA GIBS",
    layerId: "MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly",
    unit: "ppm",
    decimals: 2,
    color: "#a78bfa",
  },
];

/** Read when no datasets are chosen: the original five (the others are one click away). */
export const DEFAULT_DATASETS: DatasetId[] = ["vegetation", "surfaceHeat", "climate", "air", "snow"];

export const DATASET_BY_ID = Object.fromEntries(DATASETS.map((d) => [d.id, d])) as Record<DatasetId, DatasetInfo>;

// ---------------------------------------------------------------------------
// Shared, de-duplicated request caches (per browser session)

const satelliteCache = createSharedCache<AreaStats>();
const powerCache = createSharedCache<PowerMonthly>();
const climatologyCache = createSharedCache<PowerClimatology>();

function hashString(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function geometryKey(geometry: PolygonGeometry): string {
  return hashString(JSON.stringify(geometry));
}

const gibsLimiter = createLimiter(6);
const powerLimiter = createLimiter(3);

/** Recent months can still be reprocessed by NASA, so they are kept for a shorter time. */
export function ttlForMonth(month: string, latest = defaultEndMonth()): number {
  return month >= addMonthsToMonth(latest, -1) ? TTL.recentGrid : TTL.grid;
}

function cachedSample(layer: GibsLayer, geometry: PolygonGeometry, key: string, month: string, signal?: AbortSignal): Promise<AreaStats> {
  const id = `${layer.id}|${key}|${month}`;
  return satelliteCache(
    id,
    (inner) =>
      cachedValue(`stats:${id}`, ttlForMonth(month), () =>
        gibsLimiter(() => withRetry(() => sampleArea({ layer, geometry, date: `${month}-01`, signal: inner }), { signal: inner, retries: 2 }), inner),
      ),
    signal,
  );
}

function toSatellitePoint(dataset: DatasetId, month: string, stats: AreaStats | null): SatellitePoint {
  if (!stats || stats.total === 0) return { month, value: null, p10: null, p90: null, coverage: 0 };
  if (dataset === "snow") {
    // Snow-free pixels are transparent in the snow product, so average over the
    // whole area treating them as 0 % snow.
    const total = stats.count ? stats.mean * stats.count : 0;
    return { month, value: total / stats.total, p10: null, p90: null, coverage: 1 };
  }
  if (stats.count === 0) return { month, value: null, p10: null, p90: null, coverage: 0 };
  return { month, value: stats.mean, p10: stats.p10, p90: stats.p90, coverage: stats.coverage };
}

async function runSatellite(
  dataset: Exclude<DatasetId, "climate">,
  request: AnalysisRequest,
  key: string,
  months: string[],
  signal: AbortSignal | undefined,
  tick: (label: string) => void,
): Promise<SatelliteSeries> {
  const info = DATASET_BY_ID[dataset];
  const layer = getLayer(info.layerId) as GibsLayer;
  const base: SatelliteSeries = {
    dataset,
    layerId: layer.id,
    label: info.label,
    unit: info.unit,
    decimals: info.decimals,
    source: info.source,
    points: [],
    latestAvailable: null,
    status: "ok",
  };

  let domainMonths = months;
  try {
    const domain = await fetchTimeDomain(layer);
    if (domain) {
      domainMonths = monthsInDomain(layer, domain, request.start, request.end);
      base.latestAvailable = domain.latest.slice(0, 7);
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
  const available = new Set(domainMonths);
  // Months that are not published yet still count toward progress.
  months.filter((m) => !available.has(m)).forEach(() => tick(info.label));

  let failures = 0;
  let lastError: unknown = null;
  const results = await Promise.all(
    months.map(async (month) => {
      if (!available.has(month)) return toSatellitePoint(dataset, month, null);
      try {
        const stats = await cachedSample(layer, request.target.geometry, key, month, signal);
        return toSatellitePoint(dataset, month, stats);
      } catch (error) {
        if (isAbortError(error)) throw error;
        failures += 1;
        lastError = error;
        return toSatellitePoint(dataset, month, null);
      } finally {
        tick(info.label);
      }
    }),
  );

  base.points = results;
  const hasValues = results.some((p) => p.value !== null);
  if (!hasValues) {
    base.status = failures > 0 && failures >= available.size ? "error" : "empty";
    if (base.status === "error") base.error = lastError instanceof Error ? lastError.message : "NASA GIBS could not be reached";
  }
  return base;
}

function cachedPower(point: [number, number], startYear: number, endYear: number, signal?: AbortSignal) {
  const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}|${startYear}-${endYear}`;
  return powerCache(key, (inner) => cachedValue(`power:${key}`, TTL.series, () => powerLimiter(() => fetchPowerMonthly(point, startYear, endYear, inner), inner)), signal);
}

function cachedClimatology(point: [number, number], signal?: AbortSignal) {
  const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
  return climatologyCache(key, (inner) => cachedValue(`normals:${key}`, TTL.series, () => powerLimiter(() => fetchPowerClimatology(point, inner), inner)), signal);
}

export function samplePointCount(areaKm2: number): number {
  if (areaKm2 > 60_000) return 5;
  if (areaKm2 > 6_000) return 3;
  return 1;
}

export function buildClimatePoints(months: string[], monthly: PowerMonthly, normals: PowerClimatology): ClimatePoint[] {
  return months.map((month) => {
    const m = Number(month.slice(5, 7)) - 1;
    const days = daysInMonth(month);
    const temp = monthly.T2M?.[month] ?? null;
    const tempNormal = normals.T2M?.[m] ?? null;
    const precipDaily = monthly.PRECTOTCORR?.[month] ?? null;
    const precipNormalDaily = normals.PRECTOTCORR?.[m] ?? null;
    const solar = monthly.ALLSKY_SFC_SW_DWN?.[month] ?? null;
    const solarNormal = normals.ALLSKY_SFC_SW_DWN?.[m] ?? null;
    const soil = monthly.GWETROOT?.[month] ?? null;
    const soilNormal = normals.GWETROOT?.[m] ?? null;
    return {
      month,
      temp,
      tempMax: monthly.T2M_MAX?.[month] ?? null,
      tempMin: monthly.T2M_MIN?.[month] ?? null,
      tempNormal,
      tempAnomaly: temp !== null && tempNormal !== null ? temp - tempNormal : null,
      precip: precipDaily !== null ? precipDaily * days : null,
      precipNormal: precipNormalDaily !== null ? precipNormalDaily * days : null,
      solar: solar !== null ? mjToKwh(solar) : null,
      solarNormal: solarNormal !== null ? mjToKwh(solarNormal) : null,
      humidity: monthly.RH2M?.[month] ?? null,
      wind: monthly.WS2M?.[month] ?? null,
      soil: soil !== null ? soil * 100 : null,
      soilNormal: soilNormal !== null ? soilNormal * 100 : null,
    };
  });
}

async function runClimate(request: AnalysisRequest, months: string[], signal: AbortSignal | undefined, tick: (label: string) => void): Promise<ClimateSeries> {
  const samplePoints = representativePoints(request.target.geometry, samplePointCount(request.target.areaKm2 || geometryArea(request.target.geometry)));
  const startYear = Number(request.start.slice(0, 4));
  const endYear = Number(request.end.slice(0, 4));
  try {
    const [monthlyList, normalsList] = await Promise.all([
      Promise.all(samplePoints.map((p) => cachedPower(p, startYear, endYear, signal).finally(() => tick("Climate")))),
      Promise.all(samplePoints.map((p) => cachedClimatology(p, signal).finally(() => tick("Climate")))),
    ]);
    const points = buildClimatePoints(months, averageMonthly(monthlyList), averageClimatology(normalsList));
    const hasValues = points.some((p) => p.temp !== null || p.precip !== null);
    return { status: hasValues ? "ok" : "empty", points, samplePoints };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      status: "error",
      error: error instanceof Error ? error.message : "NASA POWER could not be reached",
      points: [],
      samplePoints,
    };
  }
}

/** The months an analysis reads: the chosen ones, or every month from start to end. */
export function requestMonths(request: Pick<AnalysisRequest, "start" | "end" | "months">): string[] {
  return request.months ?? monthRange(request.start, request.end);
}

/** Monthly satellite maps an analysis needs (the load that takes time). */
export function countMaps(request: Pick<AnalysisRequest, "start" | "end" | "months" | "datasets">): number {
  return requestMonths(request).length * request.datasets.filter((d) => d !== "climate").length;
}

/** Requests to NASA POWER (monthly values and normals at each sample point). */
export function countClimateRequests(request: Pick<AnalysisRequest, "datasets" | "target">): number {
  return request.datasets.includes("climate") ? samplePointCount(request.target.areaKm2) * 2 : 0;
}

export function countTasks(request: AnalysisRequest): number {
  return countMaps(request) + countClimateRequests(request);
}

export async function runAnalysis(
  request: AnalysisRequest,
  options: { signal?: AbortSignal; onProgress?: (progress: AnalysisProgress) => void } = {},
): Promise<AnalysisResult> {
  const { signal, onProgress } = options;
  const months = requestMonths(request);
  const key = geometryKey(request.target.geometry);
  const total = Math.max(1, countTasks(request));
  let done = 0;
  const tick = (label: string) => {
    done = Math.min(total, done + 1);
    onProgress?.({ done, total, label });
  };
  onProgress?.({ done: 0, total, label: "Starting" });

  const satelliteIds = request.datasets.filter((d): d is Exclude<DatasetId, "climate"> => d !== "climate");
  const [satelliteSeries, climate] = await Promise.all([
    Promise.all(satelliteIds.map((id) => runSatellite(id, request, key, months, signal, tick))),
    request.datasets.includes("climate") ? runClimate(request, months, signal, tick) : Promise.resolve(undefined),
  ]);

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const satellite: AnalysisResult["satellite"] = {};
  satelliteSeries.forEach((series) => {
    satellite[series.dataset as Exclude<DatasetId, "climate">] = series;
  });

  return {
    target: request.target,
    start: request.start,
    end: request.end,
    datasets: request.datasets,
    months,
    period: request.period,
    generatedAt: new Date().toISOString(),
    satellite,
    climate,
  };
}
