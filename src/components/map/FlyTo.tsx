import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { bboxToLatLngBounds, type BBox, type LatLng } from "@/lib/geo/geometry";

export interface FlyTarget {
  bbox?: BBox;
  center?: LatLng;
  zoom?: number;
  /** Change to re-trigger a flight to the same place. */
  key: string | number;
}

/** Animates the map to a target whenever `target.key` changes. */
export default function FlyTo({ target, maxZoom = 11 }: { target: FlyTarget | null; maxZoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.bbox) {
      const [w, s, e, n] = target.bbox;
      if (Math.abs(e - w) < 1e-6 && Math.abs(n - s) < 1e-6) {
        map.flyTo([s, w], target.zoom ?? maxZoom, { duration: 1.2 });
      } else {
        map.flyToBounds(bboxToLatLngBounds(target.bbox), { padding: [48, 48], maxZoom, duration: 1.2 });
      }
    } else if (target.center) {
      map.flyTo(target.center, Math.min(target.zoom ?? map.getZoom(), maxZoom), { duration: 1.2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key]);
  return null;
}
