import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { isScienceLayer, periodLabel, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate } from "@/lib/gibs/time";
import type { TileStatus } from "./GibsTileLayer";
import LayerLegend from "./LayerLegend";
import { cn } from "@/lib/utils";

/** Description, how-to-read notes and the official legend for a layer. */
export function LayerInfoCard({ layer, className }: { layer: GibsLayer; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-primary/15 bg-primary/[0.05] p-4", className)}>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Info className="h-4 w-4 text-primary" /> {layer.name}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{layer.description}</p>
      {layer.howToRead && <p className="mt-2 text-xs leading-relaxed text-foreground/85">{layer.howToRead}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
        <span className="rounded bg-secondary/60 px-2 py-1 text-foreground/85">{layer.source}</span>
        <span className="rounded bg-secondary/60 px-2 py-1 text-foreground/85">{periodLabel(layer.period)}</span>
        {isScienceLayer(layer) && <span className="rounded bg-earth-green/10 px-2 py-1 text-earth-green">Click map to read values</span>}
      </div>
      {isScienceLayer(layer) && <LayerLegend layer={layer} className="mt-3 border-border/40 bg-background/40 shadow-none" compact />}
    </div>
  );
}

/** Small status chip shown over the map: layer, date and whether tiles arrived. */
export function MapStatusPill({ layer, date, status, className }: { layer: GibsLayer; date: string | null; status: TileStatus; className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] shadow-xl backdrop-blur",
        status === "error" ? "border-earth-yellow/30 bg-card/95 text-earth-yellow" : "border-border/60 bg-card/85 text-foreground/85",
        className,
      )}
      role="status"
    >
      {status === "loading" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
      ) : status === "error" ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-earth-yellow" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-earth-green" />
      )}
      <span className="truncate">
        {status === "error" ? "No imagery for this view — " : ""}
        <span className="font-medium text-foreground">{layer.name}</span> · {layer.source.split(" · ")[0]}
        {date ? ` · ${formatDate(date)}` : ""}
      </span>
    </div>
  );
}
