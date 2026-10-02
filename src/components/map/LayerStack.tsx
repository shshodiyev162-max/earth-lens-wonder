import type { GibsLayer } from "@/lib/gibs/catalog";
import GibsTileLayer, { type TileStatus } from "./GibsTileLayer";

/** The NASA layer shown on a map — one plain tile layer, as in the original version. */
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
  return <GibsTileLayer layer={layer} date={date} pane={pane} onStatus={onStatus} />;
}
