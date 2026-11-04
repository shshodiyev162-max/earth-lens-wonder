// The hotspot scan: reads monthly NASA maps of one indicator over an area, compares a recent period
// with a baseline (same months each year, so the seasons can't fake a change), tests each pixel's
// yearly trend (Mann–Kendall + Sen's slope) and groups the pixels that changed into ranked hotspots.

import { annualTrendVerdict, type TrendVerdict } from "../analysis/stats";
import { defaultEndMonth } from "../analysis/period";
import { isAbortError } from "../async";
import { reverseGeocode } from "../geo/geocode";
import { padBBox } from "../geo/geometry";
import { getLayer, type GibsLayer } from "../gibs/catalog";
import { rasterizeMask } from "../gibs/sample";
import { domainWindow, fetchTimeDomain, monthsInDomain } from "../gibs/time";
import { INDICATORS, type Direction, type IndicatorId } from "../query/indicators";
import { seasonYearMonths, type DataWindow, type PeriodPlan } from "../query/period";
import { fetchLandMask, fetchMonthGrid, scanGrid } from "./grid";
import { buildHotspots, clusterPixels, flagPixels, hotspotOptions, pixelAreaKm2, pixelCenter, pixelSize, traceOutline, type GridSpec, type Hotspot, type HotspotFilter } from "./hotspots";
import { computePixelTrends, seasonMeanGrids, type PixelTrends } from "./pixels";
import type { ScanArea } from "./place";

export interface ScanProgress {
  phase: "maps" | "computing" | "refining" | "done";
  done: number;
  total: number;
  message: string;
}

export interface YearValue {
  year: number;
  value: number | null;
}

export interface HotspotDetail extends Hotspot {
  /** Area mean of the season, year by year. */
  series: YearValue[];
  verdict: TrendVerdict | null;
  /** Outline re-drawn from a finer second scan. */
  refined: boolean;
}

export interface ScanResult {
  indicator: IndicatorId;
  /** The filter the hotspots below were built with. */
  filter: HotspotFilter;
  area: ScanArea;
  plan: PeriodPlan;
  layerId: string;
  grid: GridSpec;
  /** 1 = land inside the area. */
  mask: Uint8Array;
  trends: PixelTrends;
  /** Season mean per year (for the yearly animation). */
  yearGrids: Float32Array[];
  /** Every monthly map read, oldest first (the maps stay in the device cache for the monthly animation). */
  monthsRead: string[];
  hotspots: HotspotDetail[];
  region: {
    series: YearValue[];
    verdict: TrendVerdict | null;
    /** Area-weighted mean of recent − baseline over the whole area. */
    meanChange: number;
    /** Share of land pixels with a measurement in both periods. */
    validShare: number;
    scannedKm2: number;
    /** Area of all hotspots together. */
    changedKm2: number;
  };
  /** Months NASA hasn't published (gaps in the record). */
  missingMonths: string[];
  /** Months that couldn't be loaded. */
  failedMonths: string[];
  notes: string[];
  coarse: boolean;
}

export class ScanError extends Error {}

export interface DataAvailability {
  window: DataWindow;
  /** Months the product actually has (null = assume every month in the window). */
  available: Set<string> | null;
}

/** The first and last month of the indicator's product, and the months it really has. */
export async function fetchAvailability(indicator: IndicatorId): Promise<DataAvailability> {
  const layer = getLayer(INDICATORS[indicator].layerId) as GibsLayer;
  try {
    const domain = await fetchTimeDomain(layer);
    if (domain) {
      const window = domainWindow(domain);
      return { window, available: new Set(monthsInDomain(layer, domain, window.earliest, window.latest)) };
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
  }
  return { window: { earliest: "2000-03", latest: defaultEndMonth() }, available: null };
}

export interface ScanLoaders {
  monthGrid: (layer: GibsLayer, grid: GridSpec, month: string, signal?: AbortSignal) => Promise<Float32Array>;
  landMask: (grid: GridSpec, signal?: AbortSignal) => Promise<Uint8Array>;
}

const NETWORK: ScanLoaders = { monthGrid: fetchMonthGrid, landMask: fetchLandMask };

export interface ScanRequest {
  indicator: IndicatorId;
  /** How hotspots are picked at first (the direction is enough; the rest has defaults). */
  filter?: HotspotFilter;
  direction?: Direction;
  area: ScanArea;
  plan: PeriodPlan;
  availability: DataAvailability;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  loaders?: ScanLoaders;
  /** Long side of the grid in pixels (default 200, or 160 for very large areas). */
  maxSize?: number;
}

/** Spans wider than this (degrees) are scanned coarsely first, then the top hotspots are refined. */
const COARSE_SPAN = 12;
const REFINE_BUDGET = 72;

function monthsFor(plan: PeriodPlan, years: number[]): string[] {
  return [...new Set(years.flatMap((year) => seasonYearMonths(year, plan.months)))];
}

/** Area-weighted mean of a grid over some pixels; null when under 30 % of them have data. */
function areaMean(grid: Float32Array, pixels: ArrayLike<number>, spec: GridSpec): number | null {
  let total = 0;
  let weight = 0;
  let count = 0;
  for (let k = 0; k < pixels.length; k++) {
    const index = pixels[k];
    const value = grid[index];
    if (!Number.isFinite(value)) continue;
    const a = pixelAreaKm2(spec, Math.floor(index / spec.width));
    total += value * a;
    weight += a;
    count += 1;
  }
  return count >= Math.max(1, pixels.length * 0.3) && weight > 0 ? total / weight : null;
}

function yearlySeries(yearGrids: Float32Array[], years: number[], pixels: ArrayLike<number>, grid: GridSpec): YearValue[] {
  return years.map((year, k) => ({ year, value: areaMean(yearGrids[k], pixels, grid) }));
}

function verdictOf(series: YearValue[]): TrendVerdict | null {
  const valid = series.filter((p): p is { year: number; value: number } => p.value !== null);
  return annualTrendVerdict(
    valid.map((p) => p.year),
    valid.map((p) => p.value),
  );
}

async function loadMonths(
  months: string[],
  load: (month: string) => Promise<Float32Array>,
  signal: AbortSignal | undefined,
  tick: (month: string) => void,
): Promise<{ grids: Map<string, Float32Array>; failed: string[] }> {
  const grids = new Map<string, Float32Array>();
  const failed: string[] = [];
  await Promise.all(
    months.map(async (month) => {
      try {
        grids.set(month, await load(month));
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error;
        failed.push(month);
      } finally {
        tick(month);
      }
    }),
  );
  return { grids, failed: failed.sort() };
}

export async function runScan(request: ScanRequest): Promise<ScanResult> {
  const { indicator, area, plan, availability, signal, onProgress } = request;
  const filter = filterOf(request);
  const loaders = request.loaders ?? NETWORK;
  const info = INDICATORS[indicator];
  const layer = getLayer(info.layerId) as GibsLayer;
  const notes = [...plan.notes];
  const [w, s, e, n] = area.bbox;
  const coarse = Math.max(e - w, n - s) > COARSE_SPAN && info.nativeDeg < 0.2;
  const grid = scanGrid(area.bbox, request.maxSize ?? (coarse ? 160 : 200), info.nativeDeg);
  const size = grid.width * grid.height;

  const wanted = monthsFor(plan, plan.years);
  const months = availability.available ? wanted.filter((m) => availability.available?.has(m)) : wanted;
  const missingMonths = wanted.filter((m) => !months.includes(m));
  const inWindow = (window: [number, number]) => months.some((m) => plan.years.some((y) => y >= window[0] && y <= window[1] && seasonYearMonths(y, plan.months).includes(m)));
  if (months.length < wanted.length * 0.5 || !inWindow(plan.baseline) || !inWindow(plan.recent)) {
    throw new ScanError(
      `NASA has published only ${months.length} of the ${wanted.length} monthly ${info.label.toLowerCase()} maps this question needs. Try a different period.`,
    );
  }
  if (missingMonths.length) notes.push(`NASA has no ${info.label.toLowerCase()} map for ${missingMonths.length} of the requested months (gaps in the record).`);

  let done = 0;
  const total = months.length + 1;
  const report = (phase: ScanProgress["phase"], message: string) => onProgress?.({ phase, done, total, message });
  report("maps", `Reading NASA maps: 0 of ${months.length}`);

  const [landResult, monthResult] = await Promise.all([
    loaders.landMask(grid, signal).then(
      (mask) => mask,
      (error) => {
        if (isAbortError(error)) throw error;
        notes.push("The land/water map couldn't be loaded, so lakes and sea are not masked out.");
        return new Uint8Array(size).fill(1);
      },
    ),
    loadMonths(
      months,
      (month) => loaders.monthGrid(layer, grid, month, signal),
      signal,
      (month) => {
        done += 1;
        report("maps", `Reading NASA maps: ${done} of ${months.length} (${month})`);
      },
    ),
  ]);
  done = total;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const { grids: monthGrids, failed } = monthResult;
  if (!months.length || failed.length > months.length * 0.4) {
    throw new ScanError(
      months.length
        ? `NASA GIBS didn't answer for ${failed.length} of ${months.length} monthly maps. Please try again in a minute.`
        : "NASA has no maps of this indicator for the chosen years.",
    );
  }
  if (failed.length) notes.push(`${failed.length} monthly map(s) couldn't be loaded and were skipped.`);

  report("computing", "Testing each pixel for a trend");
  const regionMask = rasterizeMask(area.geometry, grid);
  const mask = new Uint8Array(size);
  for (let i = 0; i < size; i++) mask[i] = regionMask[i] && landResult[i] ? 1 : 0;

  const yearGrids = seasonMeanGrids(monthGrids, plan.years, plan.months, size);
  const trends = await computePixelTrends(yearGrids, plan.years, plan.baseline, plan.recent, mask, {
    width: grid.width,
    height: grid.height,
    trend: plan.kind === "trend" && plan.years.length >= 4,
    signal,
  });

  const found = buildHotspots(trends, grid, hotspotOptions(filter, info.minChange, coarse));
  let hotspots: HotspotDetail[] = found.map((h) => {
    const series = yearlySeries(yearGrids, plan.years, h.pixels, grid);
    return { ...h, series, verdict: plan.kind === "trend" ? verdictOf(series) : null, refined: false };
  });

  if (coarse && hotspots.length) {
    hotspots = await refineHotspots(hotspots, { request, layer, grid, loaders, report });
  }

  // Whole-area summary.
  const landPixels: number[] = [];
  let scannedKm2 = 0;
  let validPixels = 0;
  let changeTotal = 0;
  let changeWeight = 0;
  for (let i = 0; i < size; i++) {
    if (!mask[i]) continue;
    landPixels.push(i);
    const a = pixelAreaKm2(grid, Math.floor(i / grid.width));
    scannedKm2 += a;
    if (Number.isFinite(trends.change[i])) {
      validPixels += 1;
      changeTotal += trends.change[i] * a;
      changeWeight += a;
    }
  }
  const regionSeries = yearlySeries(yearGrids, plan.years, landPixels, grid);
  report("done", "Done");
  return {
    indicator,
    filter,
    area,
    plan,
    layerId: layer.id,
    grid,
    mask,
    trends,
    yearGrids,
    monthsRead: [...monthGrids.keys()].sort(),
    hotspots,
    region: {
      series: regionSeries,
      verdict: plan.kind === "trend" ? verdictOf(regionSeries) : null,
      meanChange: changeWeight ? changeTotal / changeWeight : NaN,
      validShare: landPixels.length ? validPixels / landPixels.length : 0,
      scannedKm2,
      changedKm2: hotspots.reduce((sum, h) => sum + h.areaKm2, 0),
    },
    missingMonths,
    failedMonths: failed,
    notes,
    coarse,
  };
}

const DEFAULT_FILTER: Omit<HotspotFilter, "direction"> = { minFactor: 1, minAreaKm2: 0, strict: false };

function filterOf(request: ScanRequest): HotspotFilter {
  return request.filter ?? { direction: request.direction ?? "any", ...DEFAULT_FILTER };
}

function sameFilter(a: HotspotFilter, b: HotspotFilter): boolean {
  return a.direction === b.direction && a.minFactor === b.minFactor && a.minAreaKm2 === b.minAreaKm2 && a.strict === b.strict;
}

/**
 * The hotspots for another filter, re-clustered from the scan's own pixel trends — no new maps.
 * A hotspot that is the same cluster as before keeps its sharper (refined) outline.
 */
export function rebuildHotspots(result: ScanResult, filter: HotspotFilter): HotspotDetail[] {
  if (sameFilter(filter, result.filter)) return result.hotspots;
  const before = new Map(result.hotspots.map((h) => [h.id, h]));
  const info = INDICATORS[result.indicator];
  return buildHotspots(result.trends, result.grid, hotspotOptions(filter, info.minChange, result.coarse)).map((hotspot) => {
    const previous = before.get(hotspot.id);
    if (previous && previous.pixels.length === hotspot.pixels.length) return { ...previous, rank: hotspot.rank };
    const series = yearlySeries(result.yearGrids, result.plan.years, hotspot.pixels, result.grid);
    return { ...hotspot, series, verdict: result.plan.kind === "trend" ? verdictOf(series) : null, refined: false };
  });
}

/**
 * Large areas are scanned coarsely; the top hotspots are then re-read at finer resolution over the
 * baseline and recent years only, and their outlines and areas re-drawn from that.
 */
async function refineHotspots(
  hotspots: HotspotDetail[],
  context: { request: ScanRequest; layer: GibsLayer; grid: GridSpec; loaders: ScanLoaders; report: (phase: ScanProgress["phase"], message: string) => void },
): Promise<HotspotDetail[]> {
  const { request, layer, grid: coarseGrid, loaders, report } = context;
  const { plan, area, availability, signal } = request;
  const info = INDICATORS[request.indicator];
  const minChange = info.minChange * filterOf(request).minFactor;
  const years = plan.years.filter((y) => (y >= plan.baseline[0] && y <= plan.baseline[1]) || (y >= plan.recent[0] && y <= plan.recent[1]));
  const months = monthsFor(plan, years).filter((m) => !availability.available || availability.available.has(m));
  if (!months.length) return hotspots;
  const coarseStep = pixelSize(coarseGrid).dx;
  let budget = REFINE_BUDGET;
  const out = [...hotspots];
  for (let k = 0; k < out.length && budget >= months.length; k++) {
    const hotspot = out[k];
    const grid = scanGrid(padBBox(hotspot.bbox, 0.2, 0.05), 120, info.nativeDeg);
    if (pixelSize(grid).dx > coarseStep * 0.7) continue;
    budget -= months.length;
    report("refining", `Sharpening hotspot ${k + 1}`);
    try {
      const [land, loaded] = await Promise.all([
        loaders.landMask(grid, signal).catch((error) => {
          if (isAbortError(error)) throw error;
          return new Uint8Array(grid.width * grid.height).fill(1);
        }),
        loadMonths(
          months,
          (month) => loaders.monthGrid(layer, grid, month, signal),
          signal,
          () => undefined,
        ),
      ]);
      if (loaded.failed.length > months.length * 0.4) continue;
      const size = grid.width * grid.height;
      const region = rasterizeMask(area.geometry, grid);
      const mask = new Uint8Array(size);
      for (let i = 0; i < size; i++) mask[i] = region[i] && land[i] ? 1 : 0;
      const yearGrids = seasonMeanGrids(loaded.grids, years, plan.months, size);
      const trends = await computePixelTrends(yearGrids, years, plan.baseline, plan.recent, mask, { width: grid.width, height: grid.height, trend: false, signal });
      // Sharpen the edges only: a fine pixel counts if it changed and sits inside the coarse hotspot,
      // which already passed the trend test.
      const coarsePixels = new Set(hotspot.pixels);
      const { dx: cdx, dy: cdy } = pixelSize(coarseGrid);
      const insideCoarse = (index: number) => {
        const [lat, lon] = pixelCenter(grid, index);
        const row = Math.floor((coarseGrid.bbox[3] - lat) / cdy);
        const col = Math.floor((lon - coarseGrid.bbox[0]) / cdx);
        return row >= 0 && col >= 0 && row < coarseGrid.height && col < coarseGrid.width && coarsePixels.has(row * coarseGrid.width + col);
      };
      const flags = flagPixels(trends, hotspot.sign, minChange);
      for (let i = 0; i < flags.length; i++) if (flags[i] && !insideCoarse(i)) flags[i] = 0;
      const pixels = clusterPixels(flags, grid.width, grid.height, 4).flat();
      if (!pixels.length) continue;
      let areaKm2 = 0;
      let weighted = 0;
      let lat = 0;
      let lon = 0;
      for (const index of pixels) {
        const a = pixelAreaKm2(grid, Math.floor(index / grid.width));
        areaKm2 += a;
        weighted += trends.change[index] * a;
        const [pLat, pLon] = pixelCenter(grid, index);
        lat += pLat * a;
        lon += pLon * a;
      }
      const { dx, dy } = pixelSize(grid);
      const geometry = traceOutline(pixels, grid, Math.min(dx, dy) * 0.5);
      out[k] = { ...hotspot, geometry, areaKm2, meanChange: weighted / areaKm2, center: [lat / areaKm2, lon / areaKm2], refined: true };
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }
  return out;
}

/** Names hotspots one by one through the throttled reverse geocoder; calls back as names arrive. */
export async function nameHotspots(hotspots: Hotspot[], onLabel: (id: string, label: string) => void, signal?: AbortSignal): Promise<void> {
  for (const hotspot of hotspots) {
    if (signal?.aborted) return;
    const zoom = hotspot.areaKm2 >= 50_000 ? 5 : hotspot.areaKm2 >= 5_000 ? 8 : 10;
    try {
      const name = await reverseGeocode(hotspot.center, { signal, zoom });
      if (name && !signal?.aborted) onLabel(hotspot.id, name);
    } catch (error) {
      if (isAbortError(error)) return;
    }
  }
}
