import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { COARSE_PIXEL_KM, isScienceLayer, periodLabel, pixelSize, type GibsLayer } from "@/lib/gibs/catalog";
import { formatLayerDate } from "@/lib/gibs/time";
import type { TileStatus } from "./GibsTileLayer";
import LayerLegend, { ClassLegend } from "./LayerLegend";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-panel-line py-1.5">
      <dt className="shrink-0 text-panel-muted">{label}</dt>
      <dd className="min-w-0 text-right text-panel-soft">{children}</dd>
    </div>
  );
}

/** Description, how-to-read notes and the official legend for a layer. */
export function LayerInfoCard({ layer, title }: { layer: GibsLayer; title?: string }) {
  return (
    <section className="mb-6 border-t border-panel-line pt-4">
      <h2 className="text-[13px] font-medium text-panel-foreground">{title ?? layer.name}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-panel-muted">{layer.description}</p>
      {layer.howToRead && <p className="mt-2 text-[13px] leading-relaxed text-panel-soft">{layer.howToRead}</p>}
      <dl className="mt-3 font-mono text-[10.5px] tabular-nums">
        <Fact label="Source">{layer.source}</Fact>
        <Fact label="Updates">{periodLabel(layer.period)}</Fact>
        {layer.pixelKm !== undefined && <Fact label="Pixel size">{pixelSize(layer.pixelKm)}</Fact>}
        {layer.unit && <Fact label="Unit">{layer.unit}</Fact>}
        <Fact label="NASA layer">
          <span className="break-all">{layer.id}</span>
        </Fact>
      </dl>
      {layer.pixelKm !== undefined && layer.pixelKm >= COARSE_PIXEL_KM && (
        <p className="mt-2 text-xs leading-relaxed text-panel-soft">
          Coarse: each pixel is {pixelSize(layer.pixelKm)} across, the finest detail NASA publishes for it, so close up it shows as large squares. It suits countries and regions, not towns.
        </p>
      )}
      {isScienceLayer(layer) && <p className="mt-2 text-xs text-panel-soft">Click the map to read real values.</p>}
      {isScienceLayer(layer) && <LayerLegend layer={layer} compact className="mt-4" />}
      {layer.classes && <ClassLegend layer={layer} className="mt-4" />}
    </section>
  );
}

/** Small status pill over the map: NASA GIBS, the date shown, and whether the imagery arrived. */
export function MapStatusPill({ layer, date, status }: { layer: GibsLayer; date: string | null; status: TileStatus }) {
  return (
    <div role="status" className="float-surface flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] tabular-nums text-panel-soft">
      {status === "loading" ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-panel-muted" aria-label="Loading imagery" />
      ) : status === "error" ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-tone-warn" aria-hidden />
      ) : null}
      <span>
        {status === "error" ? "No imagery for this view · " : ""}NASA GIBS · {date ? formatLayerDate(layer, date) : "static composite"}
      </span>
    </div>
  );
}
