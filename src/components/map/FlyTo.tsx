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
    const fly = () => {
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
    };
    // A map with no size yet (a page opened in a hidden tab) can't work out a flight: Leaflet would
    // throw and take the whole page down. It flies as soon as it has a size.
    const { x, y } = map.getSize();
    if (x > 0 && y > 0) {
      fly();
      return;
    }
    map.once("resize", fly);
    return () => {
      map.off("resize", fly);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key]);
  return null;
}
