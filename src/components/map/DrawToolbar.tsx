import { Check, Circle, Flag, Hexagon, Square, Undo2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DrawMode } from "./DrawTools";
import { cn } from "@/lib/utils";

const TOOLS: { mode: DrawMode; label: string; icon: typeof Square }[] = [
  { mode: "rectangle", label: "Draw a rectangle", icon: Square },
  { mode: "polygon", label: "Draw a polygon", icon: Hexagon },
  { mode: "circle", label: "Draw a circle", icon: Circle },
  { mode: "country", label: "Pick a country", icon: Flag },
];

const HINTS: Record<DrawMode, string> = {
  rectangle: "Press and drag on the map to draw a rectangle. Esc to cancel.",
  polygon: "Click to add points. Double-click, press Enter or click the first point to finish.",
  circle: "Press at the centre and drag outwards. Esc to cancel.",
  country: "Point at a country to see its name, then click it to select the whole country. You can still drag the map. Esc to cancel.",
};

interface DrawToolbarProps {
  mode: DrawMode | null;
  onModeChange: (mode: DrawMode | null) => void;
  vertexCount: number;
  onFinish: () => void;
  onUndo: () => void;
  className?: string;
  /** Show the instructions card under the buttons (off for small maps, which render <DrawHint> elsewhere). */
  showHint?: boolean;
}

export default function DrawToolbar({ mode, onModeChange, vertexCount, onFinish, onUndo, className, showHint = true }: DrawToolbarProps) {
  return (
    <div className={cn("pointer-events-auto flex flex-col items-end gap-2", className)}>
      <div className="flex flex-col items-end gap-1" role="toolbar" aria-label="Draw an area or pick a country" aria-orientation="vertical">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = mode === tool.mode;
          return (
            <Tooltip key={tool.mode}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onModeChange(active ? null : tool.mode)}
                  aria-pressed={active}
                  aria-label={tool.label}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border border-primary/90 text-panel-foreground shadow-[0_2px_10px_rgb(0_0_0/0.25)] transition-colors dark:border-[hsl(174_72%_50%/0.9)] dark:shadow-[0_2px_10px_rgb(0_0_0/0.5)]",
                    active
                      ? "bg-primary/20 dark:bg-[hsl(174_72%_30%)]"
                      : "bg-panel/95 hover:bg-primary/15 dark:bg-[hsl(220_20%_12%/0.95)] dark:hover:bg-[hsl(174_72%_30%)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {mode && showHint && (
        <DrawHint mode={mode} vertexCount={vertexCount} onFinish={onFinish} onUndo={onUndo} onCancel={() => onModeChange(null)} className="max-w-[18rem]" />
      )}
    </div>
  );
}

interface DrawHintProps {
  mode: DrawMode;
  vertexCount: number;
  onFinish: () => void;
  onUndo: () => void;
  onCancel: () => void;
  className?: string;
}

/** What to do next while drawing, with Finish / Undo / Cancel. */
export function DrawHint({ mode, vertexCount, onFinish, onUndo, onCancel, className }: DrawHintProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-xl border border-cyan-400/30 bg-panel/95 px-3 py-2.5 text-xs leading-relaxed text-panel-soft shadow-xl backdrop-blur",
        className,
      )}
    >
      <p>{HINTS[mode]}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {mode === "polygon" && (
          <>
            <button
              type="button"
              onClick={onFinish}
              disabled={vertexCount < 3}
              className="inline-flex items-center gap-1 rounded-md bg-cyan-400 px-2 py-1 font-semibold text-slate-950 disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> Finish ({vertexCount})
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={vertexCount === 0}
              className="inline-flex items-center gap-1 rounded-md bg-panel-tint-hover px-2 py-1 text-panel-soft disabled:opacity-40"
            >
              <Undo2 className="h-3 w-3" /> Undo
            </button>
          </>
        )}
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-md bg-panel-tint-hover px-2 py-1 text-panel-soft">
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
