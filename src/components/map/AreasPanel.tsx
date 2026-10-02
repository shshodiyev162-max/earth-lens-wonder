import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Crosshair, Loader2, Pencil, Shapes, Trash2, TrendingUp } from "lucide-react";
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
    return <p className="mt-2 text-[11px] text-slate-500">Switch to a measurable layer (e.g. Vegetation) to read values for this area.</p>;
  }
  if (!state || state.status === "loading") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Measuring {layer.name.toLowerCase()}…
      </p>
    );
  }
  if (state.status === "error") return <p className="mt-2 text-[11px] text-amber-300/90">Couldn't reach NASA GIBS to measure this area.</p>;
  const stats = state.stats as AreaStats;
  if (stats.count === 0) {
    return <p className="mt-2 text-[11px] text-slate-400">No valid {layer.name.toLowerCase()} pixels in this area on this date (cloud, water or no overpass).</p>;
  }
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
      <div className="rounded-lg bg-white/[0.04] px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-slate-500">Mean</div>
        <div className="text-xs font-semibold text-white">{formatValue(stats.mean, layer.unit, layer.decimals)}</div>
      </div>
      <div className="rounded-lg bg-white/[0.04] px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-slate-500">Range</div>
        <div className="text-xs font-semibold text-white">
          {formatValue(stats.p10, undefined, layer.decimals)}–{formatValue(stats.p90, undefined, layer.decimals)}
        </div>
      </div>
      <div className="rounded-lg bg-white/[0.04] px-1.5 py-1.5">
        <div className="text-[9px] uppercase tracking-wide text-slate-500">Measured</div>
        <div className="text-xs font-semibold text-white">{Math.round(stats.coverage * 100)}%</div>
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
    <section className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Shapes className="h-3.5 w-3.5 text-primary" /> Your areas
        </h2>
        {areas.length > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{areas.length}</span>}
      </div>

      {areas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-relaxed text-slate-500">
          Use the draw tools on the map (top right) to outline a field, a city or a whole region — or search a place and save it. Areas are kept on this device.
        </p>
      ) : (
        <ul className="space-y-2">
          {areas.map((area) => {
            const active = area.id === activeAreaId;
            return (
              <li
                key={area.id}
                className={cn("rounded-xl border p-3 transition", active ? "border-emerald-400/40 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03] hover:border-white/20")}
              >
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
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111d] px-2.5 py-1.5 text-sm text-white outline-none focus:border-primary/50"
                      aria-label="Area name"
                    />
                    <button type="submit" className="rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setActiveAreaId(active ? null : area.id)} className="min-w-0 text-left">
                      <span className="block truncate text-sm font-medium text-white">{area.name}</span>
                      <span className="text-[11px] text-slate-500">
                        <span className="capitalize">{area.kind}</span> · {formatArea(area.areaKm2)}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center">
                      <IconButton label="Zoom to area" onClick={() => onZoomTo(area)}>
                        <Crosshair className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label="Rename"
                        onClick={() => {
                          setEditing(area.id);
                          setDraft(area.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Delete area" onClick={() => removeArea(area.id)} danger>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                )}
                {active && layer && <Measurement area={area} layer={layer} date={date} ready={dateReady} />}
                <Link
                  to={analysisHrefForArea(area.id)}
                  className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400/90 to-emerald-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:opacity-90"
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
      className={cn("rounded-md p-1.5 text-slate-500 transition hover:bg-white/10", danger ? "hover:text-red-400" : "hover:text-white")}
    >
      {children}
    </button>
  );
}
