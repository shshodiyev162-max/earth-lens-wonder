import { useMemo } from "react";
import { senSlope } from "@/lib/analysis/stats";
import type { YearValue } from "@/lib/trends/scan";

interface YearTrendChartProps {
  series: YearValue[];
  baseline: [number, number];
  recent: [number, number];
  color: string;
  unit: string;
  decimals: number;
  /** Compact sparkline (no axes or labels). */
  compact?: boolean;
  label: string;
}

/** Yearly values with the Sen's slope trend line and the baseline / recent windows shaded. */
export default function YearTrendChart({ series, baseline, recent, color, unit, decimals, compact = false, label }: YearTrendChartProps) {
  const valid = series.filter((p): p is { year: number; value: number } => p.value !== null);
  const geometry = useMemo(() => {
    if (valid.length < 2) return null;
    const width = compact ? 120 : 300;
    const height = compact ? 32 : 120;
    const pad = compact ? { l: 2, r: 2, t: 3, b: 3 } : { l: 36, r: 8, t: 10, b: 20 };
    const years = series.map((p) => p.year);
    const x0 = Math.min(...years);
    const x1 = Math.max(...years);
    const values = valid.map((p) => p.value);
    const sen = valid.length >= 3 ? senSlope(valid.map((p) => p.year), values) : null;
    const lineValues = sen ? [sen.intercept + sen.slope * x0, sen.intercept + sen.slope * x1] : [];
    let y0 = Math.min(...values, ...lineValues);
    let y1 = Math.max(...values, ...lineValues);
    if (y1 - y0 < 1e-9) {
      y0 -= 1;
      y1 += 1;
    }
    const sx = (x: number) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * (width - pad.l - pad.r);
    const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (height - pad.t - pad.b);
    const path = valid.map((p, i) => `${i ? "L" : "M"}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ");
    return { width, height, pad, sx, sy, path, sen, x0, x1, y0, y1 };
  }, [series, valid, compact]);

  if (!geometry) return <p className="text-xs text-panel-muted">Not enough years with data for a chart.</p>;
  const { width, height, pad, sx, sy, path, sen, x0, x1, y0, y1 } = geometry;
  // Shade each window half a year either side of its years, kept inside the chart.
  const band = (range: [number, number]) => {
    const x = sx(Math.max(x0, range[0] - 0.5));
    return { x, w: sx(Math.min(x1, range[1] + 0.5)) - x };
  };
  const b = band(baseline);
  const r = band(recent);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={compact ? "h-8 w-[7.5rem]" : "h-32 w-full"} role="img" aria-label={label}>
      {!compact && (
        <>
          <rect x={b.x} y={pad.t} width={Math.max(0, b.w)} height={height - pad.t - pad.b} className="fill-panel-tint-strong" />
          <rect x={r.x} y={pad.t} width={Math.max(0, r.w)} height={height - pad.t - pad.b} className="fill-panel-tint-strong" />
          <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" className="fill-panel-muted text-[9px]">
            {y1.toFixed(decimals)}
          </text>
          <text x={pad.l - 4} y={height - pad.b} textAnchor="end" className="fill-panel-muted text-[9px]">
            {y0.toFixed(decimals)}
          </text>
          <text x={sx(x0)} y={height - 5} textAnchor="start" className="fill-panel-muted text-[9px]">
            {x0}
          </text>
          <text x={sx(x1)} y={height - 5} textAnchor="end" className="fill-panel-muted text-[9px]">
            {x1}
          </text>
          <text x={b.x + b.w / 2} y={pad.t + 9} textAnchor="middle" className="fill-panel-muted text-[8px]">
            baseline
          </text>
          <text x={r.x + r.w / 2} y={pad.t + 9} textAnchor="middle" className="fill-panel-muted text-[8px]">
            recent
          </text>
        </>
      )}
      {sen && <line x1={sx(x0)} y1={sy(sen.intercept + sen.slope * x0)} x2={sx(x1)} y2={sy(sen.intercept + sen.slope * x1)} stroke={color} strokeWidth={compact ? 1 : 1.5} strokeDasharray="4 3" opacity={0.85} />}
      <path d={path} fill="none" stroke={color} strokeWidth={compact ? 1.5 : 2} strokeLinejoin="round" />
      {!compact && valid.map((p) => <circle key={p.year} cx={sx(p.year)} cy={sy(p.value)} r={2.2} fill={color} />)}
      {!compact && <title>{`${label} (${unit})`}</title>}
    </svg>
  );
}
