import { useEffect, useId, useState, type ReactNode } from "react";
import { demoAttr } from "@/lib/demo/scripts";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import MonthToggles from "@/components/common/MonthToggles";
import StepLabel from "@/components/common/StepLabel";
import YearTimeline, { type TimelineMark } from "@/components/common/YearTimeline";
import { MEASURE_DEFINITIONS } from "@/lib/glossary";
import { CORE_INDICATORS, INDICATOR_ORDER, INDICATORS, MEASURE_GROUPS, monthsLabel, recordTag, SEASONS, type Direction, type IndicatorId } from "@/lib/query/indicators";
import { timeSpan, trendWindows, type TimeSpec } from "@/lib/query/period";
import { DEFAULT_FILTER, filterFor, type QueryEdit, type SeasonChoice, type TrendQuery } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

function Field({ number, label, htmlFor, children }: { number: number; label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 border-t border-panel-line pt-4">
      <StepLabel number={number} htmlFor={htmlFor}>
        {label}
      </StepLabel>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What to measure

function MeasurePicker({ query, onEdit }: { query: TrendQuery; onEdit: (edit: QueryEdit) => void }) {
  const suggested = query.everything;
  const selected = new Set(suggested ? [] : query.indicators);
  const main = !suggested && selected.size === CORE_INDICATORS.length && CORE_INDICATORS.every((id) => selected.has(id));
  const directions = query.indicators.map((id) => filterFor(query, id).direction);
  // A measure added to a search that asks one direction for everything asks the same.
  const shared: Direction = directions.length && directions.every((d) => d === directions[0]) ? directions[0] : "any";
  const withFilters = (ids: IndicatorId[]) => ({
    indicators: ids,
    filters: Object.fromEntries(ids.map((id) => [id, query.filters[id] ?? { direction: shared, ...DEFAULT_FILTER }])),
  });
  const toggle = (id: IndicatorId) =>
    onEdit(withFilters(suggested ? [id] : selected.has(id) ? query.indicators.filter((x) => x !== id) : [...query.indicators, id]));
  return (
    <div className="space-y-3.5">
      <button
        type="button"
        aria-pressed={suggested}
        onClick={() => onEdit(suggested ? withFilters([]) : { everything: true })}
        className={cn("flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors pointer-coarse:min-h-11", suggested ? "border-panel-foreground" : "border-panel-line-strong hover:border-panel-foreground/50")}
      >
        <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-panel-foreground", suggested ? "opacity-100" : "opacity-0")} aria-hidden />
        <span>
          <span className="block text-[13px] font-medium text-panel-foreground">Suggested for this place</span>
          <span className="mt-0.5 block text-xs leading-snug text-panel-muted">Up to six measures picked from NASA land cover once the place is found.</span>
        </span>
      </button>
      {MEASURE_GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <p id={`measure-group-${group.id}`} className="text-xs text-panel-muted">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`measure-group-${group.id}`}>
            {INDICATOR_ORDER.filter((id) => INDICATORS[id].group === group.id).map((id) => {
              const on = selected.has(id);
              const tag = recordTag(id);
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => toggle(id)} title={INDICATORS[id].product} className={on ? "chip-on" : "chip"}>
                  {INDICATORS[id].label}
                  {tag && <span className="ml-0.5 font-mono text-[10px] font-normal opacity-75">{tag}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <button type="button" aria-pressed={main} onClick={() => onEdit(withFilters(main ? [] : [...CORE_INDICATORS]))} className="link-quiet py-1 pointer-coarse:min-h-11">
          {main ? "Clear the six main measures" : "The six main measures"}
        </button>
      </div>
      <details className="group border-t border-panel-line pt-2.5">
        <summary className="flex cursor-pointer items-center text-xs text-panel-soft hover:text-panel-foreground pointer-coarse:min-h-11">What does each one measure?</summary>
        <dl className="mt-2.5 space-y-2 text-xs leading-relaxed">
          {INDICATOR_ORDER.map((id) => (
            <div key={id}>
              <dt className="font-medium text-panel-foreground">{INDICATORS[id].label}</dt>
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

/** The quick choices above the timeline; dragging it gives any other span. */
const PRESETS: { label: string; time: TimeSpec; matches: (time: TimeSpec) => boolean }[] = [
  { label: "Last 5 years", time: { kind: "last", years: 5 }, matches: (t) => t.kind === "last" && t.years === 5 },
  { label: "Last 10", time: { kind: "default" }, matches: (t) => t.kind === "default" || (t.kind === "last" && t.years === 10) },
  { label: "Last 20", time: { kind: "last", years: 20 }, matches: (t) => t.kind === "last" && t.years === 20 },
  { label: "All since 2000", time: { kind: "since", start: 2000 }, matches: (t) => t.kind === "since" && t.start === 2000 },
];

/** Measures whose record is shorter than the timeline, as marks under it. */
function shortRecords(ids: IndicatorId[], first: number, last: number): TimelineMark[] {
  return ids.flatMap((id) => {
    const info = INDICATORS[id];
    const from = info.firstMonth ? Math.max(first, Number(info.firstMonth.slice(0, 4))) : first;
    const to = info.lastMonth ? Math.min(last, Number(info.lastMonth.slice(0, 4))) : last;
    return from > first || to < last ? [{ label: info.label, span: [from, to] as [number, number] }] : [];
  });
}

const yearsText = (span: [number, number]) => (span[0] === span[1] ? String(span[0]) : `${span[0]}–${span[1]}`);

/**
 * When: a trend over a span of years, dragged on a timeline (with quick choices), or two single
 * years compared then vs now. The timeline shows which years the change compares and where a chosen
 * measure's record is shorter.
 */
function PeriodField({ time, first, last, indicators, onEdit }: { time: TimeSpec; first: number; last: number; indicators: IndicatorId[]; onEdit: (edit: QueryEdit) => void }) {
  const versus = time.kind === "versus";
  const span = timeSpan(time, last);
  const value: [number, number] = [Math.max(first, Math.min(last, span[0])), Math.max(first, Math.min(last, span[1]))];
  const windows = versus ? null : trendWindows(value[0], value[1], first);
  const records = shortRecords(indicators, first, last);
  const setSpan = ([a, b]: [number, number]) => onEdit({ time: b === last ? { kind: "since", start: a } : { kind: "range", start: a, end: b } });
  return (
    <Field number={3} label="When">
      <div className="segmented flex w-full" role="radiogroup" aria-label="What to compare">
        {(
          [
            [false, "A trend over years"],
            [true, "Two years, then vs now"],
          ] as const
        ).map(([pair, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={versus === pair}
            onClick={() => versus !== pair && onEdit({ time: pair ? { kind: "versus", baseline: Math.max(first, value[1] - 10), recent: value[1] } : { kind: "default" } })}
            className={cn("flex-1", versus === pair ? "segment-on" : "segment")}
          >
            {label}
          </button>
        ))}
      </div>
      {!versus && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick choices">
          {PRESETS.map((preset) => (
            <button key={preset.label} type="button" aria-pressed={preset.matches(time)} onClick={() => onEdit({ time: preset.time })} className={preset.matches(time) ? "chip-on" : "chip"}>
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <YearTimeline
        first={first}
        last={last}
        value={value}
        labels={versus ? ["Then", "Now"] : ["First year", "Last year"]}
        minYears={versus ? 2 : 1}
        windows={versus ? [{ label: "Then", span: [value[0], value[0]] }, { label: "Now", span: [value[1], value[1]] }] : windows ? [{ label: "Compared first", span: windows.baseline }, { label: "Compared last", span: windows.recent }] : []}
        records={records}
        onChange={(next) => (versus ? onEdit({ time: { kind: "versus", baseline: next[0], recent: next[1] } }) : setSpan(next))}
      />
      <p className="text-xs leading-relaxed text-panel-muted" aria-live="polite">
        {versus ? (
          <>
            <span className="text-panel-foreground">{value[0]} against {value[1]}.</span> Two single years compared directly: with only two values there is no trend test.
          </>
        ) : value[1] - value[0] + 1 <= 4 ? (
          windows ? (
            <>
              <span className="text-panel-foreground">{yearsText(value)}</span> against the years before, {yearsText(windows.baseline)}.
            </>
          ) : (
            <>There is no earlier record to compare {yearsText(value)} with: choose later years, or a longer span.</>
          )
        ) : (
          <>
            <span className="text-panel-foreground">
              {yearsText(value)} · {value[1] - value[0] + 1} years.
            </span>{" "}
            Every year is tested for a trend; the change compares {yearsText(windows!.baseline)} with {yearsText(windows!.recent)} (the solid parts).
          </>
        )}
      </p>
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
    : "Each measure's own season";
  return (
    <Field number={4} label="Months compared" htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = event.target.value as (typeof SEASON_CHOICES)[number];
          if (next === "custom") onEdit({ months: picking.length ? picking : [6, 7, 8] });
          else onEdit({ season: next === "usual" ? null : next });
        }}
        className="field"
      >
        {SEASON_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {choice === "usual" ? "Usual season of each measure" : choice === "custom" ? "Choose months…" : SEASONS[choice].label}
          </option>
        ))}
      </select>
      {value === "usual" && <p className="text-xs leading-relaxed text-panel-muted">{usual}. Seasons flip south of the equator.</p>}
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
    <div className="contents">
      <div {...demoAttr("form")} className="space-y-4">
        <Field number={1} label="What to measure">
          <MeasurePicker query={query} onEdit={onEdit} />
        </Field>
        <div className="border-t border-panel-line pt-4">{where}</div>
        <PeriodField time={query.time} first={years.first} last={years.last} indicators={query.indicators} onEdit={onEdit} />
        <MonthsField query={query} onEdit={onEdit} />
      </div>
      {/* Always in reach, however long the list of measures. */}
      <div {...demoAttr("find")} className="sticky bottom-0 z-10 -mx-6 mt-5 border-t border-panel-line bg-panel px-6 pb-4 pt-3.5">
        <button type="button" onClick={onRun} disabled={!ready || (!dirty && current)} className="btn-solid group w-full">
          {busy && !dirty && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Find changes
          {!(busy && !dirty) && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />}
        </button>
        <p className="mt-2 text-center text-[11px] leading-snug text-panel-muted" aria-live="polite">
          {!ready ? "Pick at least one measure." : dirty ? (estimate ?? "Your choices have changed: find changes to update the results.") : busy ? "Scanning…" : "The results match these choices."}
        </p>
      </div>
    </div>
  );
}
