import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { LayerDateState } from "@/hooks/useLayerDate";
import { isTimeEnabled, periodLabel, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate, shiftDate, stepForLayer, todayUtc } from "@/lib/gibs/time";
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
  switch (state.resolution) {
    case "snapped":
      return { text: `Showing the ${periodLabel(layer.period).toLowerCase()} that starts ${formatDate(state.date)}.`, tone: "info" };
    case "latest":
      return { text: `NASA hasn't published ${formatDate(requested)} yet — showing ${formatDate(state.date)}.`, tone: "info" };
    case "earliest":
      return { text: `This product starts on ${formatDate(state.date)}.`, tone: "info" };
    case "gap":
      return { text: `No imagery on ${formatDate(requested)} (processing gap) — showing ${formatDate(state.date)}.`, tone: "warn" };
    default:
      return { text: periodLabel(layer.period), tone: "muted" };
  }
}

export default function DateControl({ layer, state, requested, onChange, label = "Date", compact }: DateControlProps) {
  if (!isTimeEnabled(layer)) {
    return (
      <div>
        {!compact && <DateLabel>{label}</DateLabel>}
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-slate-400">Static composite — no date to choose</div>
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

  return (
    <div>
      {!compact && <DateLabel>{label}</DateLabel>}
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!canGoBack}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-slate-300 transition hover:border-primary/40 hover:text-white disabled:opacity-30"
          aria-label={`Previous ${layer.period === "daily" ? "day" : "period"}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={current}
          min={min}
          max={max}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-primary/50"
          aria-label={`${label} for ${layer.name}`}
        />
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canGoForward}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-slate-300 transition hover:border-primary/40 hover:text-white disabled:opacity-30"
          aria-label={`Next ${layer.period === "daily" ? "day" : "period"}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!requested}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-primary/40 hover:text-white disabled:opacity-40"
        >
          Latest
        </button>
      </div>
      {status.text && (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 text-xs leading-relaxed",
            status.tone === "warn" ? "text-amber-300/90" : status.tone === "info" ? "text-cyan-200/80" : "text-slate-500",
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
    <label className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      <CalendarDays className="h-3.5 w-3.5 text-primary" /> {children}
    </label>
  );
}
