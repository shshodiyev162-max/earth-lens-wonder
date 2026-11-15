import { useId, useMemo } from "react";
import { grouped, senSlope } from "@/lib/analysis/stats";
import type { YearValue } from "@/lib/trends/scan";

interface YearTrendChartProps {
  series: YearValue[];
  /** Year windows to shade (e.g. the two periods compared). */
  baseline?: [number, number];
  recent?: [number, number];
  /** The colour of the trend and its range. The yearly values take the text colour around the chart. */
  color?: string;
  unit: string;
  decimals: number;
  /** Compact sparkline (no labels). */
  compact?: boolean;
  /** Shade the 95% range of the trend (lower and upper Sen slopes through the middle year). */
  showRange?: boolean;
  /** Map panels use the panel colours; full pages use the page colours. */
  variant?: "panel" | "page";
  label: string;
  /** A rise and a fall that cancel out: drawn as two lines meeting at this year, instead of one flat one. */
  turnYear?: number | null;
}

const WIDTH = { full: 300, compact: 120 };
const HEIGHT = { full: 84, compact: 32 };

/** One measured value a year, the Sen's slope trend through them, its 95% range and the chosen windows shaded. */
export default function YearTrendChart({ series, baseline, recent, color = "currentColor", unit, decimals, compact = false, showRange = false, variant = "panel", label, turnYear = null }: YearTrendChartProps) {
  const clipId = `range-${useId().replace(/:/g, "")}`;
  const valid = useMemo(() => series.filter((p): p is { year: number; value: number } => p.value !== null), [series]);
  const geometry = useMemo(() => {
    if (valid.length < 2) return null;
    const width = compact ? WIDTH.compact : WIDTH.full;
    const height = compact ? HEIGHT.compact : HEIGHT.full;
    const pad = compact ? { l: 2, r: 2, t: 3, b: 3 } : { l: 3, r: 3, t: 6, b: 4 };
    // Only years with a value: a year cut short by the period has none, and shouldn't widen the axis.
    const years = valid.map((p) => p.year);
    const x0 = Math.min(...years);
    const x1 = Math.max(...years);
    const values = valid.map((p) => p.value);
    const sen = valid.length >= 3 ? senSlope(years, values) : null;
    const at = (x: number) => (sen ? sen.intercept + sen.slope * x : 0);
    // Two stretches: a Sen's line through each, from the first year to the turn and from the turn to the last.
    const stretch = (from: number, to: number) => {
      const part = valid.filter((p) => p.year >= from && p.year <= to);
      const fit = part.length >= 3 ? senSlope(part.map((p) => p.year), part.map((p) => p.value)) : null;
      return fit ? { from, to, y0: fit.intercept + fit.slope * from, y1: fit.intercept + fit.slope * to } : null;
    };
    const turned = turnYear !== null && turnYear > x0 && turnYear < x1 ? [stretch(x0, turnYear), stretch(turnYear, x1)].filter((s): s is NonNullable<typeof s> => s !== null) : [];
    const lines = turned.length === 2 ? turned : sen ? [{ from: x0, to: x1, y0: at(x0), y1: at(x1) }] : [];
    const lineValues = lines.flatMap((l) => [l.y0, l.y1]);
    // The 95% range pivots on the middle year of the measured record.
    const xm = (x0 + x1) / 2;
    const cone =
      sen && showRange && !compact && turned.length !== 2
        ? [
            [x0, at(xm) + sen.lower * (x0 - xm)],
            [x1, at(xm) + sen.lower * (x1 - xm)],
            [x1, at(xm) + sen.upper * (x1 - xm)],
            [x0, at(xm) + sen.upper * (x0 - xm)],
          ]
        : null;
    const extra = cone ? cone.map(([, y]) => y) : [];
    let y0 = Math.min(...values, ...lineValues, ...extra);
    let y1 = Math.max(...values, ...lineValues, ...extra);
    // Quantities that are never negative (rainfall, snow, NDVI here) keep the axis at zero or above;
    // the range shading is clipped to the chart.
    if (Math.min(...values) >= 0) y0 = Math.max(y0, 0);
    if (y1 - y0 < 1e-9) {
      y0 -= 1;
      y1 += 1;
    }
    const sx = (x: number) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * (width - pad.l - pad.r);
    const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (height - pad.t - pad.b);
    const path = valid.map((p, i) => `${i ? "L" : "M"}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ");
    const conePath = cone ? `${cone.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ")} Z` : null;
    return { width, height, pad, sx, sy, path, lines, x0, x1, conePath };
  }, [valid, compact, showRange, turnYear]);

  const muted = variant === "panel" ? "text-panel-muted" : "text-muted-foreground";
  if (!geometry) return <p className={`text-xs ${muted}`}>Not enough years with data for a chart.</p>;
  const { width, height, pad, sx, sy, path, lines, x0, x1, conePath } = geometry;

  if (compact) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-[7.5rem]" role="img" aria-label={label}>
        {lines.map((l) => (
          <line key={l.from} x1={sx(l.from)} y1={sy(l.y0)} x2={sx(l.to)} y2={sy(l.y1)} style={{ stroke: color }} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  // Shade each window half a year either side of its years, kept inside the chart.
  const band = (range: [number, number]) => {
    const x = sx(Math.max(x0, range[0] - 0.5));
    return { x, w: sx(Math.min(x1, range[1] + 0.5)) - x };
  };
  const windows = [baseline ? { ...band(baseline), name: "then" } : null, recent ? { ...band(recent), name: "now" } : null].filter((w): w is { x: number; w: number; name: string } => w !== null && w.w > 0);
  const first = valid[0];
  const last = valid[valid.length - 1];
  const print = (value: number) => `${grouped(value, decimals)}${unit ? ` ${unit}` : ""}`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
        {windows.map((w) => (
          <g key={w.name}>
            <rect x={w.x} y={0} width={w.w} height={height} fill="currentColor" opacity={0.055} />
            <text x={w.x + w.w / 2} y={7} textAnchor="middle" fill="currentColor" opacity={0.6} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 6.5 }}>
              {w.name}
            </text>
          </g>
        ))}
        {conePath && <path d={conePath} style={{ fill: color }} opacity={0.15} clipPath={`url(#${clipId})`} />}
        {lines.map((l) => (
          <line key={l.from} x1={sx(l.from)} y1={sy(l.y0)} x2={sx(l.to)} y2={sy(l.y1)} style={{ stroke: color }} strokeWidth={1.25} strokeDasharray="5 4" opacity={0.95} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} vectorEffect="non-scaling-stroke" />
        {valid.map((p) => (
          <circle key={p.year} cx={sx(p.year)} cy={sy(p.value)} r={1.5} fill="currentColor" />
        ))}
        <rect x={pad.l} y={height - 0.5} width={width - pad.l - pad.r} height={0.5} fill="currentColor" opacity={0.15} />
      </svg>
      <figcaption className={`mt-1.5 flex justify-between gap-3 font-mono text-[10.5px] tabular-nums ${muted}`}>
        <span>
          {first.year} · {print(first.value)}
        </span>
        <span>
          {last.year} · {print(last.value)}
        </span>
      </figcaption>
    </figure>
  );
}
