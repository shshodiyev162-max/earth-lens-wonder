import type { ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { formatMonth } from "@/lib/gibs/time";
import type { ClimatePoint, SatelliteSeries } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const AXIS = { fill: "#94a3b8", fontSize: 11 };
const GRID = "rgba(148,163,184,0.12)";

type Row = Record<string, number | string | null | [number, number] | undefined>;

interface SeriesFormat {
  label: string;
  unit?: string;
  decimals?: number;
}

function ChartTooltip({ active, payload, label, formats }: TooltipProps<number, string> & { formats: Record<string, SeriesFormat> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl menu/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {payload.map((item) => {
        const key = String(item.dataKey);
        const format = formats[key];
        if (!format) return null;
        const raw = item.value as unknown;
        let text = "—";
        if (Array.isArray(raw)) {
          const [a, b] = raw as number[];
          if (Number.isFinite(a) && Number.isFinite(b)) text = `${a.toFixed(format.decimals ?? 1)} – ${b.toFixed(format.decimals ?? 1)}`;
        } else if (typeof raw === "number" && Number.isFinite(raw)) {
          text = raw.toFixed(format.decimals ?? 1);
        }
        return (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
              {format.label}
            </span>
            <span className="font-mono text-foreground">
              {text}
              {text !== "—" && format.unit ? ` ${format.unit}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  aside,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/60 bg-card/80 p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="h-56 sm:h-64">{children}</div>
      {footer && <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{footer}</div>}
    </section>
  );
}

function monthTick(month: string, total: number) {
  return total > 24 ? formatMonth(month).replace(/ (\d{2})(\d{2})$/, " ’$2") : formatMonth(month);
}

const commonX = (total: number) => ({
  dataKey: "month",
  tick: AXIS,
  tickLine: false,
  axisLine: { stroke: GRID },
  tickFormatter: (m: string) => monthTick(m, total),
  minTickGap: 18,
});

export function VegetationChart({ series }: { series: SatelliteSeries }) {
  const data: Row[] = series.points.map((p) => ({
    month: p.month,
    mean: p.value,
    range: p.p10 !== null && p.p90 !== null && p.value !== null ? [p.p10, p.p90] : undefined,
    coverage: Math.round(p.coverage * 100),
  }));
  const formats = {
    mean: { label: "Area mean", decimals: 2 },
    range: { label: "10–90% of pixels", decimals: 2 },
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...commonX(data.length)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.min(1, Math.ceil((max + 0.05) * 10) / 10)]} width={44} />
        <Tooltip content={<ChartTooltip formats={formats} />} labelFormatter={(m) => formatMonth(String(m), "long")} />
        <Area dataKey="range" stroke="none" fill="#34d399" fillOpacity={0.15} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="mean" stroke="#34d399" strokeWidth={2.2} dot={{ r: 2.5, fill: "#34d399", strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TemperatureChart({ climate, surface }: { climate: ClimatePoint[]; surface?: SatelliteSeries }) {
  const lst = new Map((surface?.points ?? []).map((p) => [p.month, p.value]));
  const months = climate.length ? climate.map((p) => p.month) : (surface?.points ?? []).map((p) => p.month);
  const byMonth = new Map(climate.map((p) => [p.month, p]));
  const data: Row[] = months.map((month) => ({
    month,
    air: byMonth.get(month)?.temp ?? null,
    normal: byMonth.get(month)?.tempNormal ?? null,
    surface: lst.get(month) ?? null,
  }));
  const formats = {
    air: { label: "Air temperature", unit: "°C" },
    normal: { label: "2001–2020 normal", unit: "°C" },
    surface: { label: "Land surface (day)", unit: "°C" },
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...commonX(data.length)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} unit="°" />
        <Tooltip content={<ChartTooltip formats={formats} />} labelFormatter={(m) => formatMonth(String(m), "long")} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} iconType="plainline" formatter={(value) => formats[value as keyof typeof formats]?.label ?? value} />
        {climate.length > 0 && <Line dataKey="normal" stroke="#64748b" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        {climate.length > 0 && <Line dataKey="air" stroke="#38bdf8" strokeWidth={2.2} dot={{ r: 2.5, fill: "#38bdf8", strokeWidth: 0 }} isAnimationActive={false} />}
        {surface && <Line dataKey="surface" stroke="#fb923c" strokeWidth={2} dot={{ r: 2.5, fill: "#fb923c", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RainChart({ climate }: { climate: ClimatePoint[] }) {
  const data: Row[] = climate.map((p) => ({ month: p.month, rain: p.precip, normal: p.precipNormal }));
  const formats = { rain: { label: "Rainfall", unit: "mm", decimals: 0 }, normal: { label: "2001–2020 normal", unit: "mm", decimals: 0 } };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...commonX(data.length)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip formats={formats} />} labelFormatter={(m) => formatMonth(String(m), "long")} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} formatter={(value) => formats[value as keyof typeof formats]?.label ?? value} />
        <Bar dataKey="rain" fill="#38bdf8" fillOpacity={0.75} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line dataKey="normal" stroke="#cbd5e1" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SoilChart({ climate }: { climate: ClimatePoint[] }) {
  const data: Row[] = climate.map((p) => ({ month: p.month, soil: p.soil, normal: p.soilNormal, solar: p.solar }));
  const formats = {
    soil: { label: "Root-zone soil wetness", unit: "%", decimals: 0 },
    normal: { label: "2001–2020 normal", unit: "%", decimals: 0 },
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...commonX(data.length)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, 100]} unit="%" />
        <Tooltip content={<ChartTooltip formats={formats} />} labelFormatter={(m) => formatMonth(String(m), "long")} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} iconType="plainline" formatter={(value) => formats[value as keyof typeof formats]?.label ?? value} />
        <Line dataKey="normal" stroke="#64748b" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line dataKey="soil" stroke="#a3e635" strokeWidth={2.2} dot={{ r: 2.5, fill: "#a3e635", strokeWidth: 0 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SingleSeriesChart({
  series,
  color,
  kind = "line",
  reference,
}: {
  series: SatelliteSeries;
  color: string;
  kind?: "line" | "area";
  reference?: { y: number; label: string };
}) {
  const data: Row[] = series.points.map((p) => ({ month: p.month, value: p.value }));
  const formats = { value: { label: series.label, unit: series.unit === "AOD" ? "" : series.unit, decimals: series.decimals } };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...commonX(data.length)} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip formats={formats} />} labelFormatter={(m) => formatMonth(String(m), "long")} />
        {reference && <ReferenceLine y={reference.y} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: reference.label, fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }} />}
        {kind === "area" ? (
          <Area dataKey="value" stroke={color} fill={color} fillOpacity={0.25} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
        ) : (
          <Line dataKey="value" stroke={color} strokeWidth={2.2} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Tiny inline trend line for KPI cards. */
export function Sparkline({ values, color = "#2dd4bf", className }: { values: (number | null)[]; color?: string; className?: string }) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
  if (points.length < 2) return <div className={cn("h-8", className)} />;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  const w = 120;
  const h = 32;
  const n = Math.max(values.length - 1, 1);
  const path = points.map((p, k) => `${k === 0 ? "M" : "L"}${((p.i / n) * w).toFixed(1)},${(h - 3 - ((p.v - min) / span) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
