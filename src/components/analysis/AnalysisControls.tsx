import { CalendarRange, CloudRain, Flame, Leaf, Snowflake, Wind } from "lucide-react";
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
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 section-label">
        <CalendarRange className="h-3.5 w-3.5 text-primary" /> Period
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary/40 p-1" role="radiogroup" aria-label="Period">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={period === option.id}
            onClick={() => onChange(option.id, option.id === "custom" ? start : undefined, option.id === "custom" ? end : undefined)}
            className={cn(
              "rounded-lg px-1 py-1.5 text-xs font-semibold transition",
              period === option.id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">
            From
            <input
              type="month"
              value={start}
              min={EARLIEST_MONTH}
              max={end}
              onChange={(event) => MONTH_RE.test(event.target.value) && onChange("custom", event.target.value, end)}
              className="mt-1 w-full rounded-lg field px-2.5 py-2 text-sm text-foreground outline-none [color-scheme:dark]"
            />
          </label>
          <label className="text-[11px] text-muted-foreground">
            To
            <input
              type="month"
              value={end}
              min={start}
              max={latest}
              onChange={(event) => MONTH_RE.test(event.target.value) && onChange("custom", start, event.target.value)}
              className="mt-1 w-full rounded-lg field px-2.5 py-2 text-sm text-foreground outline-none [color-scheme:dark]"
            />
          </label>
          <p className="col-span-2 text-[11px] text-muted-foreground">Up to 10 years, from March 2000 (start of MODIS) to {formatMonth(latest, "long")}.</p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
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
    <div>
      <div className="mb-1.5 section-label">NASA datasets</div>
      <div className="space-y-1.5">
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
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                on ? "border-border bg-secondary/40" : "border-border/40 bg-transparent opacity-60 hover:opacity-90",
              )}
            >
              <span
                className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-transparent" : "border-muted-foreground/40")}
                style={on ? { background: dataset.color } : undefined}
                aria-hidden
              >
                {on && <span className="block h-1.5 w-1.5 rounded-sm bg-primary-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Icon className="h-3.5 w-3.5" style={{ color: dataset.color }} /> {dataset.label}
                </span>
                <span className="block text-xs text-muted-foreground">{dataset.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
