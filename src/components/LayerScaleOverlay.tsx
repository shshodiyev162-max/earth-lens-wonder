import { getLayerScale, type MapLayer } from "@/lib/map-layers";

interface LayerScaleOverlayProps {
  layer: MapLayer;
  position?: string;
}

export default function LayerScaleOverlay({ layer, position = "bottom-6 right-4" }: LayerScaleOverlayProps) {
  const scale = getLayerScale(layer);
  if (!scale) return null;

  return (
    <div className={`absolute ${position} z-[1000] glass-strong rounded-xl p-4 min-w-[180px]`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-display font-semibold text-foreground">{scale.name}</h4>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{scale.unit}</span>
      </div>
      <div className="h-3 rounded-md overflow-hidden flex">
        {scale.colors.map((color, index) => (
          <div key={index} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">{scale.values[0]}</span>
        <span className="text-[10px] text-muted-foreground">{scale.values[scale.values.length - 1]}</span>
      </div>
    </div>
  );
}