import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { INDICATOR_ORDER, INDICATORS, monthsLabel, SEASONS, type Direction, type SeasonId } from "@/lib/query/indicators";
import type { TimeSpec } from "@/lib/query/parse";
import type { PeriodPlan } from "@/lib/query/period";
import { directionLabel, periodLabel, type QueryEdit, type TrendQuery } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Chip({ label, value, children }: { label: string; value: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value}. Change`}
          className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-accent-cyan-soft transition hover:border-cyan-400/60"
        >
          <span translate="no">{value}</span>
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="z-[1600] w-64 border-panel-line bg-panel-raised p-3 text-panel-foreground shadow-2xl">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-panel-muted">{label}</p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn("w-full rounded-lg px-3 py-2 text-left text-sm transition", selected ? "bg-cyan-400/15 text-accent-cyan-soft" : "text-panel-soft hover:bg-panel-tint-strong")}
    >
      {children}
    </button>
  );
}

const yearInput = "w-20 rounded-md border border-panel-line bg-panel-tint px-2 py-1.5 text-sm text-panel-foreground";

function PeriodEditor({ time, onApply, first, last }: { time: TimeSpec; onApply: (time: TimeSpec) => void; first: number; last: number }) {
  const [kind, setKind] = useState<TimeSpec["kind"]>(time.kind === "year" ? "range" : time.kind);
  const [a, setA] = useState(() => (time.kind === "since" ? time.start : time.kind === "range" ? time.start : time.kind === "versus" ? time.baseline : time.kind === "year" ? time.year : last - 9));
  const [b, setB] = useState(() => (time.kind === "range" ? time.end : time.kind === "versus" ? time.recent : time.kind === "year" ? time.year : last));
  const [years, setYears] = useState(time.kind === "last" ? time.years : 10);
  const clampYear = (y: number) => Math.min(last, Math.max(first, Math.round(y) || first));
  const apply = () => {
    if (kind === "last") onApply({ kind: "last", years: Math.max(2, Math.min(40, years)) });
    else if (kind === "since") onApply({ kind: "since", start: clampYear(a) });
    else if (kind === "range") onApply({ kind: "range", start: Math.min(clampYear(a), clampYear(b)), end: Math.max(clampYear(a), clampYear(b)) });
    else if (kind === "versus") onApply({ kind: "versus", baseline: Math.min(clampYear(a), clampYear(b)), recent: Math.max(clampYear(a), clampYear(b)) });
    else onApply({ kind: "default" });
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-1" role="radiogroup" aria-label="Kind of period">
        <Option selected={kind === "last"} onClick={() => setKind("last")}>
          The last … years
        </Option>
        <Option selected={kind === "since"} onClick={() => setKind("since")}>
          Since a year
        </Option>
        <Option selected={kind === "range"} onClick={() => setKind("range")}>
          Between two years
        </Option>
        <Option selected={kind === "versus"} onClick={() => setKind("versus")}>
          Compare two years
        </Option>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-panel-muted">
        {kind === "last" && (
          <label className="flex items-center gap-2">
            Years
            <input type="number" min={2} max={40} value={years} onChange={(event) => setYears(Number(event.target.value))} className={yearInput} />
          </label>
        )}
        {kind !== "last" && kind !== "default" && (
          <>
            <label className="flex items-center gap-2">
              {kind === "since" ? "From" : kind === "versus" ? "Then" : "From"}
              <input type="number" min={first} max={last} value={a} onChange={(event) => setA(Number(event.target.value))} className={yearInput} />
            </label>
            {kind !== "since" && (
              <label className="flex items-center gap-2">
                {kind === "versus" ? "Now" : "To"}
                <input type="number" min={first} max={last} value={b} onChange={(event) => setB(Number(event.target.value))} className={yearInput} />
              </label>
            )}
          </>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-panel-muted">
        Complete seasons available: {first}–{last}.
      </p>
      <button type="button" onClick={apply} className="w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
        Apply
      </button>
    </div>
  );
}

function SeasonEditor({ season, months, onApply }: { season: TrendQuery["season"]; months: number[]; onApply: (edit: QueryEdit) => void }) {
  const [chosen, setChosen] = useState<number[]>(months);
  useEffect(() => setChosen(months), [months]);
  const presets: (Exclude<SeasonId, "custom"> | null)[] = [null, "all", "growing", "summer", "winter", "spring", "autumn", "cold"];
  return (
    <div className="space-y-3">
      <div className="grid gap-1" role="radiogroup" aria-label="Season">
        {presets.map((id) => (
          <Option key={id ?? "usual"} selected={season === id} onClick={() => onApply({ season: id, months: null })}>
            {id ? SEASONS[id].label : "Usual season for this indicator"}
          </Option>
        ))}
      </div>
      <div>
        <p className="mb-1.5 text-[11px] text-panel-muted">Or choose months</p>
        <div className="grid grid-cols-6 gap-1" role="group" aria-label="Months">
          {MONTH_ABBR.map((name, i) => {
            const on = chosen.includes(i + 1);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setChosen((current) => (on ? current.filter((m) => m !== i + 1) : [...current, i + 1]))}
                className={cn("rounded-md px-1 py-1.5 text-[11px] font-medium", on ? "bg-cyan-400/20 text-accent-cyan-soft" : "bg-panel-tint text-panel-muted hover:text-panel-foreground")}
              >
                {name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!chosen.length}
          onClick={() => onApply({ months: [...chosen].sort((x, y) => x - y), season: null })}
          className="mt-2 w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
        >
          Use {chosen.length ? monthsLabel([...chosen].sort((x, y) => x - y)) : "these months"}
        </button>
      </div>
    </div>
  );
}

function PlaceEditor({ place, onApply }: { place: string | null; onApply: (place: string | null) => void }) {
  const [text, setText] = useState(place ?? "");
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(text.trim() || null);
      }}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Country, region or city"
        aria-label="Place to scan"
        className="w-full rounded-md border border-panel-line bg-panel-tint px-3 py-2 text-sm text-panel-foreground outline-none placeholder:text-panel-muted focus:border-cyan-400/60"
      />
      <div className="flex gap-2">
        <button type="submit" className="flex-1 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
          Apply
        </button>
        <button type="button" onClick={() => onApply(null)} className="rounded-lg bg-panel-tint-strong px-3 py-2 text-sm text-panel-soft hover:text-panel-foreground">
          Map view
        </button>
      </div>
    </form>
  );
}

interface QueryChipsProps {
  query: TrendQuery;
  areaName: string | null;
  plan: PeriodPlan | null;
  months: number[];
  years: { first: number; last: number } | null;
  onEdit: (edit: QueryEdit) => void;
}

/** The question as the app understood it — each part can be changed. */
export default function QueryChips({ query, areaName, plan, months, years, onEdit }: QueryChipsProps) {
  const directions: Direction[] = ["decline", "increase", "any"];
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="How the question was understood">
      <Chip label="Indicator" value={INDICATORS[query.indicator].label}>
        {(close) => (
          <div className="grid gap-1" role="radiogroup" aria-label="Indicator">
            {INDICATOR_ORDER.map((id) => (
              <Option
                key={id}
                selected={query.indicator === id}
                onClick={() => {
                  onEdit({ indicator: id, season: null, months: null });
                  close();
                }}
              >
                {INDICATORS[id].label}
                <span className="block text-[11px] text-panel-muted">{INDICATORS[id].product}</span>
              </Option>
            ))}
          </div>
        )}
      </Chip>
      <Chip label="Direction" value={directionLabel(query.direction)}>
        {(close) => (
          <div className="grid gap-1" role="radiogroup" aria-label="Direction">
            {directions.map((d) => (
              <Option
                key={d}
                selected={query.direction === d}
                onClick={() => {
                  onEdit({ direction: d });
                  close();
                }}
              >
                {directionLabel(d)}
              </Option>
            ))}
          </div>
        )}
      </Chip>
      <Chip label="Place" value={areaName ?? query.place ?? "Map view"}>
        {(close) => (
          <PlaceEditor
            place={query.place}
            onApply={(place) => {
              onEdit({ place });
              close();
            }}
          />
        )}
      </Chip>
      <Chip label="Period" value={plan ? periodLabel(plan) : "Last 10 years"}>
        {(close) => (
          <PeriodEditor
            time={query.time}
            first={years?.first ?? 2001}
            last={years?.last ?? new Date().getFullYear() - 1}
            onApply={(time) => {
              onEdit({ time });
              close();
            }}
          />
        )}
      </Chip>
      <Chip label="Months compared" value={monthsLabel(months)}>
        {(close) => (
          <SeasonEditor
            season={query.months ? null : query.season}
            months={months}
            onApply={(edit) => {
              onEdit(edit);
              close();
            }}
          />
        )}
      </Chip>
    </div>
  );
}
