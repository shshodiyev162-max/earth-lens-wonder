import { Calendar, CloudRain, Flame, Leaf, Snowflake, Wind } from "lucide-react";
import { DATASETS } from "@/lib/analysis/run";
import type { DatasetId } from "@/lib/analysis/types";
import { formatMonth } from "@/lib/gibs/time";
import { EARLIEST_MONTH, PERIOD_OPTIONS, defaultEndMonth, type PeriodId } from "@/lib/analysis/period";
import { cn } from "@/lib/utils";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

interface PeriodPickerProps {
  period: PeriodId;
  start: string;
  end: string;
  onChange: (period: PeriodId, start?: string, end?: string) => void;
}

export function PeriodPicker({ period, start, end, onChange }: PeriodPickerProps) {
  const latest = defaultEndMonth();
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
        <Calendar className="w-3 h-3 text-primary" /> Time range
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time range">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={period === option.id}
            onClick={() => onChange(option.id, option.id === "custom" ? start : undefined, option.id === "custom" ? end : undefined)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors",
              period === option.id ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            From
            <input
              type="month"
              value={start}
              min={EARLIEST_MONTH}
              max={end}
              onChange={(event) => MONTH_RE.test(event.target.value) && onChange("custom", event.target.value, end)}
              className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground [color-scheme:dark]"
            />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            To
            <input
              type="month"
              value={end}
              min={start}
              max={latest}
              onChange={(event) => MONTH_RE.test(event.target.value) && onChange("custom", start, event.target.value)}
              className="rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground [color-scheme:dark]"
            />
          </label>
          <p className="w-full text-xs text-muted-foreground">Up to 10 years, from March 2000 (start of MODIS) to {formatMonth(latest, "long")}.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {formatMonth(start, "long")} – {formatMonth(end, "long")}
        </p>
      )}
    </div>
  );
}

const DATASET_ICON: Record<DatasetId, typeof Leaf> = {
  vegetation: Leaf,
  surfaceHeat: Flame,
  climate: CloudRain,
  air: Wind,
  snow: Snowflake,
};

export function DatasetPicker({ selected, onChange }: { selected: DatasetId[]; onChange: (next: DatasetId[]) => void }) {
  const toggle = (id: DatasetId) => {
    const next = selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id];
    if (next.length) onChange(DATASETS.map((d) => d.id).filter((d) => next.includes(d)));
  };
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">NASA datasets</div>
      <div className="grid gap-2">
        {DATASETS.map((dataset) => {
          const Icon = DATASET_ICON[dataset.id];
          const on = selected.includes(dataset.id);
          return (
            <button
              key={dataset.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(dataset.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2 text-left border transition-colors",
                on ? "border-primary bg-primary/5" : "border-border/50 hover:bg-card/60",
              )}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: dataset.color }} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-sm font-medium text-foreground">{dataset.label}</span>
                <span className="block text-xs text-muted-foreground">{dataset.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
