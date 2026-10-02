import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { GibsLayer } from "@/lib/gibs/catalog";
import { MAX_MAP_ZOOM } from "./BaseMap";

/**
 * Caps the map's zoom at the real detail of its imagery, like the original version's
 * MaxZoomEnforcer (map maxZoom = layer max zoom). With two layers (Split/Sync) the
 * sharper one decides.
 */
export default function ZoomLimit({ layers }: { layers: GibsLayer[] }) {
  const map = useMap();
  const limit = Math.min(MAX_MAP_ZOOM, Math.max(...layers.map((layer) => layer.maxNativeZoom)));

  useEffect(() => {
    map.setMaxZoom(limit);
    if (map.getZoom() > limit) map.setZoom(limit, { animate: false });
  }, [map, limit]);

  return null;
}
