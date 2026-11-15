import { useId } from "react";
import MonthToggles from "@/components/common/MonthToggles";
import YearTimeline from "@/components/common/YearTimeline";
import { CLIMATE_METRICS, METRIC_BY_ID, type MetricId } from "@/lib/analysis/metrics";
import { MEASURE_COUNT } from "@/lib/analysis/measures";
import { DATASETS, DATASET_BY_ID } from "@/lib/analysis/run";
import { METRIC_DEFINITIONS } from "@/lib/glossary";
import type { DatasetId } from "@/lib/analysis/types";
import { formatMonth } from "@/lib/gibs/time";
import { MEASURE_GROUPS, monthsLabel, SEASONS } from "@/lib/query/indicators";
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
const input = "rounded-md border border-panel-line-strong bg-transparent px-2 py-1 font-mono text-xs tabular-nums text-foreground outline-none focus:border-panel-foreground/70 pointer-coarse:min-h-11";

interface PeriodPickerProps {
  selection: PeriodSelection;
  onChange: (edit: PeriodEdit) => void;
}

export function PeriodPicker({ selection, onChange }: PeriodPickerProps) {
  const latest = defaultEndMonth();
  const lastYear = lastCompleteYear(latest);
  const latestYear = Number(latest.slice(0, 4));
  const { kind: period, start, end } = selection;
  const spans = selection.baseline && selection.recent ? { baseline: selection.baseline, recent: selection.recent } : defaultComparison(latest);
  const years: [number, number] = [Number(start.slice(0, 4)), Number(end.slice(0, 4))];
  // Whole years from the timeline; the first year starts when MODIS does, the latest ends with the latest month.
  const setYears = ([a, b]: [number, number]) =>
    onChange({ kind: "custom", start: a <= EARLIEST_YEAR ? EARLIEST_MONTH : `${a}-01`, end: b >= latestYear ? latest : `${b}-12` });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Time range">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={period === option.id}
            onClick={() => onChange({ kind: option.id, ...(option.id === "custom" ? { start, end } : {}) })}
            className={period === option.id ? "chip-on" : "chip"}
          >
            {option.label}
          </button>
        ))}
      </div>
      {period === "compare" ? (
        <div className="space-y-3">
          {(
            [
              ["Then", spans.baseline, (baseline: YearSpan) => onChange({ kind: "compare", baseline, recent: spans.recent })],
              ["Now", spans.recent, (recent: YearSpan) => onChange({ kind: "compare", baseline: spans.baseline, recent })],
            ] as const
          ).map(([label, span, set]) => (
            <fieldset key={label}>
              <legend className="mb-1 flex w-full justify-between text-xs">
                <span className="font-medium text-foreground">{label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {span[0]}–{span[1]} · {span[1] - span[0] + 1} years
                </span>
              </legend>
              <YearTimeline
                first={EARLIEST_YEAR}
                last={lastYear}
                value={[span[0], span[1]]}
                labels={[`${label}: first year`, `${label}: last year`]}
                windows={[{ label: label === "Then" ? "Now" : "Then", span: label === "Then" ? spans.recent : spans.baseline }]}
                onChange={(next) => set(next)}
              />
            </fieldset>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each year becomes one average, then the two periods are compared with a t-test. 5–10 years in each works best. The solid part of each timeline is the other period.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <YearTimeline first={EARLIEST_YEAR} last={latestYear} value={years} labels={["First year", "Last year"]} onChange={setYears} />
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatMonth(start, "long")} – {formatMonth(end, "long")}
          </p>
          {period === "custom" && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">Exact months</summary>
              <div className="mt-2 flex flex-wrap items-center gap-3">
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
                <p className="w-full text-muted-foreground">Any months from March 2000 (start of MODIS) to {formatMonth(latest, "long")}.</p>
              </div>
            </details>
          )}
        </div>
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
      <label htmlFor={id} className="block text-xs text-muted-foreground">
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
        className="field"
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

/** The climate measures first (six from one quick request), then every map-based measure by group. */
export function DatasetPicker({ selected, climate, onChange, note }: { selected: DatasetId[]; climate: MetricId[]; onChange: (next: DatasetId[], climate: MetricId[]) => void; note?: string }) {
  const ordered = (ids: DatasetId[]) => DATASETS.map((d) => d.id).filter((d) => ids.includes(d));
  const toggle = (id: DatasetId) => {
    const next = selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id];
    if (next.length) onChange(ordered(next), climate);
  };
  // A climate measure: the climate request is read while any of the six is chosen.
  const toggleClimate = (id: MetricId) => {
    const next = climate.includes(id) ? climate.filter((c) => c !== id) : CLIMATE_METRICS.filter((c) => c === id || climate.includes(c));
    const maps = selected.filter((d) => d !== "climate");
    if (!next.length && !maps.length) return;
    onChange(ordered(next.length ? [...maps, "climate"] : maps), next);
  };
  return (
    <div className="space-y-3.5">
      <p className="text-xs text-muted-foreground">{MEASURE_COUNT} measures. Pick any mix; each is tested on its own.</p>
      <div className="space-y-1.5">
        <p id="dataset-group-climate" className="text-xs text-muted-foreground">
          {DATASET_BY_ID.climate.label} <span className="text-panel-muted">· NASA POWER, one request, ready in seconds</span>
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="dataset-group-climate">
          {CLIMATE_METRICS.map((id) => (
            <button key={id} type="button" role="checkbox" aria-checked={climate.includes(id)} title={METRIC_DEFINITIONS[id]} onClick={() => toggleClimate(id)} className={climate.includes(id) ? "chip-on" : "chip"}>
              {METRIC_BY_ID[id].label}
            </button>
          ))}
        </div>
      </div>
      {MEASURE_GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <p id={`dataset-group-${group.id}`} className="text-xs text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`dataset-group-${group.id}`}>
            {DATASETS.filter((d) => d.group === group.id).map((dataset) => (
              <button key={dataset.id} type="button" role="checkbox" aria-checked={selected.includes(dataset.id)} title={dataset.description} onClick={() => toggle(dataset.id)} className={selected.includes(dataset.id) ? "chip-on" : "chip"}>
                {dataset.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {note && <p className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">{note}</p>}
      <details className="border-t border-panel-line pt-2.5">
        <summary className="flex cursor-pointer items-center text-xs text-panel-soft hover:text-panel-foreground pointer-coarse:min-h-11">What does each one measure?</summary>
        <dl className="mt-2.5 space-y-2 text-xs leading-relaxed">
          {CLIMATE_METRICS.map((id) => (
            <div key={id}>
              <dt className="font-medium text-foreground">{METRIC_BY_ID[id].label}</dt>
              <dd className="text-muted-foreground">{METRIC_DEFINITIONS[id]} From NASA POWER, compared with the 2001–2020 normal.</dd>
            </div>
          ))}
          {DATASETS.filter((dataset) => dataset.id !== "climate").map((dataset) => (
            <div key={dataset.id}>
              <dt className="font-medium text-foreground">{dataset.label}</dt>
              <dd className="text-muted-foreground">{dataset.description}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
