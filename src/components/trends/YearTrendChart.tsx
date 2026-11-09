import { useId, useMemo } from "react";
import { senSlope } from "@/lib/analysis/stats";
import type { YearValue } from "@/lib/trends/scan";

interface YearTrendChartProps {
  series: YearValue[];
  /** Year windows to shade (e.g. the two periods compared). */
  baseline?: [number, number];
  recent?: [number, number];
  color: string;
  unit: string;
  decimals: number;
  /** Compact sparkline (no axes or labels). */
  compact?: boolean;
  /** Shade the 95% range of the trend (lower and upper Sen slopes through the middle year). */
  showRange?: boolean;
  /** Map panels use the panel colours; full pages use the page colours. */
  variant?: "panel" | "page";
  label: string;
}

const STYLES = {
  panel: { text: "fill-panel-muted", band: "fill-panel-tint-strong" },
  page: { text: "fill-muted-foreground", band: "fill-muted" },
};

/** Yearly values with the Sen's slope trend line, its 95% range and the chosen windows shaded. */
export default function YearTrendChart({ series, baseline, recent, color, unit, decimals, compact = false, showRange = false, variant = "panel", label }: YearTrendChartProps) {
  const clipId = `range-${useId().replace(/:/g, "")}`;
  const valid = useMemo(() => series.filter((p): p is { year: number; value: number } => p.value !== null), [series]);
  const geometry = useMemo(() => {
    if (valid.length < 2) return null;
    const width = compact ? 120 : 300;
    const height = compact ? 32 : 120;
    const pad = compact ? { l: 2, r: 2, t: 3, b: 3 } : { l: 36, r: 8, t: 10, b: 20 };
    // Only years with a value: a year cut short by the period has none, and shouldn't widen the axis.
    const years = valid.map((p) => p.year);
    const x0 = Math.min(...years);
    const x1 = Math.max(...years);
    const values = valid.map((p) => p.value);
    const sen = valid.length >= 3 ? senSlope(valid.map((p) => p.year), values) : null;
    const at = (x: number) => (sen ? sen.intercept + sen.slope * x : 0);
    const lineValues = sen ? [at(x0), at(x1)] : [];
    // The 95% range pivots on the middle year of the measured record.
    const xm = valid.length ? (valid[0].year + valid[valid.length - 1].year) / 2 : x0;
    const cone =
      sen && showRange && !compact
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
    return { width, height, pad, sx, sy, path, sen, at, x0, x1, y0, y1, conePath };
  }, [valid, compact, showRange]);

  const style = STYLES[variant];
  if (!geometry) return <p className={variant === "panel" ? "text-xs text-panel-muted" : "text-xs text-muted-foreground"}>Not enough years with data for a chart.</p>;
  const { width, height, pad, sx, sy, path, sen, at, x0, x1, y0, y1, conePath } = geometry;
  // Shade each window half a year either side of its years, kept inside the chart.
  const band = (range: [number, number]) => {
    const x = sx(Math.max(x0, range[0] - 0.5));
    return { x, w: sx(Math.min(x1, range[1] + 0.5)) - x };
  };
  const windows = [
    baseline ? { ...band(baseline), name: "baseline" } : null,
    recent ? { ...band(recent), name: "recent" } : null,
  ].filter((w): w is { x: number; w: number; name: string } => w !== null);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={compact ? "h-8 w-[7.5rem]" : "h-32 w-full"} role="img" aria-label={label}>
      {!compact && (
        <>
          {windows.map((w) => (
            <rect key={w.name} x={w.x} y={pad.t} width={Math.max(0, w.w)} height={height - pad.t - pad.b} className={style.band} />
          ))}
          <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" className={`${style.text} text-[9px]`}>
            {y1.toFixed(decimals)}
          </text>
          <text x={pad.l - 4} y={height - pad.b} textAnchor="end" className={`${style.text} text-[9px]`}>
            {y0.toFixed(decimals)}
          </text>
          <text x={sx(x0)} y={height - 5} textAnchor="start" className={`${style.text} text-[9px]`}>
            {x0}
          </text>
          <text x={sx(x1)} y={height - 5} textAnchor="end" className={`${style.text} text-[9px]`}>
            {x1}
          </text>
          {windows.map((w) => (
            <text key={`${w.name}-label`} x={w.x + w.w / 2} y={pad.t + 9} textAnchor="middle" className={`${style.text} text-[8px]`}>
              {w.name}
            </text>
          ))}
        </>
      )}
      {conePath && (
        <>
          <clipPath id={clipId}>
            <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} />
          </clipPath>
          <path d={conePath} fill={color} opacity={0.13} clipPath={`url(#${clipId})`} />
        </>
      )}
      {sen && <line x1={sx(x0)} y1={sy(at(x0))} x2={sx(x1)} y2={sy(at(x1))} stroke={color} strokeWidth={compact ? 1 : 1.5} strokeDasharray="4 3" opacity={0.85} />}
      <path d={path} fill="none" stroke={color} strokeWidth={compact ? 1.5 : 2} strokeLinejoin="round" />
      {!compact && valid.map((p) => <circle key={p.year} cx={sx(p.year)} cy={sy(p.value)} r={2.2} fill={color} />)}
      {!compact && <title>{`${label} (${unit})`}</title>}
    </svg>
  );
}
