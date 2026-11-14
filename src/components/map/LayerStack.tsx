import { useEffect } from "react";
import type { GibsLayer } from "@/lib/gibs/catalog";
import GibsTileLayer, { type TileStatus } from "./GibsTileLayer";

/** The NASA layer shown on a map — one plain tile layer, as in the original version. */
export default function LayerStack({
  layer,
  date,
  waiting = false,
  pane,
  onStatus,
}: {
  layer: GibsLayer;
  date: string | null;
  /** Still waiting for NASA's list of dates: nothing is drawn yet, so no month NASA lacks is asked for. */
  waiting?: boolean;
  pane?: string;
  onStatus?: (status: TileStatus) => void;
}) {
  useEffect(() => {
    if (waiting) onStatus?.("loading");
  }, [waiting, onStatus]);
  if (waiting) return null;
  return <GibsTileLayer layer={layer} date={date} pane={pane} onStatus={onStatus} />;
}
