import { useEffect, useState } from "react";
import { clampSpan, timelineTicks } from "@/lib/timeline";
import { cn } from "@/lib/utils";

export interface TimelineMark {
  label: string;
  span: [number, number];
}

interface YearTimelineProps {
  /** The whole track, inclusive. */
  first: number;
  last: number;
  /** The chosen years, inclusive; the same year twice when `single`. */
  value: [number, number];
  onChange: (span: [number, number]) => void;
  /** What the handles are called, for screen readers and the summary ("From", "To"). */
  labels?: [string, string];
  /** One handle: a single year. */
  single?: boolean;
  /** The two handles can't meet: at least this many years apart, counting both (default 1). */
  minYears?: number;
  /** Years drawn solid on the track (for a trend, the years compared). */
  windows?: TimelineMark[];
  /** Records shorter than the track, drawn under it with their name. */
  records?: TimelineMark[];
  className?: string;
}

/** Where a year sits along the track, 0–100. */
function position(year: number, first: number, last: number): number {
  return last === first ? 0 : ((year - first) / (last - first)) * 100;
}

/**
 * A timeline of years with handles to drag: the span chosen is drawn on the track, with the years
 * that matter most (the years compared) solid, and shorter records under it. Each handle is a native
 * slider, so arrows, Page Up/Down, Home and End work, and touch screens get a bigger handle. A change
 * is applied when the handle is let go (or at once from the keyboard), so dragging is smooth.
 */
export default function YearTimeline({ first, last, value, onChange, labels = ["From", "To"], single = false, minYears = 1, windows = [], records = [], className }: YearTimelineProps) {
  const [draft, setDraft] = useState<[number, number]>(value);
  const [from, to] = value;
  // Follows the years chosen (not the array they come in, which may be new on every render).
  useEffect(() => setDraft([from, to]), [from, to]);
  const commit = (next = draft) => {
    if (next[0] !== value[0] || next[1] !== value[1]) onChange(next);
  };
  const move = (which: 0 | 1, year: number) => {
    const next: [number, number] = single ? [year, year] : which === 0 ? [year, draft[1]] : [draft[0], year];
    setDraft(single ? next : clampSpan(next, first, last, minYears, which));
  };
  const at = (year: number) => position(year, first, last);
  const [a, b] = draft;
  // A handle near the far end goes on top, so two handles at the same year can still be pulled apart.
  const startOnTop = a > first + (last - first) / 2;
  const handle = (which: 0 | 1) => (
    <input
      type="range"
      min={first}
      max={last}
      step={1}
      value={draft[which]}
      aria-label={single ? labels[0] : labels[which]}
      aria-valuetext={String(draft[which])}
      onChange={(event) => move(which, Number(event.target.value))}
      onPointerUp={() => commit()}
      onKeyUp={() => commit()}
      onBlur={() => commit()}
      onTouchEnd={() => commit()}
      className="timeline-range absolute inset-0 h-full w-full"
      style={{ zIndex: which === 0 ? (startOnTop ? 3 : 2) : startOnTop ? 2 : 3 }}
    />
  );
  return (
    <div className={cn("timeline select-none", className)}>
      <div className="relative h-8">
        {/* The track is inset by half a handle, so a year lines up with the handle's middle. */}
        <div className="timeline-inset absolute inset-y-0" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-panel-line-strong" />
          {!single && <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-panel-foreground/40" style={{ left: `${at(a)}%`, width: `${at(b) - at(a)}%` }} />}
          {windows.map((mark) => {
            const from = at(Math.max(first, mark.span[0]) - (mark.span[0] === mark.span[1] ? 0.35 : 0));
            const to = at(Math.min(last, mark.span[1]) + (mark.span[0] === mark.span[1] ? 0.35 : 0));
            return <div key={mark.label} className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-panel-foreground" style={{ left: `${from}%`, width: `${Math.max(0.8, to - from)}%` }} />;
          })}
        </div>
        {handle(0)}
        {!single && handle(1)}
      </div>
      <div className="timeline-inset relative h-4 font-mono text-[10px] tabular-nums text-panel-muted" aria-hidden>
        {timelineTicks(first, last).map((year) => (
          <span key={year} className="absolute -translate-x-1/2" style={{ left: `${at(year)}%` }}>
            {year}
          </span>
        ))}
      </div>
      {records.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Records shorter than the timeline">
          {records.map((record) => (
            <li key={record.label} className="timeline-inset relative h-[1.1rem]">
              {/* The name sits above the start of its bar, kept inside the track. */}
              <span className="absolute top-0 whitespace-nowrap text-[10px] leading-none text-panel-muted" style={{ left: `${Math.min(at(record.span[0]), 58)}%` }}>
                {record.label} · {record.span[0]}–{record.span[1]}
              </span>
              <span className="absolute bottom-0 h-0.5 rounded-full bg-panel-soft/70" style={{ left: `${at(record.span[0])}%`, width: `${Math.max(0.8, at(record.span[1]) - at(record.span[0]))}%` }} aria-hidden />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
