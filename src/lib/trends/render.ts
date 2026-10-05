// Turns scan grids into images for the map: a diverging change/trend map and value frames for
// the animation. Grids are regular in latitude; web maps are Mercator, so rows are re-sampled.

import type { Indicator } from "../query/indicators";
import type { GridSpec } from "./hotspots";
import type { PixelTrends } from "./pixels";

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** 0.0123 → 0.0125-ish "nice" numbers: 1, 2, 2.5 or 5 × 10^k, rounded up. */
export function niceNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  // A little tolerance: grids are 32-bit floats, so 0.02 arrives as 0.0200000009.
  const fraction = (value / base) * (1 - 1e-6);
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

export interface ChangeScale {
  /** Values are Sen's slope × 10 (per decade) for trends, or recent − baseline for comparisons. */
  mode: "perDecade" | "change";
  /** Symmetric colour range: ±max. */
  max: number;
  unit: string;
  decline: Rgb;
  increase: Rgb;
}

/** The value drawn for a pixel. */
export function pixelValue(trends: PixelTrends, index: number, mode: ChangeScale["mode"]): number {
  return mode === "perDecade" ? trends.slope[index] * 10 : trends.change[index];
}

/** Colour range from the 95th percentile of the magnitudes, so one extreme pixel can't wash out the map. */
export function changeScale(trends: PixelTrends, indicator: Indicator, hasTrend: boolean): ChangeScale {
  const mode: ChangeScale["mode"] = hasTrend ? "perDecade" : "change";
  const magnitudes: number[] = [];
  for (let i = 0; i < trends.change.length; i++) {
    const v = pixelValue(trends, i, mode);
    if (Number.isFinite(v)) magnitudes.push(Math.abs(v));
  }
  magnitudes.sort((a, b) => a - b);
  const p95 = magnitudes.length ? magnitudes[Math.floor((magnitudes.length - 1) * 0.95)] : 0;
  return {
    mode,
    max: niceNumber(Math.max(p95, indicator.minChange / 2)),
    unit: mode === "perDecade" ? `${indicator.unit} per decade` : indicator.unit,
    decline: hexToRgb(indicator.colors.decline),
    increase: hexToRgb(indicator.colors.increase),
  };
}

const NEUTRAL: Rgb = [226, 232, 240];

/** RGBA image of the change map: colour by direction, strength by size, faded where not significant. */
export function changeImage(trends: PixelTrends, scale: ChangeScale): Uint8ClampedArray {
  const out = new Uint8ClampedArray(trends.change.length * 4);
  for (let i = 0; i < trends.change.length; i++) {
    const v = pixelValue(trends, i, scale.mode);
    if (!Number.isFinite(v)) continue;
    const t = Math.min(1, Math.abs(v) / scale.max);
    const color = v < 0 ? scale.decline : scale.increase;
    const p = trends.p[i];
    const faded = scale.mode === "perDecade" && !(p < 0.05);
    const o = i * 4;
    out[o] = NEUTRAL[0] + (color[0] - NEUTRAL[0]) * t;
    out[o + 1] = NEUTRAL[1] + (color[1] - NEUTRAL[1]) * t;
    out[o + 2] = NEUTRAL[2] + (color[2] - NEUTRAL[2]) * t;
    out[o + 3] = (40 + 175 * t) * (faded ? 0.45 : 1);
  }
  return out;
}

export interface ColorStop {
  value: number;
  color: Rgb;
}

/** Colour for a value, interpolated between the product's own legend stops. */
export function colorizer(stops: ColorStop[]): (value: number) => Rgb {
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  return (value) => {
    if (!sorted.length) return [128, 128, 128];
    if (value <= sorted[0].value) return sorted[0].color;
    const last = sorted[sorted.length - 1];
    if (value >= last.value) return last.color;
    let lo = 0;
    let hi = sorted.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].value <= value) lo = mid;
      else hi = mid;
    }
    const a = sorted[lo];
    const b = sorted[hi];
    const t = (value - a.value) / (b.value - a.value || 1);
    return [a.color[0] + (b.color[0] - a.color[0]) * t, a.color[1] + (b.color[1] - a.color[1]) * t, a.color[2] + (b.color[2] - a.color[2]) * t];
  };
}

/** RGBA image of one frame of values (inside the mask only). */
export function frameImage(values: Float32Array, mask: Uint8Array, color: (value: number) => Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!mask[i] || !Number.isFinite(v)) continue;
    const [r, g, b] = color(v);
    out.set([r, g, b, 220], i * 4);
  }
  return out;
}

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latitudeOf = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);

/**
 * Re-samples an image on a regular lat/lon grid into Mercator rows, so it lines up with the web map
 * at every latitude. Returns the new image (same width).
 */
export function toMercator(rgba: Uint8ClampedArray, grid: GridSpec): { data: Uint8ClampedArray; width: number; height: number } {
  const [, south, , north] = grid.bbox;
  const s = Math.max(-85, south);
  const n = Math.min(85, north);
  const yTop = mercatorY(n);
  const yBottom = mercatorY(s);
  const dy = (north - south) / grid.height;
  // Enough rows that no source row is skipped where Mercator stretches the most.
  const stretch = (yTop - yBottom) / (((n - s) * Math.PI) / 180);
  const height = Math.max(grid.height, Math.min(grid.height * 4, Math.round(grid.height * stretch * Math.max(1, 1 / Math.cos((Math.max(Math.abs(s), Math.abs(n)) * Math.PI) / 180)) * 0.6)));
  const rowBytes = grid.width * 4;
  const data = new Uint8ClampedArray(rowBytes * height);
  for (let j = 0; j < height; j++) {
    const lat = latitudeOf(yTop - ((j + 0.5) / height) * (yTop - yBottom));
    const source = Math.min(grid.height - 1, Math.max(0, Math.floor((north - lat) / dy)));
    data.set(rgba.subarray(source * rowBytes, (source + 1) * rowBytes), j * rowBytes);
  }
  return { data, width: grid.width, height };
}
