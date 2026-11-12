import { AlertTriangle, Loader2 } from "lucide-react";
import type { MeasureScan } from "@/hooks/useTrendScans";
import { INDICATORS, type IndicatorId } from "@/lib/query/indicators";
import { cn } from "@/lib/utils";

interface MeasureTabsProps {
  indicators: IndicatorId[];
  measures: Partial<Record<IndicatorId, MeasureScan>>;
  /** Hotspots shown per measure (after filters). */
  counts: Partial<Record<IndicatorId, number>>;
  active: IndicatorId;
  onChange: (indicator: IndicatorId) => void;
  panelId: string;
}

function badge(measure: MeasureScan | undefined, count: number | undefined) {
  if (!measure || measure.status === "waiting") return <span className="opacity-75">waiting</span>;
  if (measure.status === "scanning") return <Loader2 className="h-3 w-3 animate-spin" aria-label="scanning" />;
  if (measure.status === "error") return <AlertTriangle className="h-3 w-3 text-tone-warn" aria-label="couldn't scan" />;
  if (measure.status === "stopped") return <span className="opacity-75">stopped</span>;
  return <span className="font-mono">{count ?? 0}</span>;
}

/** One tab per measure; each fills in as its scan finishes. */
export default function MeasureTabs({ indicators, measures, counts, active, onChange, panelId }: MeasureTabsProps) {
  const move = (step: number) => {
    const next = indicators[(indicators.indexOf(active) + step + indicators.length) % indicators.length];
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`measure-tab-${next}`)?.focus());
  };
  return (
    <div
      role="tablist"
      aria-label="Results by measure"
      className="flex flex-wrap gap-1.5"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") move(1);
        if (event.key === "ArrowLeft") move(-1);
      }}
    >
      {indicators.map((id) => {
        const selected = id === active;
        return (
          <button
            key={id}
            id={`measure-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(selected ? "chip-on" : "chip", "gap-1.5")}
          >
            {INDICATORS[id].label}
            <span className="font-mono text-[10px] opacity-75">{badge(measures[id], counts[id])}</span>
          </button>
        );
      })}
    </div>
  );
}
