// The analysis engine: every number it returns comes from a NASA service.
//  • Satellite datasets: monthly GIBS products decoded pixel-by-pixel inside the area.
//  • Climate: NASA POWER monthly values (and 2001–2020 normals) at the area's centre,
//    averaged over several points for large areas.

import { createLimiter, createSharedCache, isAbortError, withRetry } from "../async";
import { cachedValue, TTL } from "../cache/store";
import { defaultEndMonth } from "./period";
import { areaKm2 as geometryArea, representativePoints, type LatLng, type PolygonGeometry } from "../geo/geometry";
import { getLayer, type GibsLayer } from "../gibs/catalog";
import { sampleArea, type AreaStats } from "../gibs/sample";
import { addMonthsToMonth, dateForMonth, fetchTimeDomain, monthRange, monthsInDomain } from "../gibs/time";
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
  AnalysisTarget,
  ClimatePoint,
  ClimateSeries,
  DatasetId,
  DatasetInfo,
  SatellitePoint,
  SatelliteSeries,
} from "./types";

export const DATASETS: DatasetInfo[] = [
  {
    id: "climate",
    label: "Climate at this place",
    description: "Air temperature, rainfall, soil moisture, humidity, wind and sunshine, compared with the 2001–2020 normal. Six measures, ready in seconds.",
    source: "NASA POWER (MERRA-2 & CERES)",
    unit: "",
    decimals: 1,
    group: "climate",
  },
  {
    id: "vegetation",
    label: "Vegetation (NDVI)",
    description: "Plant greenness measured by MODIS every month.",
    source: "MODIS Terra monthly NDVI (MOD13A3) · NASA GIBS",
    layerId: "MODIS_Terra_L3_NDVI_Monthly",
    unit: "NDVI",
    decimals: 2,
    group: "land",
  },
  {
    id: "evi",
    label: "Leaf density (EVI)",
    description: "How leafy plants are; keeps responding over thick forest.",
    source: "MODIS Terra monthly EVI (MOD13A3) · NASA GIBS",
    layerId: "MODIS_Terra_L3_EVI_Monthly",
    unit: "EVI",
    decimals: 2,
    group: "land",
  },
  {
    id: "surfaceHeat",
    label: "Surface heat (day)",
    description: "Daytime temperature of the ground itself.",
    source: "MODIS Terra monthly land surface temperature (MOD11C3) · NASA GIBS",
    layerId: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    unit: "°C",
    decimals: 1,
    group: "land",
  },
  {
    id: "nightHeat",
    label: "Surface heat (night)",
    description: "How warm the ground stays at night.",
    source: "MODIS Terra monthly night-time land surface temperature (MOD11C3) · NASA GIBS",
    layerId: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night",
    unit: "°C",
    decimals: 1,
    group: "land",
  },
  {
    id: "evaporation",
    label: "Evaporation",
    description: "Water rising from the land into the air each month.",
    source: "MERRA-2 monthly evaporation from land · NASA GIBS",
    layerId: "MERRA2_Evaporation_Land_Monthly",
    unit: "mm/month",
    decimals: 1,
    group: "land",
  },
  {
    id: "topsoil",
    label: "Topsoil moisture",
    description: "Water in the top 10 cm of soil.",
    source: "GLDAS Noah monthly soil moisture, top 10 cm · NASA GIBS",
    layerId: "GLDAS_Underground_Soil_Moisture_Monthly",
    unit: "%",
    decimals: 1,
    group: "water",
  },
  {
    id: "waterStorage",
    label: "Water storage",
    description: "All the water held on and under the land, from gravity (Apr 2002 – Jul 2022).",
    source: "GRACE and GRACE-FO monthly water storage · NASA GIBS",
    layerId: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
    unit: "cm",
    decimals: 1,
    group: "water",
  },
  {
    id: "snow",
    label: "Snow cover",
    description: "Average share of the area covered by snow.",
    source: "MODIS Terra monthly snow cover · NASA GIBS",
    layerId: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
    unit: "%",
    decimals: 0,
    group: "water",
  },
  {
    id: "snowWater",
    label: "Snow water",
    description: "Water held in the snowpack (Jul 2012 – Sep 2025).",
    source: "AMSR2 monthly snow water equivalent · NASA GIBS",
    layerId: "AMSRU2_Snow_Water_Equivalent_Monthly",
    unit: "mm",
    decimals: 1,
    group: "water",
  },
  {
    id: "snowfall",
    label: "Snowfall",
    description: "How much snow falls each month.",
    source: "MERRA-2 monthly snowfall · NASA GIBS",
    layerId: "MERRA2_Snowfall_Monthly",
    unit: "mm/month",
    decimals: 1,
    group: "water",
  },
  {
    id: "waterVapour",
    label: "Water vapour",
    description: "All the water vapour in the air above the area.",
    source: "MERRA-2 monthly total water vapour · NASA GIBS",
    layerId: "MERRA2_Total_Precipitable_Water_Vapor_Monthly",
    unit: "mm",
    decimals: 1,
    group: "air",
  },
  {
    id: "upperAir",
    label: "Upper air (10 km)",
    description: "Air temperature about 10 km up, near where airliners fly.",
    source: "MERRA-2 monthly air temperature at 250 hPa · NASA GIBS",
    layerId: "MERRA2_Air_Temperature_250hPa_Monthly",
    unit: "°C",
    decimals: 1,
    group: "air",
  },
  {
    id: "ozone",
    label: "Ozone layer",
    description: "Ozone about 20 km up, in the layer that blocks the Sun's ultraviolet light.",
    source: "MERRA-2 monthly ozone at 50 hPa · NASA GIBS",
    layerId: "MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly",
    unit: "ppm",
    decimals: 2,
    group: "air",
  },
  {
    id: "heatLeaving",
    label: "Heat leaving for space",
    description: "Heat Earth radiates out to space (from Sep 2002).",
    source: "AIRS (Aqua) monthly outgoing longwave radiation · NASA GIBS",
    layerId: "AIRS_L3_All_Sky_Outgoing_Longwave_Radiation_Monthly_Day",
    unit: "W/m²",
    decimals: 1,
    group: "air",
  },
  {
    id: "air",
    label: "Haze (AOD)",
    description: "How hazy the air is (aerosol optical depth).",
    source: "MERRA-2 monthly aerosol optical thickness · NASA GIBS",
    layerId: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    unit: "AOD",
    decimals: 2,
    group: "gases",
  },
  {
    id: "dust",
    label: "Dust",
    description: "Desert dust in the air near the ground.",
    source: "MERRA-2 monthly dust near the ground · NASA GIBS",
    layerId: "MERRA2_Dust_Surface_Mass_Concentration_Monthly",
    unit: "µg/m³",
    decimals: 1,
    group: "gases",
  },
  {
    id: "fineDust",
    label: "Fine dust (PM2.5)",
    description: "The finest dust, small enough to reach the lungs.",
    source: "MERRA-2 monthly fine dust (PM2.5) · NASA GIBS",
    layerId: "MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly",
    unit: "µg/m³",
    decimals: 1,
    group: "gases",
  },
  {
    id: "so2",
    label: "Sulphur dioxide",
    description: "Sulphur dioxide in the air, from coal, oil, smelters and volcanoes.",
    source: "MERRA-2 monthly SO₂ column · NASA GIBS",
    layerId: "MERRA2_SO2_Column_Mass_Density_Monthly",
    unit: "mg/m²",
    decimals: 2,
    group: "gases",
  },
  {
    id: "co",
    label: "Carbon monoxide",
    description: "Carbon monoxide about 5 km up, from fires, traffic and industry (from Sep 2002).",
    source: "AIRS (Aqua) monthly carbon monoxide at 500 hPa · NASA GIBS",
    layerId: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Monthly_Day",
    unit: "ppb",
    decimals: 0,
    group: "gases",
  },
  {
    id: "coGround",
    label: "CO near the ground",
    description: "Carbon monoxide near the ground (to Nov 2024).",
    source: "MOPITT (Terra) monthly carbon monoxide near the ground · NASA GIBS",
    layerId: "MOPITT_CO_Monthly_Surface_Mixing_Ratio_Day",
    unit: "ppb",
    decimals: 0,
    group: "gases",
  },
  {
    id: "methane",
    label: "Methane",
    description: "Methane about 7 km up (from Sep 2002).",
    source: "AIRS (Aqua) monthly methane at 400 hPa · NASA GIBS",
    layerId: "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day",
    unit: "ppb",
    decimals: 0,
    group: "gases",
  },
  {
    id: "sst",
    label: "Sea temperature",
    description: "Night-time temperature of the sea surface (areas with sea only).",
    source: "MODIS Terra monthly night sea surface temperature · NASA GIBS",
    layerId: "MODIS_Terra_L3_SST_Thermal_4km_Night_Monthly",
    unit: "°C",
    decimals: 1,
    group: "ocean",
  },
  {
    id: "salinity",
    label: "Sea salinity",
    description: "How salty the top of the sea is (areas with sea only, from Apr 2015).",
    source: "SMAP monthly sea surface salinity · NASA GIBS",
    layerId: "SMAP_L3_Sea_Surface_Salinity_CAP_Monthly",
    unit: "PSU",
    decimals: 2,
    group: "ocean",
  },
];

/**
 * Read when no datasets are chosen: climate gives six measures in seconds, and the two satellite
 * measures of the land keep twenty years within the size that starts by itself.
 */
export const DEFAULT_DATASETS: DatasetId[] = ["climate", "vegetation", "surfaceHeat"];

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
        gibsLimiter(async () => {
          const date = await dateForMonth(layer, month);
          return withRetry(() => sampleArea({ layer, geometry, date, signal: inner }), { signal: inner, retries: 2 });
        }, inner),
      ),
    signal,
  );
}

function toSatellitePoint(dataset: DatasetId, month: string, stats: AreaStats | null): SatellitePoint {
  if (!stats || stats.total === 0) return { month, value: null, p10: null, p90: null, coverage: 0 };
  if (dataset === "snow" || dataset === "snowWater") {
    // Snow-free pixels are transparent in the snow products, so average over the
    // whole area treating them as no snow.
    const total = stats.count ? stats.mean * stats.count : 0;
    return { month, value: total / stats.total, p10: null, p90: null, coverage: 1 };
  }
  if (stats.count === 0) return { month, value: null, p10: null, p90: null, coverage: 0 };
  return { month, value: stats.mean, p10: stats.p10, p90: stats.p90, coverage: stats.coverage, capped: stats.capped };
}

async function runSatellite(
  dataset: Exclude<DatasetId, "climate">,
  request: AnalysisRequest,
  key: string,
  months: string[],
  signal: AbortSignal | undefined,
  tick: () => void,
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
  months.filter((m) => !available.has(m)).forEach(() => tick());

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
        tick();
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

/** Most climate points read for an area made of several places (one each, up to this many). */
const MAX_PART_POINTS = 8;

export function climatePointCount(target: Pick<AnalysisTarget, "areaKm2" | "parts">): number {
  const own = samplePointCount(target.areaKm2);
  return target.parts && target.parts.length > 1 ? Math.min(MAX_PART_POINTS, Math.max(own, target.parts.length)) : own;
}

/**
 * Where climate is read: points spread over the area. For several places added together, each gets
 * at least one point (the largest first), and the rest go where there is most area per point.
 */
export function climatePoints(target: Pick<AnalysisTarget, "geometry" | "areaKm2" | "parts">): LatLng[] {
  const count = climatePointCount({ ...target, areaKm2: target.areaKm2 || geometryArea(target.geometry) });
  const parts = target.parts;
  if (!parts || parts.length < 2) return representativePoints(target.geometry, count);
  const largest = [...parts].sort((a, b) => b.areaKm2 - a.areaKm2).slice(0, count);
  const given = largest.map(() => 1);
  for (let left = count - largest.length; left > 0; left--) {
    let best = 0;
    largest.forEach((part, i) => {
      if (part.areaKm2 / given[i] > largest[best].areaKm2 / given[best]) best = i;
    });
    given[best] += 1;
  }
  return largest.flatMap((part, i) => representativePoints(part.geometry, given[i]));
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

async function runClimate(request: AnalysisRequest, months: string[], signal: AbortSignal | undefined, tick: () => void): Promise<ClimateSeries> {
  const samplePoints = climatePoints(request.target);
  const startYear = Number(request.start.slice(0, 4));
  const endYear = Number(request.end.slice(0, 4));
  try {
    const [monthlyList, normalsList] = await Promise.all([
      Promise.all(samplePoints.map((p) => cachedPower(p, startYear, endYear, signal).finally(tick))),
      Promise.all(samplePoints.map((p) => cachedClimatology(p, signal).finally(tick))),
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
  return request.datasets.includes("climate") ? climatePointCount(request.target) * 2 : 0;
}

export function countTasks(request: AnalysisRequest): number {
  return countMaps(request) + countClimateRequests(request);
}

/**
 * Reads the chosen datasets. Climate comes back within seconds; satellite datasets are read one after
 * another (the limit on map requests is shared, so this takes no longer than reading them together).
 * Each finished dataset is handed to `onPartial`, so results appear as they arrive.
 */
export async function runAnalysis(
  request: AnalysisRequest,
  options: { signal?: AbortSignal; onProgress?: (progress: AnalysisProgress) => void; onPartial?: (result: AnalysisResult) => void } = {},
): Promise<AnalysisResult> {
  const { signal, onProgress, onPartial } = options;
  const months = requestMonths(request);
  const key = geometryKey(request.target.geometry);
  const total = Math.max(1, countTasks(request));
  const satelliteIds = request.datasets.filter((d): d is Exclude<DatasetId, "climate"> => d !== "climate");
  const datasets: NonNullable<AnalysisProgress["datasets"]> = {};
  for (const id of satelliteIds) datasets[id] = { done: 0, total: months.length };
  if (request.datasets.includes("climate")) datasets.climate = { done: 0, total: countClimateRequests(request) };

  let done = 0;
  const report = (label: string) => onProgress?.({ done, total, label, datasets: { ...datasets } });
  const tickFor = (id: DatasetId) => () => {
    done = Math.min(total, done + 1);
    const own = datasets[id];
    if (own) datasets[id] = { done: own.done + 1, total: own.total };
    report(DATASET_BY_ID[id].label);
  };
  report("Starting");

  const satellite: AnalysisResult["satellite"] = {};
  let climate: ClimateSeries | undefined;
  const assemble = (): AnalysisResult => ({
    target: request.target,
    start: request.start,
    end: request.end,
    datasets: request.datasets,
    months,
    period: request.period,
    generatedAt: new Date().toISOString(),
    satellite: { ...satellite },
    climate,
  });
  const publish = () => {
    if (!signal?.aborted) onPartial?.(assemble());
  };

  const climateDone = request.datasets.includes("climate")
    ? runClimate(request, months, signal, tickFor("climate")).then((series) => {
        climate = series;
        publish();
      })
    : Promise.resolve();
  // Handled below; this stops a cancelled run from reporting a second, unwatched failure.
  climateDone.catch(() => undefined);

  for (const id of satelliteIds) {
    satellite[id] = await runSatellite(id, request, key, months, signal, tickFor(id));
    publish();
  }
  await climateDone;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return assemble();
}
