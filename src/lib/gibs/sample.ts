// Reads real values out of GIBS imagery for an area or a point.
// We request the area as a small WMS image (EPSG:4326, so pixels are a regular
// lat/lon grid), rasterize the area's polygon onto the same grid, decode every
// pixel inside it through the layer's colormap and summarise the values.

import { bboxOf, clampBBox, type BBox, type LatLng, type PolygonGeometry } from "../geo/geometry";
import { coverCells } from "../geo/combine";
import { GIBS_WMS_4326, isTimeEnabled, nativeResolutionDeg, type GibsLayer } from "./catalog";
import { applyTransform, decodePixel, fetchColorMap, scaleLimits, type ParsedColorMap } from "./colormap";
import { fetchWithTimeout } from "../async";

export interface RasterGrid {
  bbox: BBox;
  width: number;
  height: number;
}

export interface AreaStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  p10: number;
  p90: number;
  std: number;
  /** Pixels with a valid value inside the area. */
  count: number;
  /** Pixels inside the area. */
  total: number;
  /** count / total (0–1): the share of the area the satellite actually measured. */
  coverage: number;
  /** Share of the readings at the end of NASA's colour scale, where it stops counting (0–1). */
  capped?: number;
}

export class GibsRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** A grid close to the layer's native resolution, capped for speed. */
export function gridFor(bbox: BBox, layer: GibsLayer, maxSize = 320, minSize = 12): RasterGrid {
  const [w, s, e, n] = clampBBox(bbox);
  const resolution = nativeResolutionDeg(layer);
  const spanX = Math.max(e - w, 1e-6);
  const spanY = Math.max(n - s, 1e-6);
  let width = Math.round(spanX / resolution);
  let height = Math.round(spanY / resolution);
  const scale = Math.min(1, maxSize / Math.max(width, height, 1));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  if (width < minSize || height < minSize) {
    const up = minSize / Math.max(1, Math.min(width, height));
    width = Math.max(minSize, Math.round(width * up));
    height = Math.max(minSize, Math.round(height * up));
    const down = Math.min(1, maxSize / Math.max(width, height));
    width = Math.max(1, Math.round(width * down));
    height = Math.max(1, Math.round(height * down));
  }
  return { bbox: [w, s, e, n], width, height };
}

export function wmsGetMapUrl(layer: GibsLayer, grid: RasterGrid, date: string | null): string {
  const [w, s, e, n] = grid.bbox;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.id,
    STYLES: "",
    CRS: "EPSG:4326",
    // WMS 1.3.0 + EPSG:4326 uses latitude-first axis order.
    BBOX: [s, w, n, e].map((v) => v.toFixed(6)).join(","),
    WIDTH: String(grid.width),
    HEIGHT: String(grid.height),
    FORMAT: layer.format === "jpg" ? "image/jpeg" : "image/png",
    ...(layer.format === "jpg" ? {} : { TRANSPARENT: "TRUE" }),
  });
  if (date && isTimeEnabled(layer)) params.set("TIME", date);
  return `${GIBS_WMS_4326}?${params}`;
}

/**
 * Scanline rasterisation: a pixel is inside when its centre is inside the area. Holes work within
 * each polygon, and where the parts of a combined area overlap, the pixel simply counts once.
 */
export function rasterizeMask(geometry: PolygonGeometry, grid: RasterGrid): Uint8Array {
  const { width, height } = grid;
  const [w, s, e, n] = grid.bbox;
  const dx = (e - w) / width;
  const dy = (n - s) / height;
  const mask = coverCells(geometry, grid);

  if (mask.indexOf(1) === -1) {
    // Area smaller than one pixel: use the pixel under its bbox centre.
    const [bw, bs, be, bn] = bboxOf(geometry);
    const col = Math.min(width - 1, Math.max(0, Math.floor(((bw + be) / 2 - w) / dx)));
    const row = Math.min(height - 1, Math.max(0, Math.floor((n - (bs + bn) / 2) / dy)));
    mask[row * width + col] = 1;
  }
  return mask;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function summarize(values: number[], total: number, weights?: number[], totalWeight?: number): AreaStats {
  const count = values.length;
  // Each value's share of the ground (pixels on a lat/lon map shrink towards the poles); equal without weights.
  const w = weights ?? values.map(() => 1);
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const sumW = w.reduce((s, x) => s + x, 0);
  const mean = count && sumW > 0 ? values.reduce((s, v, i) => s + v * w[i], 0) / sumW : NaN;
  const variance = count && sumW > 0 ? values.reduce((s, v, i) => s + w[i] * (v - mean) ** 2, 0) / sumW : NaN;
  const weightedQuantile = (q: number) => {
    if (!count) return NaN;
    if (!weights) return quantile(order.map((i) => values[i]), q);
    let seen = 0;
    for (const i of order) {
      seen += w[i];
      if (seen >= q * sumW) return values[i];
    }
    return values[order[order.length - 1]];
  };
  const whole = totalWeight ?? total;
  return {
    mean,
    median: weightedQuantile(0.5),
    min: count ? values[order[0]] : NaN,
    max: count ? values[order[count - 1]] : NaN,
    p10: weightedQuantile(0.1),
    p90: weightedQuantile(0.9),
    std: Math.sqrt(variance),
    count,
    total,
    coverage: whole ? (weights ? sumW : count) / whole : 0,
  };
}

/** How much ground a pixel in each row covers, relative to one at the equator (cos of its latitude). */
export function rowWeights(grid: RasterGrid): Float64Array {
  const [, south, , north] = grid.bbox;
  const step = (north - south) / grid.height;
  return Float64Array.from({ length: grid.height }, (_, r) => Math.max(0, Math.cos(((north - (r + 0.5) * step) * Math.PI) / 180)));
}

/** Area statistics of decoded values (NaN = not measured), each pixel weighted by the ground it covers. */
export function statsFromValues(values: ArrayLike<number>, mask: Uint8Array, grid: RasterGrid, limits: { bottom: number | null; top: number | null } = { bottom: null, top: null }): AreaStats {
  const weightOfRow = rowWeights(grid);
  const kept: number[] = [];
  const weights: number[] = [];
  let total = 0;
  let totalWeight = 0;
  let capped = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const weight = weightOfRow[Math.floor(i / grid.width)];
    total += 1;
    totalWeight += weight;
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    kept.push(value);
    weights.push(weight);
    if ((limits.bottom !== null && value <= limits.bottom) || (limits.top !== null && value >= limits.top)) capped += 1;
  }
  // Rows at one latitude (a small area): plain statistics.
  const equal = weightOfRow.every((w) => Math.abs(w - weightOfRow[0]) < 1e-9);
  const stats = equal ? summarize(kept, total) : summarize(kept, total, weights, totalWeight);
  return { ...stats, capped: kept.length ? capped / kept.length : 0 };
}

export function statsFromPixels(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  colormap: ParsedColorMap,
  transform?: GibsLayer["transform"],
  grid?: RasterGrid,
): AreaStats {
  const values = new Float32Array(mask.length).fill(NaN);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    const decoded = decodePixel(colormap, rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    if (decoded !== null) values[i] = applyTransform(decoded, transform);
  }
  // Without a grid every pixel counts the same (a small area, or a test).
  const flat: RasterGrid = { bbox: [0, 0, 0, 0], width: mask.length, height: 1 };
  return statsFromValues(values, mask, grid ?? flat, scaleLimits(colormap, transform));
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Fetches a GIBS WMS image and returns its RGBA pixels at exactly grid size. */
export async function fetchRgba(url: string, grid: RasterGrid, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  const response = await fetchWithTimeout(url, { signal, timeoutMs: 30_000 });
  if (!response.ok) throw new GibsRequestError(`NASA GIBS returned ${response.status}`, response.status);
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    const text = await response.text();
    const message = text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/)?.[1]?.trim();
    throw new GibsRequestError(message ? `NASA GIBS: ${message}` : "NASA GIBS returned an unexpected response", 502);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = createCanvas(grid.width, grid.height);
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("Canvas is not available in this browser");
  context.imageSmoothingEnabled = false; // keep palette colours exact
  context.clearRect(0, 0, grid.width, grid.height);
  context.drawImage(bitmap, 0, 0, grid.width, grid.height);
  bitmap.close?.();
  return context.getImageData(0, 0, grid.width, grid.height).data;
}

/** Real statistics of a science layer inside an area on a given date. */
export async function sampleArea(options: {
  layer: GibsLayer;
  geometry: PolygonGeometry;
  date: string | null;
  signal?: AbortSignal;
  maxSize?: number;
}): Promise<AreaStats> {
  const { layer, geometry, date, signal } = options;
  if (!layer.colormap) throw new Error(`${layer.name} is imagery and has no measurable values`);
  const grid = gridFor(bboxOf(geometry), layer, options.maxSize);
  const [colormap, rgba] = await Promise.all([fetchColorMap(layer.colormap), fetchRgba(wmsGetMapUrl(layer, grid, date), grid, signal)]);
  return statsFromPixels(rgba, rasterizeMask(geometry, grid), colormap, layer.transform, grid);
}

/** Value of a science layer under a single point (null = cloud / no data). */
export async function probePoint(options: { layer: GibsLayer; point: LatLng; date: string | null; signal?: AbortSignal }): Promise<number | null> {
  const { layer, point, date, signal } = options;
  if (!layer.colormap) return null;
  const half = nativeResolutionDeg(layer) * 1.5;
  const [lat, lon] = point;
  const grid: RasterGrid = { bbox: clampBBox([lon - half, lat - half, lon + half, lat + half]), width: 3, height: 3 };
  const [colormap, rgba] = await Promise.all([fetchColorMap(layer.colormap), fetchRgba(wmsGetMapUrl(layer, grid, date), grid, signal)]);
  const centre = 4 * 4; // pixel (1,1)
  const value = decodePixel(colormap, rgba[centre], rgba[centre + 1], rgba[centre + 2], rgba[centre + 3]);
  return value === null ? null : applyTransform(value, layer.transform);
}
