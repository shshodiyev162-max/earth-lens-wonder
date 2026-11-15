import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { LayerDateState } from "@/hooks/useLayerDate";
import { isTimeEnabled, periodLabel, type GibsLayer } from "@/lib/gibs/catalog";
import { formatLayerDate, shiftDate, stepForLayer, timeSteps, todayUtc } from "@/lib/gibs/time";
import { cn } from "@/lib/utils";

interface DateControlProps {
  layer: GibsLayer;
  state: LayerDateState;
  /** null = follow the latest available date */
  requested: string | null;
  onChange: (date: string | null) => void;
  label?: string;
  compact?: boolean;
}

function statusText(layer: GibsLayer, state: LayerDateState, requested: string | null): { text: string; tone: "muted" | "info" | "warn" } {
  if (state.loading) return { text: "Checking which dates NASA has published…", tone: "muted" };
  if (state.error) return { text: "Couldn't check availability — showing the most recent likely date.", tone: "warn" };
  if (!state.date) return { text: "", tone: "muted" };
  if (!requested || (state.defaultDate && state.date === state.defaultDate && requested >= state.date)) {
    return { text: `Latest available · ${periodLabel(layer.period).toLowerCase()}`, tone: "muted" };
  }
  const when = (date: string) => formatLayerDate(layer, date);
  const whole = layer.period === "monthly" || layer.period === "yearly";
  switch (state.resolution) {
    case "snapped":
      return {
        text: whole ? `Showing ${when(state.date)}: NASA publishes this layer ${layer.period === "monthly" ? "once a month" : "once a year"}.` : `Showing the ${periodLabel(layer.period).toLowerCase()} that starts ${when(state.date)}.`,
        tone: "info",
      };
    case "latest":
      return { text: `NASA hasn't published ${when(requested)} yet — showing ${when(state.date)}.`, tone: "info" };
    case "earliest":
      return { text: `This product starts ${whole ? "in" : "on"} ${when(state.date)}.`, tone: "info" };
    case "gap":
      return { text: `No imagery for ${when(requested)} (processing gap) — showing ${when(state.date)}.`, tone: "warn" };
    default:
      return { text: periodLabel(layer.period), tone: "muted" };
  }
}

/** Scrubs through a monthly or yearly record; the map follows once the handle is let go. */
function TimeSlider({ layer, steps, current, onChange }: { layer: GibsLayer; steps: string[]; current: string; onChange: (date: string | null) => void }) {
  const unit = layer.period === "yearly" ? 4 : 7;
  const index = Math.max(0, steps.findIndex((step) => step.slice(0, unit) === current.slice(0, unit)));
  const [draft, setDraft] = useState(index);
  useEffect(() => setDraft(index), [index]);
  const commit = () => draft !== index && onChange(draft === steps.length - 1 ? null : steps[draft]);
  return (
    <div className="mt-2.5">
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-panel-muted" aria-hidden>
        <span>{steps[0].slice(0, 4)}</span>
        {draft !== index && <span className="text-panel-foreground">{formatLayerDate(layer, steps[draft])}</span>}
        <span>{steps[steps.length - 1].slice(0, 4)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={draft}
        aria-label={`Scrub through time, ${layer.name}`}
        aria-valuetext={formatLayerDate(layer, steps[draft])}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        onTouchEnd={commit}
        className="mt-1 w-full accent-panel-foreground pointer-coarse:h-8"
      />
    </div>
  );
}

export default function DateControl({ layer, state, requested, onChange, label = "Observation date", compact }: DateControlProps) {
  if (!isTimeEnabled(layer)) {
    return (
      <div>
        {!compact && <DateLabel>{label}</DateLabel>}
        <div className="rounded-md border border-panel-line px-3 py-2.5 text-sm text-panel-muted">Static cloud-free composite</div>
      </div>
    );
  }

  const step = stepForLayer(layer);
  const current = state.date ?? todayUtc();
  const max = state.latest ?? todayUtc();
  const min = state.earliest ?? "2000-01-01";
  const canGoBack = current > min;
  const canGoForward = current < max;
  const status = statusText(layer, state, requested);

  const go = (direction: 1 | -1) => {
    const next = shiftDate(current, step, direction);
    onChange(next > max ? null : next);
  };
  // Monthly and yearly records are picked by month or year, with a slider through the whole record.
  const steps = timeSteps(layer.period, state.earliest, state.latest);
  const inputClass =
    "min-w-0 flex-1 rounded-md border border-panel-line-strong bg-transparent px-2.5 py-2 font-mono text-[13px] tabular-nums text-panel-foreground outline-none focus:border-panel-foreground/70 pointer-coarse:min-h-11";

  return (
    <div>
      {!compact && <DateLabel>{label}</DateLabel>}
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!canGoBack}
          className="rounded-md border border-panel-line-strong px-2 text-panel-soft transition-colors hover:border-panel-foreground/50 hover:text-panel-foreground disabled:opacity-30 pointer-coarse:min-w-11"
          aria-label={`Previous ${layer.period === "daily" ? "day" : "period"}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {layer.period === "monthly" ? (
          <input
            type="month"
            value={current.slice(0, 7)}
            min={min.slice(0, 7)}
            max={max.slice(0, 7)}
            onChange={(event) => event.target.value && onChange(`${event.target.value}-01`)}
            className={inputClass}
            aria-label={`${label} for ${layer.name} (month)`}
          />
        ) : layer.period === "yearly" && steps.length ? (
          <select value={current.slice(0, 4)} onChange={(event) => onChange(`${event.target.value}-01-01`)} className={inputClass} aria-label={`${label} for ${layer.name} (year)`}>
            {steps.map((step) => (
              <option key={step} value={step.slice(0, 4)}>
                {step.slice(0, 4)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="date"
            value={current}
            min={min}
            max={max}
            onChange={(event) => event.target.value && onChange(event.target.value)}
            className={inputClass}
            aria-label={`${label} for ${layer.name}`}
          />
        )}
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canGoForward}
          className="rounded-md border border-panel-line-strong px-2 text-panel-soft transition-colors hover:border-panel-foreground/50 hover:text-panel-foreground disabled:opacity-30 pointer-coarse:min-w-11"
          aria-label={`Next ${layer.period === "daily" ? "day" : "period"}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!requested}
          className="rounded-md border border-panel-line-strong px-2.5 text-xs text-panel-soft transition-colors hover:border-panel-foreground/50 hover:text-panel-foreground disabled:opacity-40"
        >
          Latest
        </button>
      </div>
      {steps.length > 1 && <TimeSlider layer={layer} steps={steps} current={current} onChange={onChange} />}
      {status.text && (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 text-xs leading-relaxed",
            status.tone === "warn" ? "text-tone-warn" : status.tone === "info" ? "text-panel-soft" : "text-panel-muted",
          )}
        >
          {state.loading && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />}
          {status.text}
        </p>
      )}
    </div>
  );
}

function DateLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="field-label mb-2.5 block">{children}</label>
  );
}
