import { Loader2, Plus, Sparkles, Trees } from "lucide-react";
import { demoAttr } from "@/lib/demo/scripts";
import { INDICATORS, type IndicatorId } from "@/lib/query/indicators";
import { COVER_COLOR, COVER_GROUPS, COVER_LABEL, coverChanges, describeCover, type LandCover, type Suggestion } from "@/lib/trends/landcover";
import { cn } from "@/lib/utils";

interface AreaCoverCardProps {
  /** "Uzbekistan" */
  name: string;
  status: "idle" | "loading" | "done" | "error";
  cover: LandCover | null;
  first: LandCover | null;
  suggestions: Suggestion[];
  /** Measures in the search now. */
  selected: IndicatorId[];
  onAdd: (indicator: IndicatorId) => void;
  onUseAll: (indicators: IndicatorId[]) => void;
}

const pct = (share: number) => (share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`);

/** What the place is like (NASA land cover) and the measures that suit it. */
export default function AreaCoverCard({ name, status, cover, first, suggestions, selected, onAdd, onUseAll }: AreaCoverCardProps) {
  if (status === "idle") return null;
  const groups = cover ? COVER_GROUPS.filter((g) => cover.shares[g] > 0.004).sort((a, b) => cover.shares[b] - cover.shares[a]) : [];
  const changes = cover && first ? coverChanges(first, cover).slice(0, 3) : [];
  const allChosen = suggestions.length > 0 && suggestions.every((s) => selected.includes(s.indicator)) && selected.length === suggestions.length;

  return (
    <section {...demoAttr("cover")} aria-labelledby="area-cover-title" className="space-y-3 rounded-xl border border-panel-line bg-panel-tint p-3">
      <div>
        <h3 id="area-cover-title" className="flex items-center gap-1.5 text-xs font-semibold text-panel-foreground">
          <Trees className="h-3.5 w-3.5 text-accent-cyan" aria-hidden /> What <span translate="no">{name}</span> is like
        </h3>
        <p className="text-[11px] text-panel-muted">{cover ? `NASA MODIS land cover, ${cover.year}` : "NASA MODIS land cover"}</p>
      </div>

      {status === "loading" && (
        <p role="status" className="flex items-center gap-2 text-xs text-panel-soft">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan" aria-hidden /> Reading NASA's land cover map…
        </p>
      )}
      {status === "error" && <p className="text-xs text-panel-muted">NASA's land cover map couldn't be read just now, so there are no suggestions for this place.</p>}

      {cover && cover.totalKm2 > 0 && (
        <>
          <p className="text-xs leading-relaxed text-panel-soft">{describeCover(cover)}</p>
          <div className="flex h-2.5 overflow-hidden rounded-full border border-panel-line" aria-hidden>
            {groups.map((g) => (
              <div key={g} style={{ width: `${cover.shares[g] * 100}%`, background: COVER_COLOR[g] }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-panel-muted">
            {groups.slice(0, 6).map((g) => (
              <li key={g} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-sm border border-panel-line" style={{ background: COVER_COLOR[g] }} aria-hidden />
                <span className="truncate">{COVER_LABEL[g]}</span>
                <span className="ml-auto text-panel-soft">{pct(cover.shares[g])}</span>
              </li>
            ))}
          </ul>
          {changes.length > 0 && first && (
            <p className="text-[11px] leading-relaxed text-panel-muted">
              Since {first.year}: {changes.map((c) => `${COVER_LABEL[c.group].toLowerCase()} ${pct(c.from)} → ${pct(c.to)}`).join("; ")}. Land cover is classified by computer, so
              small shifts can be noise.
            </p>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-panel-muted">Good measures to check here</p>
              <ul className="space-y-1">
                {suggestions.map((s) => {
                  const on = selected.includes(s.indicator);
                  return (
                    <li key={s.indicator} className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onAdd(s.indicator)}
                        disabled={on}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium pointer-coarse:min-h-11",
                          on ? "border-cyan-400/60 bg-cyan-400/15 text-accent-cyan-soft" : "border-panel-line bg-panel text-panel-soft hover:text-panel-foreground",
                        )}
                      >
                        {!on && <Plus className="h-3 w-3" aria-hidden />}
                        {INDICATORS[s.indicator].label}
                      </button>
                      <span className="pt-0.5 text-[11px] leading-snug text-panel-muted">{s.reason}</span>
                    </li>
                  );
                })}
              </ul>
              {!allChosen && (
                <button
                  type="button"
                  onClick={() => onUseAll(suggestions.map((s) => s.indicator))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-panel-line bg-panel px-3 py-1.5 text-xs font-semibold text-panel-foreground hover:border-cyan-400/50 pointer-coarse:min-h-11"
                >
                  <Sparkles className="h-3.5 w-3.5 text-accent-cyan" aria-hidden /> Use these {suggestions.length}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {cover && cover.totalKm2 === 0 && <p className="text-xs text-panel-muted">NASA's land cover map has no classified pixels here.</p>}
    </section>
  );
}
