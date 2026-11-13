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
    <ol className="border-t border-panel-line" aria-label="Hotspots, largest change first">
      {hotspots.map((hotspot) => {
        const selected = hotspot.id === selectedId;
        const title = hotspotTitle({ ...hotspot, label: hotspot.label ?? labels[hotspot.id] });
        return (
          <li key={hotspot.id} className="border-b border-panel-line">
            <button
              type="button"
              onClick={() => onSelect(hotspot.id)}
              aria-pressed={selected}
              className={cn("grid w-full grid-cols-[1.4rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 text-left transition-colors hover:bg-panel-tint", selected && "bg-panel-tint-strong")}
            >
              <span className={cn("font-mono text-[11px] tabular-nums", selected ? "text-panel-foreground" : "text-panel-muted")}>{String(hotspot.rank).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span translate="no" className="block truncate text-[13px] text-panel-foreground">
                  {title}
                </span>
                <span className="mt-0.5 block font-mono text-[10.5px] leading-snug tabular-nums text-panel-muted">
                  {formatArea(hotspot.areaKm2)} · {signed(hotspot.meanChange, indicator.decimals)} {indicator.unit}
                  {plan.kind === "trend" && hotspot.significantShare > 0 ? ` · ${Math.round(hotspot.significantShare * 100)}% clear trend` : ""}
                </span>
              </span>
              <span className="text-panel-soft">
                <YearTrendChart series={hotspot.series} unit={indicator.unit} decimals={indicator.decimals} compact label={`${title} over time`} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
