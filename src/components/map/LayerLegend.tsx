import { useEffect, useState } from "react";
import { fetchColorMap, applyTransform, type ParsedColorMap } from "@/lib/gibs/colormap";
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
    <div className={cn(compact ? "" : "glass-strong rounded-xl p-4 min-w-[180px]", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="truncate text-xs font-display font-semibold text-foreground">{layer.name}</h4>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{layer.unit}</span>
      </div>
      {legend ? (
        <>
          <div
            className="h-3 w-full rounded-md"
            style={{ background: `linear-gradient(to right, ${legend.stops.map((s) => s.color).join(", ")})` }}
          />
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
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
        <p className="text-[10px] text-muted-foreground">Legend unavailable offline.</p>
      ) : (
        <div className="skeleton h-3 w-full rounded-md" />
      )}
    </div>
  );
}
