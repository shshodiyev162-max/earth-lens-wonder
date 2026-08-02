import type { MapLayer } from "@/lib/map-layers";

interface MapLegendProps {
  layer: MapLayer;
}

export default function MapLegend({ layer }: MapLegendProps) {
  if (!layer.legend) return null;

  return (
    <div className="absolute bottom-6 right-4 z-[1000] glass-strong rounded-xl p-4 min-w-[160px]">
      <h4 className="text-xs font-display font-semibold text-foreground mb-3">{layer.name}</h4>
      <div className="space-y-1.5">
        {layer.legend.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-4 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
