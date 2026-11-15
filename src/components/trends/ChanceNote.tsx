import type { ChanceState } from "@/hooks/useChanceCheck";
import { chanceSummaryText } from "@/lib/trends/chance";
import { cn } from "@/lib/utils";

/** The chance check for the patches listed: running, or its answer in a sentence. */
export default function ChanceNote({ state, className }: { state: ChanceState; className?: string }) {
  if (state.status === "none" || state.status === "error") return null;
  return (
    <p role="status" className={cn("text-xs leading-relaxed text-panel-soft", className)}>
      <span className="font-medium text-panel-foreground">Chance check: </span>
      {state.status === "running"
        ? `shuffling the years and testing every pixel again (${state.done} of ${state.total}), to see whether chance alone makes patches like these.`
        : chanceSummaryText(state.check)}
    </p>
  );
}
