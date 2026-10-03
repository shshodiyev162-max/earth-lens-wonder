import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crosshair, Pencil, Square, Trash2, TrendingUp } from "lucide-react";
import { useWorkspace, type SavedArea } from "@/context/WorkspaceContext";
import { isAbortError } from "@/lib/async";
import { isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { sampleArea, type AreaStats } from "@/lib/gibs/sample";
import { formatArea } from "@/lib/geo/geometry";
import { formatValue } from "@/lib/format";
import { analysisHrefForArea } from "@/lib/links";
import { cn } from "@/lib/utils";

const statsCache = new Map<string, AreaStats>();

function useAreaMeasurement(area: SavedArea | null, layer: GibsLayer | null, date: string | null, ready: boolean) {
  const key = area && layer ? `${area.id}|${layer.id}|${date ?? "static"}` : null;
  const [state, setState] = useState<{ key: string; status: "loading" | "done" | "error"; stats?: AreaStats } | null>(null);

  useEffect(() => {
    if (!key || !area || !layer || !ready || !isScienceLayer(layer)) return;
    const cached = statsCache.get(key);
    if (cached) {
      setState({ key, status: "done", stats: cached });
      return;
    }
    const controller = new AbortController();
    setState({ key, status: "loading" });
    sampleArea({ layer, geometry: area.geometry, date, signal: controller.signal })
      .then((stats) => {
        statsCache.set(key, stats);
        setState({ key, status: "done", stats });
      })
      .catch((error) => {
        if (!isAbortError(error)) setState({ key, status: "error" });
      });
    return () => controller.abort();
  }, [key, area, layer, date, ready]);

  return state && state.key === key ? state : null;
}

function Measurement({ area, layer, date, ready }: { area: SavedArea; layer: GibsLayer; date: string | null; ready: boolean }) {
  const state = useAreaMeasurement(area, layer, date, ready);
  if (!isScienceLayer(layer)) {
    return <p className="mt-2 text-[11px] text-panel-muted">Switch to a measurable layer (e.g. Vegetation) to read values for this area.</p>;
  }
  if (!state || state.status === "loading") {
    return (
      <div role="status" aria-label={`Measuring ${layer.name.toLowerCase()}`} className="mt-2 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((cell) => (
          <div key={cell} className="space-y-1.5 rounded-lg bg-panel-tint px-1.5 py-2">
            <div className="skeleton mx-auto h-2 w-8" />
            <div className="skeleton mx-auto h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }
  if (state.status === "error") return <p className="mt-2 text-[11px] text-tone-warn">Couldn't reach NASA GIBS to measure this area.</p>;
  const stats = state.stats as AreaStats;
  if (stats.count === 0) {
    return <p className="mt-2 text-[11px] text-panel-muted">No valid {layer.name.toLowerCase()} pixels in this area on this date (cloud, water or no overpass).</p>;
  }
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
      <div className="rounded-lg bg-panel-tint px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-panel-muted">Mean</div>
        <div className="text-xs font-semibold text-panel-foreground">{formatValue(stats.mean, layer.unit, layer.decimals)}</div>
      </div>
      <div className="rounded-lg bg-panel-tint px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-panel-muted">Range</div>
        <div className="text-xs font-semibold text-panel-foreground">
          {formatValue(stats.p10, undefined, layer.decimals)}–{formatValue(stats.p90, undefined, layer.decimals)}
        </div>
      </div>
      <div className="rounded-lg bg-panel-tint px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-panel-muted">Measured</div>
        <div className="text-xs font-semibold text-panel-foreground">{Math.round(stats.coverage * 100)}%</div>
      </div>
    </div>
  );
}

interface AreasPanelProps {
  layer: GibsLayer | null;
  date: string | null;
  dateReady: boolean;
  onZoomTo: (area: SavedArea) => void;
  className?: string;
}

/** Saved areas with real, on-demand measurements of the active layer. */
export default function AreasPanel({ layer, date, dateReady, onZoomTo, className }: AreasPanelProps) {
  const { areas, activeAreaId, setActiveAreaId, renameArea, removeArea } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const save = (id: string) => {
    renameArea(id, draft);
    setEditing(null);
  };

  return (
    <section className={cn("mb-5", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-panel-muted">
          <Square className="h-4 w-4 text-accent-cyan" /> Selected areas
        </h2>
        <span className="rounded bg-panel-tint-strong px-1.5 py-0.5 text-[10px] font-mono text-panel-muted">{areas.length}</span>
      </div>

      <p className="mb-3 rounded-xl border border-panel-line bg-panel-tint p-3 text-xs leading-relaxed text-panel-muted">
        Use the draw tools at the top-right of the map to outline a rectangle, polygon or circle. Each area shows its size and real values for the active layer, and can be sent to analysis.
      </p>

      {areas.length === 0 ? (
        <p className="rounded-xl border border-panel-line bg-panel-tint p-4 text-xs leading-relaxed text-panel-muted">
          No areas yet. Draw a shape on the map — or search a place and save it — to create an area for analysis. Areas are kept on this device.
        </p>
      ) : (
        <ul className="space-y-2">
          {areas.map((area) => {
            const active = area.id === activeAreaId;
            return (
              <li key={area.id} className={cn("rounded-xl border p-3 transition-colors", active ? "border-cyan-400/50 bg-cyan-400/[0.06]" : "border-panel-line bg-panel-tint")}>
                {editing === area.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      save(area.id);
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      autoFocus
                      onBlur={() => save(area.id)}
                      onKeyDown={(event) => event.key === "Escape" && setEditing(null)}
                      className="min-w-0 flex-1 rounded-lg border border-panel-line bg-panel px-3 py-2 text-sm text-panel-foreground outline-none focus:border-cyan-400/50"
                      aria-label="Area name"
                    />
                    <button type="submit" className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setActiveAreaId(active ? null : area.id)} className="min-w-0 truncate text-left text-sm font-medium text-panel-foreground" translate="no">
                        {area.name}
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <IconButton label="Zoom to area" onClick={() => onZoomTo(area)}>
                          <Crosshair className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Edit name"
                          onClick={() => {
                            setEditing(area.id);
                            setDraft(area.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label="Remove" onClick={() => removeArea(area.id)} danger>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-panel-muted">
                      <span className="capitalize">{area.kind}</span>
                      <span>{formatArea(area.areaKm2)}</span>
                    </div>
                  </>
                )}
                {active && layer && <Measurement area={area} layer={layer} date={date} ready={dateReady} />}
                <Link
                  to={analysisHrefForArea(area.id)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:opacity-90"
                >
                  <TrendingUp className="h-3.5 w-3.5" /> Analyze with NASA data
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn("rounded-lg p-1.5 text-panel-muted transition hover:bg-panel-tint-strong", danger ? "hover:text-tone-bad" : "hover:text-panel-foreground")}
    >
      {children}
    </button>
  );
}
