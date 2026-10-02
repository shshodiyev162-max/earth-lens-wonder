import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { GibsLayer } from "@/lib/gibs/catalog";
import { MAX_MAP_ZOOM } from "./BaseMap";

/**
 * Lets the map zoom one level past the sharpest imagery it shows, and no further.
 * Beyond that NASA tiles are only enlarged pixels, which looks like the map failed to load.
 */
export default function ZoomLimit({ layers }: { layers: GibsLayer[] }) {
  const map = useMap();
  const limit = Math.min(MAX_MAP_ZOOM, Math.max(...layers.map((layer) => layer.maxNativeZoom)) + 1);

  useEffect(() => {
    map.setMaxZoom(limit);
    if (map.getZoom() > limit) map.setZoom(limit, { animate: false });
  }, [map, limit]);

  return null;
}
