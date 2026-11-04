import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, PlayCircle, X } from "lucide-react";
import { DEMOS, type DemoAction, type DemoScript, type DemoTarget, type DemoWait } from "@/lib/demo/scripts";
import { cn } from "@/lib/utils";

export interface DemoControls {
  act: (action: DemoAction) => void;
  ready: (wait: DemoWait) => boolean;
  setPanel: (open: boolean) => void;
}

interface DemoPlayerProps {
  /** null shows the list of demos to choose from. */
  script: DemoScript | null;
  /** Read on every check, so it always sees the page's latest state. */
  controls: () => DemoControls;
  onChoose: (id: string) => void;
  onClose: () => void;
  /** Seconds a step stays up when playing (more for longer captions). */
  pace?: number;
}

const find = (target: DemoTarget | undefined) => (target ? document.querySelector<HTMLElement>(`[data-demo="${target}"]`) : null);

/** A ring around the element a step talks about, kept in place while the page scrolls or moves. */
function Spotlight({ target }: { target: DemoTarget | undefined }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const element = find(target);
      const next = element && element.offsetParent !== null ? element.getBoundingClientRect() : null;
      setRect((current) => (current && next && current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height ? current : next));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target]);
  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[2050] rounded-xl border-2 border-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.25)] transition-all duration-300"
      style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
    />
  );
}

/** Plays a worked example step by step: Back / Next, or Play to let it run. Esc leaves. */
export default function DemoPlayer({ script, controls, onChoose, onClose, pace = 4 }: DemoPlayerProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const direction = useRef(1);
  const card = useRef<HTMLDivElement>(null);
  const steps = script?.steps ?? [];
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    setIndex(0);
    setPlaying(true);
    direction.current = 1;
  }, [script]);

  useEffect(() => card.current?.focus(), [script]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const go = useCallback(
    (delta: number) => {
      direction.current = delta;
      setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta)));
    },
    [steps.length],
  );

  // Show the step: open or close the side panel, do its action, then wait for NASA data if needed.
  useEffect(() => {
    if (!step) return;
    const api = controls();
    api.setPanel(step.panel !== "closed");
    if (step.action && direction.current > 0) api.act(step.action);
    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    later(() => !cancelled && find(step.target)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
    if (step.optional) {
      // Data decides whether this part exists (e.g. the "every year" hint): skip it if not.
      later(() => !cancelled && !find(step.target) && go(direction.current), 1500);
    }
    if (step.waitFor) {
      setWaiting(true);
      const check = () => {
        if (cancelled) return;
        if (controls().ready(step.waitFor as DemoWait)) setWaiting(false);
        else later(check, 500);
      };
      later(check, 600);
    } else setWaiting(false);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Playing: move on after time to read the caption (and once any data has arrived).
  useEffect(() => {
    if (!playing || waiting || !step || last) return;
    const timer = window.setTimeout(() => go(1), (pace + step.caption.length / 45) * 1000);
    return () => window.clearTimeout(timer);
  }, [playing, waiting, step, last, go, pace]);

  const shell = "pointer-events-auto fixed bottom-24 left-3 z-[2100] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-panel-line bg-panel/95 p-4 text-panel-foreground shadow-2xl backdrop-blur-xl lg:bottom-auto lg:left-auto lg:right-16 lg:top-28";
  const button = "inline-flex items-center justify-center gap-1 rounded-lg border border-panel-line bg-panel-tint px-2.5 py-1.5 text-xs font-medium text-panel-soft hover:text-panel-foreground disabled:opacity-40 pointer-coarse:min-h-11";

  if (!script) {
    return (
      <div ref={card} tabIndex={-1} role="dialog" aria-label="Choose a demo" className={shell}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-cyan">Watch a demo</p>
            <p className="text-sm font-semibold">Three worked examples with real NASA data</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close the demo" className="rounded-lg p-1.5 text-panel-muted hover:text-panel-foreground pointer-coarse:p-2.5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {DEMOS.map((demo) => (
            <li key={demo.id}>
              <button type="button" onClick={() => onChoose(demo.id)} className="flex w-full items-start gap-2 rounded-xl border border-panel-line bg-panel-tint p-3 text-left hover:border-cyan-400/50">
                <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" aria-hidden />
                <span>
                  <span className="block text-sm font-medium">{demo.title}</span>
                  <span className="block text-[11px] leading-relaxed text-panel-muted">{demo.summary}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <Spotlight target={step?.target} />
      <div ref={card} tabIndex={-1} role="dialog" aria-label={`Demo: ${script.title}`} className={shell}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-cyan">
              Demo · step {index + 1} of {steps.length}
            </p>
            <p className="text-sm font-semibold leading-snug">{script.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close the demo" className="rounded-lg p-1.5 text-panel-muted hover:text-panel-foreground pointer-coarse:p-2.5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p aria-live="polite" className="min-h-[4.5rem] text-xs leading-relaxed text-panel-soft">
          {step?.caption}
        </p>
        {waiting && (
          <p role="status" className="mt-2 flex items-center gap-2 text-[11px] text-panel-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan" aria-hidden /> Waiting for NASA's maps…
          </p>
        )}
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-cyan-400" : "bg-panel-tint-strong")} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} className={button}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </button>
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} disabled={last} className={button}>
            {playing && !last ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {playing && !last ? "Pause" : "Play"}
          </button>
          {last ? (
            <button type="button" onClick={onClose} className={cn(button, "border-cyan-400/60 bg-cyan-400 text-slate-950 hover:text-slate-950")}>
              Finish
            </button>
          ) : (
            <button type="button" onClick={() => go(1)} disabled={waiting} className={cn(button, "border-cyan-400/60 bg-cyan-400 text-slate-950 hover:text-slate-950")}>
              Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
