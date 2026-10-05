import { signed } from "@/lib/analysis/stats";
import { formatArea } from "@/lib/geo/geometry";
import type { Indicator } from "@/lib/query/indicators";
import type { PeriodPlan } from "@/lib/query/period";
import { hotspotTitle } from "@/lib/trends/query";
import type { HotspotDetail } from "@/lib/trends/scan";
import { cn } from "@/lib/utils";
import YearTrendChart from "./YearTrendChart";

interface HotspotListProps {
  hotspots: HotspotDetail[];
  labels: Record<string, string>;
  indicator: Indicator;
  plan: PeriodPlan;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The ranked hotspots: biggest area × strongest change first. */
export default function HotspotList({ hotspots, labels, indicator, plan, selectedId, onSelect }: HotspotListProps) {
  return (
    <ol className="space-y-1.5" aria-label="Hotspots, largest change first">
      {hotspots.map((hotspot) => {
        const selected = hotspot.id === selectedId;
        const title = hotspotTitle({ ...hotspot, label: labels[hotspot.id] });
        const color = hotspot.sign < 0 ? indicator.colors.decline : indicator.colors.increase;
        return (
          <li key={hotspot.id}>
            <button
              type="button"
              onClick={() => onSelect(hotspot.id)}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                selected ? "border-yellow-300/70 bg-yellow-300/10" : "border-panel-line bg-panel-tint hover:border-cyan-400/40",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white ring-1 ring-white/70">{hotspot.rank}</span>
              <span className="min-w-0 flex-1">
                <span translate="no" className="block truncate text-sm font-medium text-panel-foreground">
                  {title}
                </span>
                <span className="block text-[11px] leading-relaxed text-panel-muted">
                  {formatArea(hotspot.areaKm2)} · {signed(hotspot.meanChange, indicator.decimals)} {indicator.unit}
                  {plan.kind === "trend" && hotspot.significantShare > 0 ? ` · ${Math.round(hotspot.significantShare * 100)}% significant` : ""}
                </span>
              </span>
              <YearTrendChart series={hotspot.series} baseline={plan.baseline} recent={plan.recent} color={color} unit={indicator.unit} decimals={indicator.decimals} compact label={`${title} over time`} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
