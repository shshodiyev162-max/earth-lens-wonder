// The home page's measured findings, and the sums that turn them into words and charts.
// Every number on the page comes from MEASURED, never from text typed by hand.

import { formatP } from "@/lib/analysis/stats";
import { MEASURED } from "./findingsData";
import type { DataId } from "./story";

export interface YearPoint {
  year: number;
  value: number | null;
}

export interface Verdict {
  direction: "decline" | "none" | "increase";
  p: number;
  slopePerYear: number;
  lowerPerYear: number;
  upperPerYear: number;
  slopePerDecade: number | null;
}

export const FINDINGS = MEASURED.findings;

/**
 * Colours for the measured maps on the planet. The interface stays neutral so only data has colour.
 * Uzbekistan's map is the same test on a grid 4× finer (its "picture"), since the page looks at the
 * Aral Sea shore from close up; its numbers in words come from the Trends page's own grid.
 */
export const DATA_MAPS: Record<DataId, { file: string; bbox: readonly number[]; rise: string; fall: string }> = {
  mediterranean: { file: FINDINGS.mediterranean.overlay.file, bbox: FINDINGS.mediterranean.overlay.bbox, rise: "#ff5a36", fall: "#3d7dff" },
  uzbekistan: { file: FINDINGS.uzbekistan.overlay.picture.file, bbox: FINDINGS.uzbekistan.overlay.picture.bbox, rise: "#3ddc84", fall: "#ff9a2e" },
  antarctica: { file: FINDINGS.antarctica.overlay.file, bbox: FINDINGS.antarctica.overlay.bbox, rise: "#39d0ff", fall: "#b06bff" },
};

/** Labels the camera passes, by the stop they belong to in story.ts. */
export const MARKERS = [
  { stop: 2, lat: 35.2, lon: 25.5, text: "Mediterranean Sea" },
  { stop: 3, lat: 41.2, lon: 64.6, text: "Uzbekistan" },
  { stop: 4, lat: FINDINGS.uzbekistan.hotspot.center[0], lon: FINDINGS.uzbekistan.hotspot.center[1], text: "Muynoq district" },
  { stop: 5, lat: -80, lon: 20, text: "Antarctica" },
] as const;

const MINUS = "−";

/** "+0.61", "−0.0044": a real minus sign and always a sign in front. */
export function signedNumber(value: number, decimals: number): string {
  const text = Math.abs(value).toFixed(decimals);
  return `${value < 0 ? MINUS : "+"}${text}`;
}

/** "95% range +0.43 to +0.93" */
export function rangeText(lower: number, upper: number, decimals: number): string {
  return `95% range ${signedNumber(lower, decimals)} to ${signedNumber(upper, decimals)}`;
}

/** "p < 0.001", "p = 0.80", "p = 0.0478": the app's own wording, so page and results always agree. */
export function pText(p: number): string {
  return formatP(p);
}

/** "99.7%", "13%": one decimal only when it matters. */
export function shareText(share: number): string {
  const percent = share * 100;
  return percent >= 99 || percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;
}

/** "2.3 million km²" or "4,633 km²" */
export function areaText(km2: number): string {
  if (km2 >= 1_000_000) return `${(km2 / 1_000_000).toFixed(1)} million km²`;
  return `${Math.round(km2).toLocaleString("en-US")} km²`;
}

/** The mean of the values in a span of years (inclusive). */
export function meanBetween(series: readonly YearPoint[], from: number, to: number): number | null {
  const values = series.filter((point) => point.year >= from && point.year <= to && point.value !== null).map((point) => point.value as number);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export interface ChartShape {
  width: number;
  height: number;
  points: { x: number; y: number; year: number; value: number }[];
  /** The yearly values. */
  line: string;
  /** The trend (Sen's slope). */
  trend: { x1: number; y1: number; x2: number; y2: number };
  /** The trend's 95% range, as a closed shape. */
  range: string;
  firstYear: number;
  lastYear: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The shapes of a small yearly chart: the values, the trend line through them, and the trend's 95%
 * range as a cone that pivots on the middle of the record.
 */
export function chartShape(series: readonly YearPoint[], verdict: Verdict, width: number, height: number, pad = { top: 8, right: 6, bottom: 8, left: 6 }): ChartShape {
  const valid = series.filter((point): point is { year: number; value: number } => point.value !== null);
  const firstYear = valid[0].year;
  const lastYear = valid[valid.length - 1].year;
  const slope = verdict.slopePerYear;
  const intercept = median(valid.map((point) => point.value - slope * point.year));
  const pivotYear = median(valid.map((point) => point.year));
  const pivotValue = slope * pivotYear + intercept;
  const at = (rate: number, year: number) => pivotValue + rate * (year - pivotYear);
  const coneEnds = [at(verdict.lowerPerYear, firstYear), at(verdict.upperPerYear, firstYear), at(verdict.lowerPerYear, lastYear), at(verdict.upperPerYear, lastYear)];
  const all = [...valid.map((point) => point.value), ...coneEnds];
  const low = Math.min(...all);
  const high = Math.max(...all);
  const span = high - low || 1;
  const x = (year: number) => pad.left + ((year - firstYear) / Math.max(1, lastYear - firstYear)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - low) / span) * (height - pad.top - pad.bottom);
  const round = (value: number) => Number(value.toFixed(2));
  const points = valid.map((point) => ({ x: round(x(point.year)), y: round(y(point.value)), year: point.year, value: point.value }));
  return {
    width,
    height,
    points,
    line: points.map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`).join(" "),
    trend: { x1: round(x(firstYear)), y1: round(y(at(slope, firstYear))), x2: round(x(lastYear)), y2: round(y(at(slope, lastYear))) },
    range: `M${round(x(firstYear))} ${round(y(at(verdict.upperPerYear, firstYear)))} L${round(x(pivotYear))} ${round(y(pivotValue))} L${round(x(lastYear))} ${round(y(at(verdict.upperPerYear, lastYear)))} L${round(x(lastYear))} ${round(y(at(verdict.lowerPerYear, lastYear)))} L${round(x(pivotYear))} ${round(y(pivotValue))} L${round(x(firstYear))} ${round(y(at(verdict.lowerPerYear, firstYear)))} Z`,
    firstYear,
    lastYear,
  };
}
