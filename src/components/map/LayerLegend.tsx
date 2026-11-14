import { useEffect, useState } from "react";
import { fetchClassLegend, fetchColorMap, applyTransform, type ClassEntry, type ParsedColorMap } from "@/lib/gibs/colormap";
import type { GibsLayer } from "@/lib/gibs/catalog";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function useColorMap(name: string | undefined) {
  const [state, setState] = useState<{ name: string; colormap: ParsedColorMap | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!name) return;
    let active = true;
    fetchColorMap(name)
      .then((colormap) => active && setState({ name, colormap, error: false }))
      .catch(() => active && setState({ name, colormap: null, error: true }));
    return () => {
      active = false;
    };
  }, [name]);
  return state && state.name === name ? state : null;
}

/** NASA's named categories for a map of kinds (land cover): a colour swatch and a name for each. */
export function ClassLegend({ layer, className }: { layer: GibsLayer; className?: string }) {
  const [state, setState] = useState<{ name: string; entries: ClassEntry[] | null } | null>(null);
  useEffect(() => {
    if (!layer.classes) return;
    let active = true;
    const name = layer.classes;
    fetchClassLegend(name)
      .then((entries) => active && setState({ name, entries }))
      .catch(() => active && setState({ name, entries: null }));
    return () => {
      active = false;
    };
  }, [layer.classes]);
  if (!layer.classes) return null;
  const current = state?.name === layer.classes ? state : null;
  return (
    <div className={className}>
      <h4 className="mb-2 text-xs font-medium text-panel-foreground">What each colour is</h4>
      {current?.entries ? (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-1 text-[11px] leading-snug text-panel-soft sm:grid-cols-2" aria-label={`${layer.name} legend`}>
          {current.entries.map((entry) => (
            <li key={entry.name} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm border border-panel-line-strong" style={{ background: entry.color }} />
              <span>{entry.name}</span>
            </li>
          ))}
        </ul>
      ) : current ? (
        <p className="text-[10px] text-panel-muted">Legend unavailable offline.</p>
      ) : (
        <div className="skeleton h-16 w-full rounded" />
      )}
    </div>
  );
}

function legendLabel(value: number, layer: GibsLayer): string {
  const shown = applyTransform(value, layer.transform);
  const decimals = Math.abs(shown) >= 100 ? 0 : layer.decimals ?? 1;
  return formatNumber(shown, Math.min(decimals, Math.abs(shown) >= 10 ? 1 : decimals));
}

/** Official GIBS colour scale for a science layer, with real values and units. */
export default function LayerLegend({ layer, className, compact }: { layer: GibsLayer; className?: string; compact?: boolean }) {
  const state = useColorMap(layer.colormap);
  if (!layer.colormap) return null;
  const legend = state?.colormap?.legend;
  const unit = layer.unit && layer.unit !== "NDVI" && layer.unit !== "AOD" ? layer.unit : "";

  return (
    <div className={cn(compact ? "" : "float-surface min-w-[200px] p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="truncate text-xs font-medium text-panel-foreground">{layer.name}</h4>
        <span className="shrink-0 font-mono text-[10px] text-panel-muted">{layer.unit}</span>
      </div>
      {legend ? (
        <>
          <div
            className="h-1.5 w-full rounded-full"
            style={{ background: `linear-gradient(to right, ${legend.stops.map((s) => s.color).join(", ")})` }}
          />
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-panel-soft">
            <span>
              {legend.openMin ? "≤ " : ""}
              {legendLabel(legend.min, layer)}
              {unit ? ` ${unit}` : ""}
            </span>
            <span>
              {legend.openMax ? "≥ " : ""}
              {legendLabel(legend.max, layer)}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        </>
      ) : state?.error ? (
        <p className="text-[10px] text-panel-muted">Legend unavailable offline.</p>
      ) : (
        <div className="skeleton h-1.5 w-full rounded-full" />
      )}
    </div>
  );
}
