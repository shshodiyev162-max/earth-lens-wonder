// Monthly NASA GIBS maps as grids of real values: each WMS image is decoded pixel by pixel
// through the product's published colour map. Grids are small (≤ 200 px a side), shared between
// callers, cached in the browser and fetched a few at a time.

import { createLimiter, createSharedCache, withRetry } from "../async";
import { cachedValue, TTL } from "../cache/store";
import { clampBBox, type BBox } from "../geo/geometry";
import { LAND_WATER_LAYER_ID, type GibsLayer } from "../gibs/catalog";
import { applyTransform, decodePixel, fetchColorMap } from "../gibs/colormap";
import { fetchRgba, wmsGetMapUrl } from "../gibs/sample";
import { addMonthsToMonth } from "../gibs/time";
import { defaultEndMonth } from "../analysis/period";
import type { GridSpec } from "./hotspots";

/** At most this many map requests in flight, across all scans. */
const limit = createLimiter(6);
const shared = createSharedCache<Float32Array>();
const sharedMasks = createSharedCache<Uint8Array>();

/**
 * A lat/lon grid over the box: square-ish pixels, no finer than the product itself
 * (`nativeDeg`) and no more than `maxSize` pixels on the long side.
 */
export function scanGrid(bbox: BBox, maxSize: number, nativeDeg: number): GridSpec {
  const [w, s, e, n] = clampBBox(bbox);
  const spanX = Math.max(e - w, 1e-6);
  const spanY = Math.max(n - s, 1e-6);
  const step = Math.max(nativeDeg, Math.max(spanX, spanY) / maxSize);
  return { bbox: [w, s, e, n], width: Math.max(4, Math.round(spanX / step)), height: Math.max(4, Math.round(spanY / step)) };
}

function gridKey(grid: GridSpec): string {
  return `${grid.bbox.map((v) => v.toFixed(3)).join(",")}|${grid.width}x${grid.height}`;
}

/** Decoded values of one monthly map (NaN where there is no measurement). */
export function decodeGrid(rgba: Uint8ClampedArray, colormap: Awaited<ReturnType<typeof fetchColorMap>>, layer: GibsLayer, size: number): Float32Array {
  const values = new Float32Array(size);
  // Snow-free land is transparent in the snow product: that's 0 % snow, not missing data.
  const transparentIsZero = layer.id.includes("Snow_Cover");
  for (let i = 0; i < size; i++) {
    const o = i * 4;
    const value = decodePixel(colormap, rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    if (value === null) values[i] = transparentIsZero && rgba[o + 3] < 128 ? 0 : NaN;
    else values[i] = applyTransform(value, layer.transform);
  }
  return values;
}

/** One month of a layer over the grid, from cache or NASA GIBS. */
export function fetchMonthGrid(layer: GibsLayer, grid: GridSpec, month: string, signal?: AbortSignal): Promise<Float32Array> {
  if (!layer.colormap) return Promise.reject(new Error(`${layer.name} has no measurable values`));
  const key = `grid:${layer.id}|${gridKey(grid)}|${month}`;
  const ttl = month >= addMonthsToMonth(defaultEndMonth(), -1) ? TTL.recentGrid : TTL.grid;
  return shared(
    key,
    (inner) =>
      cachedValue(key, ttl, () =>
        limit(
          () =>
            withRetry(
              async () => {
                const [colormap, rgba] = await Promise.all([fetchColorMap(layer.colormap as string), fetchRgba(wmsGetMapUrl(layer, grid, `${month}-01`), grid, inner)]);
                return decodeGrid(rgba, colormap, layer, grid.width * grid.height);
              },
              { signal: inner, retries: 2 },
            ),
          inner,
        ),
      ),
    signal,
  );
}

const LAND_WATER: GibsLayer = {
  id: LAND_WATER_LAYER_ID,
  name: "Land and water",
  source: "OpenStreetMap",
  description: "",
  category: "imagery",
  format: "png",
  matrixSet: "GoogleMapsCompatible_Level9",
  maxNativeZoom: 9,
  period: "static",
};

/** 1 = land, 0 = lakes and sea (GIBS OSM land/water map: water is light grey, land dark grey). */
export function fetchLandMask(grid: GridSpec, signal?: AbortSignal): Promise<Uint8Array> {
  const key = `land:${gridKey(grid)}`;
  return sharedMasks(
    key,
    (inner) =>
      cachedValue(key, TTL.grid, () =>
        limit(
          () =>
            withRetry(
              async () => {
                const rgba = await fetchRgba(wmsGetMapUrl(LAND_WATER, grid, null), grid, inner);
                const mask = new Uint8Array(grid.width * grid.height);
                // Only clearly-water pixels are dropped; anything unclear stays in the scan.
                for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] >= 128 && rgba[i * 4] >= 100 ? 0 : 1;
                return mask;
              },
              { signal: inner, retries: 2 },
            ),
          inner,
        ),
      ),
    signal,
  );
}
