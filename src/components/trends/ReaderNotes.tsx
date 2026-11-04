import { Info, Plus } from "lucide-react";
import { INDICATORS, type IndicatorId } from "@/lib/query/indicators";
import type { ReaderNote } from "@/lib/query/parse";

interface ReaderNotesProps {
  notes: ReaderNote[];
  /** Measures already chosen. */
  chosen: IndicatorId[];
  onAdd: (indicators: IndicatorId[], note: ReaderNote) => void;
}

/** What the question asked for that TerraScope can't measure, and the closest real measures. */
export default function ReaderNotes({ notes, chosen, onAdd }: ReaderNotesProps) {
  if (!notes.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((note) => {
        const offer = note.closest.filter((id) => !chosen.includes(id));
        return (
          <div key={note.id} role="note" className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs leading-relaxed text-panel-soft">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tone-warn" aria-hidden />
              <span>
                <span className="font-medium text-panel-foreground">“{note.phrase}”</span> — {note.message}
              </span>
            </p>
            {note.kind === "unmeasured" && offer.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {offer.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onAdd([id], note)}
                    className="inline-flex items-center gap-1 rounded-full border border-panel-line bg-panel-tint px-2.5 py-1 text-[11px] font-medium text-panel-foreground hover:border-cyan-400/50 pointer-coarse:min-h-11"
                  >
                    <Plus className="h-3 w-3" aria-hidden /> {INDICATORS[id].label}
                  </button>
                ))}
                {offer.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onAdd(offer, note)}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-accent-cyan-soft hover:underline pointer-coarse:min-h-11"
                  >
                    Add all {offer.length}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
