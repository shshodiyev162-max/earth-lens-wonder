import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import GibsTileLayer, { type TileStatus } from "./GibsTileLayer";

/**
 * A GIBS layer plus, for science layers that are transparent where there is no
 * data (water, cloud, gaps), a dimmed Blue Marble underneath for context.
 */
export default function LayerStack({
  layer,
  date,
  pane,
  onStatus,
}: {
  layer: GibsLayer;
  date: string | null;
  pane?: string;
  onStatus?: (status: TileStatus) => void;
}) {
  const base = getLayer(BASE_LAYER_ID) as GibsLayer;
  return (
    <>
      {layer.needsBase && <GibsTileLayer layer={base} date={null} opacity={0.45} pane={pane} zIndex={1} />}
      <GibsTileLayer layer={layer} date={date} pane={pane} zIndex={2} onStatus={onStatus} />
    </>
  );
}
