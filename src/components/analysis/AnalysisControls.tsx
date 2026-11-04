import { useEffect, useId, useState } from "react";
import { Calendar, CalendarRange, CloudRain, Droplets, Factory, Flame, Leaf, Plane, Shield, Snowflake, Waves, Wind } from "lucide-react";
import MonthToggles from "@/components/common/MonthToggles";
import { DATASETS, DEFAULT_DATASETS } from "@/lib/analysis/run";
import type { DatasetId } from "@/lib/analysis/types";
import { formatMonth } from "@/lib/gibs/time";
import { monthsLabel, SEASONS } from "@/lib/query/indicators";
import {
  EARLIEST_MONTH,
  EARLIEST_YEAR,
  PERIOD_PRESETS,
  defaultComparison,
  defaultEndMonth,
  lastCompleteYear,
  selectionMonths,
  type PeriodEdit,
  type PeriodKind,
  type PeriodSelection,
  type SeasonChoice,
  type YearSpan,
} from "@/lib/analysis/period";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS: { id: PeriodKind; label: string }[] = [
  ...PERIOD_PRESETS.map((p) => ({ id: p.id, label: p.label })),
  { id: "custom", label: "Custom" },
  { id: "compare", label: "Compare two periods" },
];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const pill = "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors pointer-coarse:min-h-11";
const input = "rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground pointer-coarse:min-h-11";

/** Two year boxes ("2001" – "2010"); a change is applied when a box loses focus or Enter is pressed. */
function SpanInput({ label, span, first, last, onChange }: { label: string; span: YearSpan; first: number; last: number; onChange: (span: YearSpan) => void }) {
  const [a, setA] = useState(String(span[0]));
  const [b, setB] = useState(String(span[1]));
  useEffect(() => {
    setA(String(span[0]));
    setB(String(span[1]));
  }, [span]);
  const clamp = (value: string, fallback: number) => Math.min(last, Math.max(first, Math.round(Number(value)) || fallback));
  const commit = () => {
    const x = clamp(a, span[0]);
    const y = clamp(b, span[1]);
    const next: YearSpan = x <= y ? [x, y] : [y, x];
    if (next[0] !== span[0] || next[1] !== span[1]) onChange(next);
    else {
      setA(String(span[0]));
      setB(String(span[1]));
    }
  };
  const box = (value: string, set: (v: string) => void, which: string) => (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">
        {label}: {which} year
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={first}
        max={last}
        value={value}
        onChange={(event) => set(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
        className={cn(input, "w-20")}
      />
    </label>
  );
  return (
    <fieldset className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <legend className="sr-only">{label} period</legend>
      <span aria-hidden className="w-10 font-medium text-foreground">
        {label}
      </span>
      {box(a, setA, "first")}
      <span aria-hidden>–</span>
      {box(b, setB, "last")}
    </fieldset>
  );
}

interface PeriodPickerProps {
  selection: PeriodSelection;
  onChange: (edit: PeriodEdit) => void;
}

export function PeriodPicker({ selection, onChange }: PeriodPickerProps) {
  const latest = defaultEndMonth();
  const lastYear = lastCompleteYear(latest);
  const { kind: period, start, end } = selection;
  const spans = selection.baseline && selection.recent ? { baseline: selection.baseline, recent: selection.recent } : defaultComparison(latest);
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
            onClick={() => onChange({ kind: option.id, ...(option.id === "custom" ? { start, end } : {}) })}
            className={cn(pill, period === option.id ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground")}
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
              onChange={(event) => MONTH_RE.test(event.target.value) && onChange({ kind: "custom", start: event.target.value, end })}
              className={input}
            />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            To
            <input
              type="month"
              value={end}
              min={start}
              max={latest}
              onChange={(event) => MONTH_RE.test(event.target.value) && onChange({ kind: "custom", start, end: event.target.value })}
              className={input}
            />
          </label>
          <p className="w-full text-xs text-muted-foreground">Any months from March 2000 (start of MODIS) to {formatMonth(latest, "long")}.</p>
        </div>
      ) : period === "compare" ? (
        <div className="space-y-2">
          <SpanInput label="Then" span={spans.baseline} first={EARLIEST_YEAR} last={lastYear} onChange={(baseline) => onChange({ kind: "compare", baseline, recent: spans.recent })} />
          <SpanInput label="Now" span={spans.recent} first={EARLIEST_YEAR} last={lastYear} onChange={(recent) => onChange({ kind: "compare", baseline: spans.baseline, recent })} />
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <CalendarRange className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
            Each year becomes one average, then the two periods are compared with a t-test. 5–10 years in each works best.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {formatMonth(start, "long")} – {formatMonth(end, "long")}
        </p>
      )}
    </div>
  );
}

const SEASON_CHOICES: (SeasonChoice | "custom")[] = ["all", "growing", "summer", "winter", "spring", "autumn", "cold", "custom"];

/** Which months of each year to read: all, a season, or months picked one by one. */
export function MonthsPicker({ selection, latitude, onChange }: { selection: PeriodSelection; latitude: number; onChange: (edit: PeriodEdit) => void }) {
  const id = useId();
  const value = selection.customMonths?.length ? "custom" : selection.season;
  const months = selectionMonths(selection, latitude);
  const flipped = latitude < 0 && !selection.customMonths?.length && selection.season !== "all";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        Months of each year
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = event.target.value as (typeof SEASON_CHOICES)[number];
          if (next === "custom") onChange({ customMonths: months.length < 12 ? months : [6, 7, 8] });
          else onChange({ season: next });
        }}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground pointer-coarse:min-h-11"
      >
        {SEASON_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {choice === "custom" ? "Choose months…" : choice === "all" ? "All months" : SEASONS[choice].label}
          </option>
        ))}
      </select>
      {value === "custom" && <MonthToggles look="page" value={months} onChange={(next) => onChange({ customMonths: next })} />}
      {flipped && <p className="text-xs text-muted-foreground">South of the equator the seasons are flipped: {monthsLabel(months)}.</p>}
    </div>
  );
}

const DATASET_ICON: Record<DatasetId, typeof Leaf> = {
  vegetation: Leaf,
  surfaceHeat: Flame,
  climate: CloudRain,
  air: Wind,
  snow: Snowflake,
  evaporation: Droplets,
  sst: Waves,
  so2: Factory,
  co: Flame,
  upperAir: Plane,
  ozone: Shield,
};

export function DatasetPicker({ selected, onChange }: { selected: DatasetId[]; onChange: (next: DatasetId[]) => void }) {
  const toggle = (id: DatasetId) => {
    const next = selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id];
    if (next.length) onChange(DATASETS.map((d) => d.id).filter((d) => next.includes(d)));
  };
  const more = DATASETS.filter((d) => !DEFAULT_DATASETS.includes(d.id));
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">NASA datasets</div>
      <DatasetList datasets={DATASETS.filter((d) => DEFAULT_DATASETS.includes(d.id))} selected={selected} onToggle={toggle} />
      <details open={more.some((d) => selected.includes(d.id))} className="space-y-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
          More NASA measures ({more.length}): sea, upper air, ozone, pollution gases, evaporation
        </summary>
        <div className="pt-2">
          <DatasetList datasets={more} selected={selected} onToggle={toggle} />
        </div>
      </details>
    </div>
  );
}

function DatasetList({ datasets, selected, onToggle }: { datasets: typeof DATASETS; selected: DatasetId[]; onToggle: (id: DatasetId) => void }) {
  const toggle = onToggle;
  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {datasets.map((dataset) => {
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
