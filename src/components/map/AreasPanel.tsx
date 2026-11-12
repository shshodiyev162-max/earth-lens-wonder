import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Combine, Crosshair, Pencil, Trash2 } from "lucide-react";
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
          <div key={cell} className="space-y-1.5 rounded-lg border border-panel-line px-1.5 py-2">
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
      <div className="rounded-lg border border-panel-line px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-panel-muted">Mean</div>
        <div className="font-mono text-xs tabular-nums text-panel-foreground">{formatValue(stats.mean, layer.unit, layer.decimals)}</div>
      </div>
      <div className="rounded-lg border border-panel-line px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-panel-muted">Range</div>
        <div className="font-mono text-xs tabular-nums text-panel-foreground">
          {formatValue(stats.p10, undefined, layer.decimals)}–{formatValue(stats.p90, undefined, layer.decimals)}
        </div>
      </div>
      <div className="rounded-lg border border-panel-line px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-panel-muted">Measured</div>
        <div className="font-mono text-xs tabular-nums text-panel-foreground">{Math.round(stats.coverage * 100)}%</div>
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

const KIND_LABEL: Record<SavedArea["kind"], string> = { rectangle: "Rectangle", polygon: "Polygon", circle: "Circle", place: "Place", combined: "Combined" };

/** Saved areas with real, on-demand measurements of the active layer. Several can be combined into one. */
export default function AreasPanel({ layer, date, dateReady, onZoomTo, className }: AreasPanelProps) {
  const { areas, activeAreaId, setActiveAreaId, renameArea, removeArea, combineAreas } = useWorkspace();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** The areas ticked to combine (null when not combining). */
  const [ticked, setTicked] = useState<string[] | null>(null);
  const combining = ticked !== null;

  // Fewer than two areas left: nothing to combine.
  useEffect(() => {
    if (areas.length < 2) setTicked(null);
    else setTicked((current) => current?.filter((id) => areas.some((area) => area.id === id)) ?? null);
  }, [areas]);

  const save = (id: string) => {
    renameArea(id, draft);
    setEditing(null);
  };

  const tick = (id: string) => setTicked((current) => (current ? (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]) : current));

  const combine = () => {
    const area = ticked ? combineAreas(ticked) : null;
    setTicked(null);
    if (!area) return;
    toast.success(`${area.name} saved`, {
      description: `${area.parts?.length ?? ticked?.length} areas combined · ${formatArea(area.areaKm2)}`,
      action: { label: "Analyze", onClick: () => navigate(analysisHrefForArea(area.id)) },
    });
  };

  return (
    <section className={cn("mb-6 border-t border-panel-line pt-4", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="field-label">Your areas</h2>
        <div className="flex items-center gap-3">
          {areas.length >= 2 && !combining && (
            <button type="button" onClick={() => setTicked([])} className="link-quiet inline-flex items-center gap-1.5 text-xs pointer-coarse:min-h-11">
              <Combine className="h-3.5 w-3.5" aria-hidden /> Combine
            </button>
          )}
          <span className="font-mono text-[10.5px] tabular-nums text-panel-muted">{areas.length}</span>
        </div>
      </div>

      {combining && (
        <p className="mb-2.5 text-[13px] leading-relaxed text-panel-soft" aria-live="polite">
          Tick the areas to add together. They are saved as one new area, measured and analysed as a whole; the ones you tick stay as they are.
        </p>
      )}

      {areas.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-panel-muted">
          None yet. Use the draw tools on the map to outline a shape, or search a place and save it. Each area shows its size and real values for the layer, and can be sent to analysis. Areas are kept on this device.
        </p>
      ) : (
        <ul className="border-t border-panel-line">
          {areas.map((area) => {
            const active = area.id === activeAreaId;
            if (ticked) {
              const checked = ticked.includes(area.id);
              return (
                <li key={area.id} className="border-b border-panel-line">
                  <label className="flex cursor-pointer items-center gap-2.5 py-3 pointer-coarse:min-h-11">
                    <input type="checkbox" checked={checked} onChange={() => tick(area.id)} className="h-3.5 w-3.5 shrink-0 accent-panel-foreground pointer-coarse:h-5 pointer-coarse:w-5" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-panel-foreground" translate="no">
                      {area.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-panel-muted">{formatArea(area.areaKm2)}</span>
                  </label>
                </li>
              );
            }
            return (
              <li key={area.id} className={cn("border-b border-panel-line py-3 transition-colors", active && "bg-panel-tint")}>
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
                      className="field min-w-0 flex-1"
                      aria-label="Area name"
                    />
                    <button type="submit" className="btn-solid px-3.5 py-2 text-xs">
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
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] tabular-nums text-panel-muted">
                      <span>{KIND_LABEL[area.kind] ?? area.kind}</span>
                      {area.parts && <span>{area.parts.length} areas</span>}
                      <span>{formatArea(area.areaKm2)}</span>
                    </div>
                  </>
                )}
                {active && layer && <Measurement area={area} layer={layer} date={date} ready={dateReady} />}
                <Link to={analysisHrefForArea(area.id)} className="btn-line mt-2.5 w-full">
                  Analyze with NASA data
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {ticked && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={combine} disabled={ticked.length < 2} className="btn-solid">
            <Combine className="h-4 w-4" aria-hidden />
            {ticked.length < 2 ? "Tick two or more" : `Combine ${ticked.length} areas`}
          </button>
          <button type="button" onClick={() => setTicked(null)} className="btn-line">
            Cancel
          </button>
        </div>
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
      className={cn("rounded-full p-1.5 text-panel-muted transition-colors pointer-coarse:p-2.5", danger ? "hover:text-tone-bad" : "hover:text-panel-foreground")}
    >
      {children}
    </button>
  );
}
