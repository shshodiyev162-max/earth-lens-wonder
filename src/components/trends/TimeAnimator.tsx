import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Frame, FrameMode } from "@/hooks/useFrames";
import { cn } from "@/lib/utils";

interface TimeAnimatorProps {
  frames: Frame[];
  index: number;
  onIndex: (index: number) => void;
  mode: FrameMode;
  onMode: (mode: FrameMode) => void;
  seasonLabel: string;
}

/** Play / pause, a frame slider and yearly or monthly frames. */
export default function TimeAnimator({ frames, index, onIndex, mode, onMode, seasonLabel }: TimeAnimatorProps) {
  const [playing, setPlaying] = useState(false);
  const count = frames.length;

  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = window.setInterval(() => onIndex((index + 1) % count), mode === "yearly" ? 900 : 450);
    return () => window.clearInterval(timer);
  }, [playing, count, index, mode, onIndex]);

  useEffect(() => {
    if (index >= count && count) onIndex(count - 1);
  }, [index, count, onIndex]);

  const current = frames[Math.min(index, count - 1)];
  return (
    <div className="pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-2 rounded-2xl border border-panel-line bg-panel/90 px-3 py-2 text-panel-foreground shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        disabled={count < 2}
        aria-label={playing ? "Pause the animation" : "Play the animation"}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <label className="flex min-w-[8rem] flex-1 items-center gap-2">
        <span className="sr-only">Frame</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          value={Math.min(index, Math.max(0, count - 1))}
          onChange={(event) => {
            setPlaying(false);
            onIndex(Number(event.target.value));
          }}
          aria-valuetext={current?.label}
          className="h-6 w-full cursor-pointer accent-cyan-400"
        />
      </label>
      <span className="min-w-[4.5rem] text-center text-xs font-semibold tabular-nums" aria-live="off">
        {current?.label ?? "…"}
      </span>
      <div className="flex rounded-full bg-panel-tint p-0.5 text-[11px]" role="radiogroup" aria-label="Frames">
        {(["yearly", "monthly"] as FrameMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setPlaying(false);
              onIndex(0);
              onMode(m);
            }}
            className={cn("rounded-full px-2.5 py-1 font-medium", mode === m ? "bg-cyan-400/20 text-accent-cyan-soft" : "text-panel-muted hover:text-panel-foreground")}
          >
            {m === "yearly" ? "Yearly" : "Monthly"}
          </button>
        ))}
      </div>
      <p className="w-full text-[11px] text-panel-muted">{mode === "yearly" ? `Each frame: the ${seasonLabel} average of one year.` : "Each frame: one monthly NASA map."}</p>
    </div>
  );
}
