// Reads real values out of GIBS imagery for an area or a point.
// We request the area as a small WMS image (EPSG:4326, so pixels are a regular
// lat/lon grid), rasterize the area's polygon onto the same grid, decode every
// pixel inside it through the layer's colormap and summarise the values.

import { bboxOf, clampBBox, polygonsOf, type BBox, type LatLng, type PolygonGeometry } from "../geo/geometry";
import { GIBS_WMS_4326, isTimeEnabled, nativeResolutionDeg, type GibsLayer } from "./catalog";
import { applyTransform, decodePixel, fetchColorMap, type ParsedColorMap } from "./colormap";

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
    FORMAT: "image/png",
    TRANSPARENT: "TRUE",
  });
  if (date && isTimeEnabled(layer)) params.set("TIME", date);
  return `${GIBS_WMS_4326}?${params}`;
}

/**
 * Scanline rasterisation with the even-odd rule (holes work naturally).
 * A pixel is inside when its centre is inside the polygon.
 */
export function rasterizeMask(geometry: PolygonGeometry, grid: RasterGrid): Uint8Array {
  const { width, height } = grid;
  const [w, s, e, n] = grid.bbox;
  const dx = (e - w) / width;
  const dy = (n - s) / height;
  const mask = new Uint8Array(width * height);
  const rings = polygonsOf(geometry).flat();
  const crossings: number[] = [];
  let filled = 0;

  for (let row = 0; row < height; row++) {
    const lat = n - (row + 0.5) * dy;
    crossings.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 > lat !== y2 > lat) {
          crossings.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const start = Math.max(0, Math.ceil((crossings[k] - w) / dx - 0.5));
      const end = Math.min(width - 1, Math.ceil((crossings[k + 1] - w) / dx - 0.5) - 1);
      for (let col = start; col <= end; col++) {
        mask[row * width + col] = 1;
        filled += 1;
      }
    }
  }

  if (filled === 0) {
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

export function summarize(values: number[], total: number): AreaStats {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = count ? sorted.reduce((sum, v) => sum + v, 0) / count : NaN;
  const variance = count ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count : NaN;
  return {
    mean,
    median: quantile(sorted, 0.5),
    min: count ? sorted[0] : NaN,
    max: count ? sorted[count - 1] : NaN,
    p10: quantile(sorted, 0.1),
    p90: quantile(sorted, 0.9),
    std: Math.sqrt(variance),
    count,
    total,
    coverage: total ? count / total : 0,
  };
}

export function statsFromPixels(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  colormap: ParsedColorMap,
  transform?: GibsLayer["transform"],
): AreaStats {
  const values: number[] = [];
  let total = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    total += 1;
    const o = i * 4;
    const value = decodePixel(colormap, rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    if (value !== null) values.push(applyTransform(value, transform));
  }
  return summarize(values, total);
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
  const response = await fetch(url, { signal });
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
  return statsFromPixels(rgba, rasterizeMask(geometry, grid), colormap, layer.transform);
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
