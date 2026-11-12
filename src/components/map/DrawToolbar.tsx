import { Check, Circle, Flag, Hexagon, Square, Undo2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DrawMode } from "./DrawTools";
import { cn } from "@/lib/utils";

const TOOLS: { mode: DrawMode; label: string; icon: typeof Square }[] = [
  { mode: "rectangle", label: "Draw a rectangle", icon: Square },
  { mode: "polygon", label: "Draw a polygon", icon: Hexagon },
  { mode: "circle", label: "Draw a circle", icon: Circle },
  { mode: "country", label: "Pick a country or sea", icon: Flag },
];

const HINTS: Record<DrawMode, string> = {
  rectangle: "Press and drag on the map to draw a rectangle. Esc to cancel.",
  polygon: "Click to add points. Double-click, press Enter or click the first point to finish.",
  circle: "Press at the centre and drag outwards. Esc to cancel.",
  country: "Point at a country or a sea to see its name, then click to select it. You can still drag the map. Esc to cancel.",
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
      <div className="flex flex-col items-end gap-1" role="toolbar" aria-label="Draw an area or pick a country or sea" aria-orientation="vertical">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = mode === tool.mode;
          const label = tool.label;
          return (
            <Tooltip key={tool.mode}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onModeChange(active ? null : tool.mode)}
                  aria-pressed={active}
                  aria-label={label}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border shadow-2xl backdrop-blur-xl transition-colors pointer-coarse:h-11 pointer-coarse:w-11",
                    active ? "border-panel-foreground bg-panel-foreground text-panel" : "border-panel-line bg-panel/80 text-panel-foreground hover:border-panel-foreground/50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
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
        "float-surface pointer-events-auto px-3 py-2.5 text-xs leading-relaxed text-panel-soft",
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
              className="inline-flex items-center gap-1 rounded-full bg-panel-foreground px-2.5 py-1 font-medium text-panel disabled:opacity-40 pointer-coarse:min-h-11"
            >
              <Check className="h-3 w-3" /> Finish ({vertexCount})
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={vertexCount === 0}
              className="inline-flex items-center gap-1 rounded-full border border-panel-line-strong px-2.5 py-1 text-panel-soft disabled:opacity-40 pointer-coarse:min-h-11"
            >
              <Undo2 className="h-3 w-3" /> Undo
            </button>
          </>
        )}
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-full border border-panel-line-strong px-2.5 py-1 text-panel-soft pointer-coarse:min-h-11">
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
