// Per-pixel change and trend over a stack of yearly season means.
// Each grid is a Float32Array in row-major order (row 0 = north), NaN where there is no data.

import { carryOverFactor, lag1Autocorrelation, normalCdf } from "../analysis/stats";
import { seasonYearMonths } from "../query/period";

export interface PixelTrends {
  width: number;
  height: number;
  baselineMean: Float32Array;
  recentMean: Float32Array;
  /** recent − baseline, in the indicator's unit; NaN outside the scan or without data. */
  change: Float32Array;
  /** Sen's slope per year (NaN when the record is too short or the scan is a two-season comparison). */
  slope: Float32Array;
  /** Mann–Kendall two-sided p-value (NaN when not computed). */
  p: Float32Array;
}

/** Per-pixel mean of several grids; NaN where fewer than `minValid` of them have a value. */
export function meanOfGrids(grids: Float32Array[], size: number, minValid: number): Float32Array {
  const out = new Float32Array(size).fill(NaN);
  for (let i = 0; i < size; i++) {
    let total = 0;
    let count = 0;
    for (const grid of grids) {
      const v = grid[i];
      if (Number.isFinite(v)) {
        total += v;
        count += 1;
      }
    }
    if (count >= minValid && count > 0) out[i] = total / count;
  }
  return out;
}

/** One grid per year: the mean over the season's months (at least half of them must have data). */
export function seasonMeanGrids(monthGrids: Map<string, Float32Array>, years: number[], months: number[], size: number): Float32Array[] {
  const minValid = Math.max(1, Math.ceil(months.length / 2));
  return years.map((year) => {
    const grids = seasonYearMonths(year, months)
      .map((month) => monthGrids.get(month))
      .filter((grid): grid is Float32Array => Boolean(grid));
    return meanOfGrids(grids, size, minValid);
  });
}

/** Mann–Kendall p-value and Sen's slope for one short series; reuses the scratch buffers. */
export function pixelTrend(xs: Float64Array, ys: Float64Array, n: number, slopes: Float64Array, sorted: Float64Array): { slope: number; p: number } {
  let s = 0;
  let count = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = ys[j] - ys[i];
      s += d > 0 ? 1 : d < 0 ? -1 : 0;
      slopes[count++] = d / (xs[j] - xs[i]);
    }
  }
  // Variance of S with the tie correction (decoded palette values tie often).
  for (let i = 0; i < n; i++) sorted[i] = ys[i];
  const view = sorted.subarray(0, n).sort();
  let ties = 0;
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && view[j] === view[i]) j++;
    const t = j - i;
    if (t > 1) ties += t * (t - 1) * (2 * t + 5);
    i = j;
  }
  const list = slopes.subarray(0, count).sort();
  const slope = count % 2 ? list[(count - 1) / 2] : (list[count / 2 - 1] + list[count / 2]) / 2;
  // Years that follow the year before make a run look more like a trend than it is: when that
  // carry-over is clearly there, the test asks for stronger evidence (Yue & Wang 2004), as for the
  // whole area. The intercept is the median of y − slope·x (Conover).
  for (let i = 0; i < n; i++) sorted[i] = ys[i] - slope * xs[i];
  const offsets = sorted.subarray(0, n).sort();
  const intercept = n % 2 ? offsets[(n - 1) / 2] : (offsets[n / 2 - 1] + offsets[n / 2]) / 2;
  const varS = ((n * (n - 1) * (2 * n + 5) - ties) / 18) * carryOverFactor(lag1Autocorrelation(xs, ys, n, slope, intercept), n);
  const z = varS > 0 && s !== 0 ? (s - Math.sign(s)) / Math.sqrt(varS) : 0;
  const p = z === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(z)));
  return { slope, p };
}

function meanOver(yearGrids: Float32Array[], years: number[], [from, to]: [number, number], i: number): number {
  let total = 0;
  let count = 0;
  let wanted = 0;
  for (let k = 0; k < years.length; k++) {
    if (years[k] < from || years[k] > to) continue;
    wanted += 1;
    const v = yearGrids[k][i];
    if (Number.isFinite(v)) {
      total += v;
      count += 1;
    }
  }
  return count > 0 && count >= Math.ceil(wanted / 2) ? total / count : NaN;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Change (recent − baseline) and, when `trend` is set, Sen's slope and Mann–Kendall p per pixel.
 * Yields to the browser every `chunk` pixels so the page stays responsive; stops on `signal`.
 */
export async function computePixelTrends(
  yearGrids: Float32Array[],
  years: number[],
  baseline: [number, number],
  recent: [number, number],
  mask: Uint8Array,
  options: { width: number; height: number; trend: boolean; signal?: AbortSignal; chunk?: number },
): Promise<PixelTrends> {
  const { width, height, trend, signal } = options;
  const size = width * height;
  const chunk = options.chunk ?? 4000;
  const baselineMean = new Float32Array(size).fill(NaN);
  const recentMean = new Float32Array(size).fill(NaN);
  const change = new Float32Array(size).fill(NaN);
  const slope = new Float32Array(size).fill(NaN);
  const p = new Float32Array(size).fill(NaN);
  const n = years.length;
  const minYears = Math.max(4, Math.ceil(n * 0.6));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const slopes = new Float64Array((n * (n - 1)) / 2);
  const sorted = new Float64Array(n);

  for (let i = 0; i < size; i++) {
    if (i % chunk === 0 && i > 0) {
      await pause();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
    if (!mask[i]) continue;
    const b = meanOver(yearGrids, years, baseline, i);
    const r = meanOver(yearGrids, years, recent, i);
    baselineMean[i] = b;
    recentMean[i] = r;
    if (Number.isFinite(b) && Number.isFinite(r)) change[i] = r - b;
    if (!trend) continue;
    let count = 0;
    for (let k = 0; k < n; k++) {
      const v = yearGrids[k][i];
      if (Number.isFinite(v)) {
        xs[count] = years[k];
        ys[count] = v;
        count += 1;
      }
    }
    if (count >= minYears) {
      const result = pixelTrend(xs, ys, count, slopes, sorted);
      slope[i] = result.slope;
      p[i] = result.p;
    }
  }
  return { width, height, baselineMean, recentMean, change, slope, p };
}
