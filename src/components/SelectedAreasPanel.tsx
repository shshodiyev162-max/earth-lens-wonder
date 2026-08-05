import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Square, Trash2, TrendingUp, X } from "lucide-react";
import { useRegion, type SelectedArea } from "@/context/RegionContext";

export default function SelectedAreasPanel({ onClose }: { onClose?: () => void }) {
  const { selectedAreas, removeSelectedArea, updateSelectedArea, activeAreaId, setActiveAreaId } = useRegion();
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const startEdit = (area: SelectedArea) => {
    setEditingAreaId(area.id);
    setEditingName(area.name);
  };

  const saveEdit = (areaId: string) => {
    if (editingName.trim()) updateSelectedArea(areaId, { name: editingName.trim() });
    setEditingAreaId(null);
    setEditingName("");
  };

  const analyze = (area: SelectedArea) => {
    setActiveAreaId(area.id);
    window.location.href = `/analysis?areaId=${area.id}&areaName=${encodeURIComponent(area.name)}`;
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Square className="h-4 w-4 text-cyan-400" /> Selected areas
        </label>
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">{selectedAreas.length}</span>
          {onClose && (
            <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-white" aria-label="Close areas panel">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-slate-500">
        Use the toolbar at the top-right of the map (<strong className="text-slate-300">✓</strong> icon) to draw polygons, rectangles, circles or markers. Every drawn area is labelled automatically with its estimated values for the active map layers.
      </p>

      {selectedAreas.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-relaxed text-slate-500">
          Draw a shape on the map to create a labelled area for analysis.
        </p>
      ) : (
        <div className="space-y-2">
          {selectedAreas.map((area) => (
            <div
              key={area.id}
              onClick={() => setActiveAreaId(area.id)}
              className={`rounded-xl border p-3 transition-colors cursor-pointer ${
                activeAreaId === area.id ? "border-cyan-400/50 bg-cyan-400/[0.06]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {editingAreaId === area.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-[#07111d] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(area.id)}
                  />
                  <button onClick={() => saveEdit(area.id)} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">Save</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{area.name}</span>
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(area); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white" title="Edit name"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); analyze(area); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-emerald-400" title="Analyze"><TrendingUp className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); removeSelectedArea(area.id); }} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-red-400" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                    <span className="capitalize">{area.type}</span>
                    <span>~{area.areaKm2.toLocaleString()} km²</span>
                    {area.metrics?.slice(0, 3).map((m) => (
                      <span key={m.layerId} className="text-cyan-300" title={m.layerName}>{m.label}: {m.formatted}</span>
                    ))}
                    {area.greeneryIndex !== undefined && (
                      <span className="text-emerald-400">Greenery: {(area.greeneryIndex * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedAreas.length > 0 && (
        <Link to="/analysis" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90">
          <TrendingUp className="h-4 w-4" /> Analyze All Areas
        </Link>
      )}
    </section>
  );
}