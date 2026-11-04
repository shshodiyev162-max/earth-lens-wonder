import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import MonthToggles from "@/components/common/MonthToggles";
import { MEASURE_DEFINITIONS } from "@/lib/glossary";
import { INDICATOR_ORDER, INDICATORS, monthsLabel, SEASONS, type Direction, type IndicatorId } from "@/lib/query/indicators";
import type { TimeSpec } from "@/lib/query/parse";
import { DEFAULT_FILTER, filterFor, type QueryEdit, type SeasonChoice, type TrendQuery } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-panel-line bg-panel-tint px-3 py-2 text-sm text-panel-foreground outline-none focus:border-cyan-400/60 pointer-coarse:min-h-11";
const yearInput = "w-20 rounded-md border border-panel-line bg-panel-tint px-2 py-1.5 text-sm text-panel-foreground outline-none focus:border-cyan-400/60 pointer-coarse:min-h-11";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wider text-panel-muted">
          {label}
        </label>
      ) : (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-muted">{label}</p>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What to measure

function MeasurePicker({ query, onEdit }: { query: TrendQuery; onEdit: (edit: QueryEdit) => void }) {
  const selected = new Set(query.indicators);
  const all = selected.size === INDICATOR_ORDER.length;
  const directions = query.indicators.map((id) => filterFor(query, id).direction);
  // A measure added to a search that asks one direction for everything asks the same.
  const shared: Direction = directions.length && directions.every((d) => d === directions[0]) ? directions[0] : "any";
  const withFilters = (ids: IndicatorId[]) => ({
    indicators: ids,
    filters: Object.fromEntries(ids.map((id) => [id, query.filters[id] ?? { direction: shared, ...DEFAULT_FILTER }])),
  });
  const toggle = (id: IndicatorId) => onEdit(withFilters(selected.has(id) ? query.indicators.filter((x) => x !== id) : [...query.indicators, id]));
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="What to measure">
        {INDICATOR_ORDER.map((id) => {
          const on = selected.has(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(id)}
              title={INDICATORS[id].product}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition pointer-coarse:min-h-11",
                on ? "border-cyan-400/60 bg-cyan-400/15 text-accent-cyan-soft" : "border-panel-line bg-panel-tint text-panel-soft hover:text-panel-foreground",
              )}
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} aria-hidden />
              {INDICATORS[id].label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={all}
        onClick={() => onEdit(withFilters(all ? [] : [...INDICATOR_ORDER]))}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition pointer-coarse:min-h-11",
          all ? "border-cyan-400/60 bg-cyan-400/15 text-accent-cyan-soft" : "border-dashed border-panel-line text-panel-muted hover:text-panel-foreground",
        )}
      >
        {all ? "All six selected · clear" : "Everything (all six)"}
      </button>
      <details className="rounded-lg border border-panel-line bg-panel-tint px-2.5 py-1.5">
        <summary className="flex cursor-pointer items-center text-[11px] font-medium text-panel-soft hover:text-panel-foreground pointer-coarse:min-h-11">What does each one measure?</summary>
        <dl className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
          {INDICATOR_ORDER.map((id) => (
            <div key={id}>
              <dt className="font-semibold text-panel-foreground">{INDICATORS[id].label}</dt>
              <dd className="text-panel-muted">{MEASURE_DEFINITIONS[id]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// When

type PeriodChoice = "default" | "last5" | "last20" | "all" | "last" | "since" | "range" | "versus" | "year";

function periodChoice(time: TimeSpec): PeriodChoice {
  if (time.kind === "last" && time.years === 5) return "last5";
  if (time.kind === "last" && time.years === 20) return "last20";
  if (time.kind === "since" && time.start === 2000) return "all";
  return time.kind;
}

function PeriodField({ time, first, last, onEdit }: { time: TimeSpec; first: number; last: number; onEdit: (edit: QueryEdit) => void }) {
  const id = useId();
  const choice = periodChoice(time);
  const clamp = (y: number) => Math.min(last, Math.max(first, Math.round(y) || first));
  const a = time.kind === "since" ? time.start : time.kind === "range" ? time.start : time.kind === "versus" ? time.baseline : time.kind === "year" ? time.year : last - 9;
  const b = time.kind === "range" ? time.end : time.kind === "versus" ? time.recent : last;
  const choose = (value: PeriodChoice) => {
    const presets: Partial<Record<PeriodChoice, TimeSpec>> = {
      default: { kind: "default" },
      last5: { kind: "last", years: 5 },
      last20: { kind: "last", years: 20 },
      all: { kind: "since", start: 2000 },
      last: { kind: "last", years: time.kind === "last" ? time.years : 15 },
      since: { kind: "since", start: clamp(a) },
      range: { kind: "range", start: clamp(Math.min(a, b)), end: clamp(Math.max(a, b)) },
      versus: { kind: "versus", baseline: clamp(Math.min(a, b - 10)), recent: clamp(b) },
      year: { kind: "year", year: clamp(b) },
    };
    onEdit({ time: presets[value] as TimeSpec });
  };
  const year = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="flex items-center gap-1.5">
      {label}
      <input type="number" min={first} max={last} defaultValue={value} key={`${label}-${value}`} onBlur={(event) => onChange(clamp(Number(event.target.value)))} className={yearInput} />
    </label>
  );
  return (
    <Field label="When" htmlFor={id}>
      <select id={id} value={choice} onChange={(event) => choose(event.target.value as PeriodChoice)} className={cn(field, "bg-panel")}>
        <option value="default">Last 10 years</option>
        <option value="last5">Last 5 years</option>
        <option value="last20">Last 20 years</option>
        <option value="all">All data (since 2000)</option>
        <option value="last">The last … years</option>
        <option value="since">Since a year…</option>
        <option value="range">Between two years…</option>
        <option value="versus">Compare two years…</option>
        <option value="year">One year vs the 10 before…</option>
      </select>
      <div className="flex flex-wrap items-center gap-2 text-xs text-panel-muted">
        {time.kind === "last" && choice === "last" && (
          <label className="flex items-center gap-1.5">
            Years
            <input type="number" min={2} max={40} defaultValue={time.years} key={time.years} onBlur={(event) => onEdit({ time: { kind: "last", years: Math.max(2, Math.min(40, Math.round(Number(event.target.value)) || 10)) } })} className={yearInput} />
          </label>
        )}
        {time.kind === "since" && choice === "since" && year("From", time.start, (v) => onEdit({ time: { kind: "since", start: v } }))}
        {time.kind === "range" && (
          <>
            {year("From", time.start, (v) => onEdit({ time: { kind: "range", start: Math.min(v, time.end), end: Math.max(v, time.end) } }))}
            {year("To", time.end, (v) => onEdit({ time: { kind: "range", start: Math.min(v, time.start), end: Math.max(v, time.start) } }))}
          </>
        )}
        {time.kind === "versus" && (
          <>
            {year("Then", time.baseline, (v) => onEdit({ time: { kind: "versus", baseline: Math.min(v, time.recent), recent: Math.max(v, time.recent) } }))}
            {year("Now", time.recent, (v) => onEdit({ time: { kind: "versus", baseline: Math.min(v, time.baseline), recent: Math.max(v, time.baseline) } }))}
          </>
        )}
        {time.kind === "year" && year("Year", time.year, (v) => onEdit({ time: { kind: "year", year: v } }))}
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Months

const SEASON_CHOICES: (SeasonChoice | "usual" | "custom")[] = ["usual", "all", "growing", "summer", "winter", "spring", "autumn", "cold", "custom"];

function MonthsField({ query, onEdit }: { query: TrendQuery; onEdit: (edit: QueryEdit) => void }) {
  const id = useId();
  const value = query.months?.length ? "custom" : (query.season ?? "usual");
  const [picking, setPicking] = useState<number[]>(query.months ?? []);
  useEffect(() => setPicking(query.months ?? []), [query.months]);
  const usual = query.indicators.length
    ? query.indicators.map((i) => `${INDICATORS[i].label} ${monthsLabel(SEASONS[INDICATORS[i].season].months)}`).join(", ")
    : "each measure's own season";
  return (
    <Field label="Months compared" htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = event.target.value as (typeof SEASON_CHOICES)[number];
          if (next === "custom") onEdit({ months: picking.length ? picking : [6, 7, 8] });
          else onEdit({ season: next === "usual" ? null : next });
        }}
        className={cn(field, "bg-panel")}
      >
        {SEASON_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {choice === "usual" ? "Usual season of each measure" : choice === "custom" ? "Choose months…" : SEASONS[choice].label}
          </option>
        ))}
      </select>
      {value === "usual" && <p className="text-[11px] leading-relaxed text-panel-muted">{usual}. Seasons flip south of the equator.</p>}
      {value === "custom" && (
        <MonthToggles
          value={picking}
          onChange={(next) => {
            setPicking(next);
            onEdit({ months: next });
          }}
        />
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------

interface TrendFormProps {
  query: TrendQuery;
  /** The "where" step (drawing and picking on the map lives with the page). */
  where: ReactNode;
  years: { first: number; last: number };
  onEdit: (edit: QueryEdit) => void;
  onRun: () => void;
  /** The form differs from the results shown. */
  dirty: boolean;
  /** Results (or a scan) exist for the current choices, so running again would change nothing. */
  current: boolean;
  busy: boolean;
  /** "About 360 monthly NASA maps · 1.5 – 5 min the first time" */
  estimate: string | null;
}

/** The whole search as a form: every part can be chosen without typing a sentence. */
export default function TrendForm({ query, where, years, onEdit, onRun, dirty, current, busy, estimate }: TrendFormProps) {
  const ready = query.indicators.length > 0;
  return (
    <div className="space-y-4">
      <Field label="What to measure">
        <MeasurePicker query={query} onEdit={onEdit} />
      </Field>
      {where}
      <PeriodField time={query.time} first={years.first} last={years.last} onEdit={onEdit} />
      <MonthsField query={query} onEdit={onEdit} />
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onRun}
          disabled={!ready || (!dirty && current)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50 pointer-coarse:min-h-11"
        >
          {busy && !dirty ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          Find changes
        </button>
        <p className="text-[11px] leading-relaxed text-panel-muted" aria-live="polite">
          {!ready ? "Pick at least one measure." : dirty ? (estimate ?? "Your choices have changed — find changes to update the results.") : busy ? "Scanning…" : "The results below match these choices."}
        </p>
      </div>
    </div>
  );
}
