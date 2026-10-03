import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { isScienceLayer, periodLabel, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate } from "@/lib/gibs/time";
import type { TileStatus } from "./GibsTileLayer";
import LayerLegend from "./LayerLegend";

/** Description, how-to-read notes and the official legend for a layer. */
export function LayerInfoCard({ layer, title }: { layer: GibsLayer; title?: string }) {
  return (
    <section className="mb-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-panel-foreground">
        <Info className="h-4 w-4 shrink-0 text-accent-cyan" /> {title ?? layer.name}
      </div>
      <p className="text-xs leading-relaxed text-panel-muted">{layer.description}</p>
      {layer.howToRead && <p className="mt-2 text-xs leading-relaxed text-panel-soft">{layer.howToRead}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded bg-panel-tint-strong px-2 py-1 text-panel-soft">{layer.source}</span>
        <span className="rounded bg-panel-tint-strong px-2 py-1 text-panel-soft">{periodLabel(layer.period)}</span>
        {isScienceLayer(layer) && <span className="rounded bg-panel-tint-strong px-2 py-1 text-tone-good">Click the map to read values</span>}
      </div>
      {isScienceLayer(layer) && <LayerLegend layer={layer} compact className="mt-4" />}
    </section>
  );
}

/** Small status pill over the map: NASA GIBS, the date shown, and whether the imagery arrived. */
export function MapStatusPill({ layer, date, status }: { layer: GibsLayer; date: string | null; status: TileStatus }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-panel-line bg-panel/85 px-3 py-2 text-[11px] text-panel-muted backdrop-blur">
      {status === "loading" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent-cyan" aria-label="Loading imagery" />
      ) : status === "error" ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-tone-warn" aria-hidden />
      ) : null}
      <span>
        {status === "error" ? "No imagery for this view · " : ""}NASA GIBS · {date ? formatDate(date) : "static composite"}
      </span>
    </div>
  );
}
