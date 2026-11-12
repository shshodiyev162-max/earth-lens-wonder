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
import { yearTicks } from "@/lib/analysis/chartTicks";
import type { ClimatePoint, SatelliteSeries } from "@/lib/analysis/types";
import { useTheme, type Theme } from "@/context/theme";

interface ChartColors {
  axis: { fill: string; fontSize: number; fontFamily: string };
  grid: string;
  legend: string;
  /** The measured values. */
  line: string;
  normal: string;
  normalRain: string;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

// SVG attributes can't read CSS variables, so chart greys are picked per theme here.
const CHART_COLORS: Record<Theme, ChartColors> = {
  dark: { axis: { fill: "#a0a2ad", fontSize: 10, fontFamily: MONO }, grid: "rgba(255,255,255,0.08)", legend: "#a0a2ad", line: "#fafafa", normal: "#8b8d98", normalRain: "#c9cad2" },
  light: { axis: { fill: "#55575f", fontSize: 10, fontFamily: MONO }, grid: "rgba(15,17,25,0.1)", legend: "#55575f", line: "#101218", normal: "#7a7c86", normalRain: "#55575f" },
};

function useChartColors(): ChartColors {
  return CHART_COLORS[useTheme().theme];
}

type Row = Record<string, number | string | null | [number, number] | undefined>;

interface SeriesFormat {
  label: string;
  unit?: string;
  decimals?: number;
}

function ChartTooltip({ active, payload, label, formats }: TooltipProps<number, string> & { formats: Record<string, SeriesFormat> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-1 font-mono text-[10.5px] text-muted-foreground">{formatMonth(String(label), "long")}</div>
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

/** A record of a few months names each month; a longer one names evenly spaced years. */
const commonX = (rows: Row[], colors: ChartColors) => {
  const months = rows.map((row) => String(row.month));
  const long = months.length > 24;
  return {
    dataKey: "month",
    tick: colors.axis,
    tickLine: false,
    axisLine: { stroke: colors.grid },
    tickFormatter: (m: string) => (long ? m.slice(0, 4) : formatMonth(m)),
    ...(long ? { ticks: yearTicks(months), interval: 0 as const } : { minTickGap: 18 }),
  };
};

export function VegetationChart({ series }: { series: SatelliteSeries }) {
  const c = useChartColors();
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
      <ComposedChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis {...commonX(data, c)} />
        <YAxis tick={c.axis} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.min(1, Math.ceil((max + 0.05) * 10) / 10)]} width={44} />
        <Tooltip content={<ChartTooltip formats={formats} />} />
        <Area dataKey="range" stroke="none" fill={c.line} fillOpacity={0.1} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="mean" stroke={c.line} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TemperatureChart({ climate }: { climate: ClimatePoint[] }) {
  const c = useChartColors();
  const data: Row[] = climate.map((p) => ({ month: p.month, air: p.temp, normal: p.tempNormal }));
  const formats = {
    air: { label: "Air temperature", unit: "°C" },
    normal: { label: "2001–2020 normal", unit: "°C" },
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis {...commonX(data, c)} />
        <YAxis tick={c.axis} tickLine={false} axisLine={false} width={44} unit="°" />
        <Tooltip content={<ChartTooltip formats={formats} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.legend }} iconType="plainline" formatter={(value) => formats[value as keyof typeof formats]?.label ?? value} />
        <Line dataKey="normal" stroke={c.normal} strokeDasharray="5 4" strokeWidth={1.25} dot={false} isAnimationActive={false} />
        <Line dataKey="air" stroke={c.line} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RainChart({ climate }: { climate: ClimatePoint[] }) {
  const c = useChartColors();
  const data: Row[] = climate.map((p) => ({ month: p.month, rain: p.precip, normal: p.precipNormal }));
  const formats = { rain: { label: "Rainfall", unit: "mm", decimals: 0 }, normal: { label: "2001–2020 normal", unit: "mm", decimals: 0 } };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis {...commonX(data, c)} />
        <YAxis tick={c.axis} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip formats={formats} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.legend }} formatter={(value) => formats[value as keyof typeof formats]?.label ?? value} />
        <Bar dataKey="rain" fill={c.line} fillOpacity={0.7} isAnimationActive={false} />
        <Line dataKey="normal" stroke={c.normalRain} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SoilChart({ climate }: { climate: ClimatePoint[] }) {
  const c = useChartColors();
  const data: Row[] = climate.map((p) => ({ month: p.month, soil: p.soil, normal: p.soilNormal, solar: p.solar }));
  const formats = {
    soil: { label: "Root-zone soil wetness", unit: "%", decimals: 0 },
    normal: { label: "2001–2020 normal", unit: "%", decimals: 0 },
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis {...commonX(data, c)} />
        <YAxis tick={c.axis} tickLine={false} axisLine={false} width={44} domain={[0, 100]} unit="%" />
        <Tooltip content={<ChartTooltip formats={formats} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: c.legend }} iconType="plainline" formatter={(value) => formats[value as keyof typeof formats]?.label ?? value} />
        <Line dataKey="normal" stroke={c.normal} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line dataKey="soil" stroke={c.line} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SingleSeriesChart({
  points,
  label,
  unit,
  decimals,
  kind = "line",
  reference,
}: {
  points: { month: string; value: number | null }[];
  label: string;
  unit: string;
  decimals: number;
  kind?: "line" | "area";
  reference?: { y: number; label: string };
}) {
  const c = useChartColors();
  const data: Row[] = points.map((p) => ({ month: p.month, value: p.value }));
  const formats = { value: { label, unit, decimals } };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis {...commonX(data, c)} />
        {/* Lines keep to their own range: methane near 1,900 ppb would be flat on an axis from zero. */}
        <YAxis tick={c.axis} tickLine={false} axisLine={false} width={44} domain={kind === "area" ? undefined : ["auto", "auto"]} />
        <Tooltip content={<ChartTooltip formats={formats} />} />
        {reference && <ReferenceLine y={reference.y} stroke={c.normal} strokeDasharray="4 4" label={{ value: reference.label, fill: c.legend, fontSize: 10, position: "insideTopRight" }} />}
        {kind === "area" ? (
          <Area dataKey="value" stroke={c.line} fill={c.line} fillOpacity={0.14} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
        ) : (
          <Line dataKey="value" stroke={c.line} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
