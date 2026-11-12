import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { ZoomPanOptions } from "leaflet";
import { bboxToLatLngBounds, type BBox, type LatLng } from "@/lib/geo/geometry";

/** Pixels of the map that something covers, as [left, top] and [right, bottom]. */
export interface MapPadding {
  topLeft: [number, number];
  bottomRight: [number, number];
}

export interface FlyTarget {
  bbox?: BBox;
  center?: LatLng;
  zoom?: number;
  /** Where the flight should end clear of something on top of the map. */
  padding?: MapPadding;
  /** Change to re-trigger a flight to the same place. */
  key: string | number;
}

/** Animates the map to a target whenever `target.key` changes. */
export default function FlyTo({ target, maxZoom = 11 }: { target: FlyTarget | null; maxZoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // Leaflet moves its tiles and images on "zoom" events. A flight that ends at the zoom it began
    // at with no frames drawn on the way (a busy page, a hidden tab) sends none, leaving them behind
    // while outlines move on. One full redraw at the end puts everything back in line. It has to be
    // Leaflet's "reset" (missing from its published types): a plain setView to the same place does nothing.
    let zoomed = false;
    const onZoom = () => {
      zoomed = true;
    };
    const stopWatching = () => {
      map.off("zoom", onZoom);
      map.off("moveend", onLanded);
    };
    const onLanded = () => {
      stopWatching();
      if (!zoomed) map.setView(map.getCenter(), map.getZoom(), { reset: true } as ZoomPanOptions);
    };
    const fly = () => {
      map.on("zoom", onZoom);
      map.on("moveend", onLanded);
      if (target.bbox) {
        const [w, s, e, n] = target.bbox;
        if (Math.abs(e - w) < 1e-6 && Math.abs(n - s) < 1e-6) {
          map.flyTo([s, w], target.zoom ?? maxZoom, { duration: 1.2 });
        } else {
          const room = target.padding ? { paddingTopLeft: target.padding.topLeft, paddingBottomRight: target.padding.bottomRight } : { padding: [48, 48] as [number, number] };
          map.flyToBounds(bboxToLatLngBounds(target.bbox), { ...room, maxZoom, duration: 1.2 });
        }
      } else if (target.center) {
        map.flyTo(target.center, Math.min(target.zoom ?? map.getZoom(), maxZoom), { duration: 1.2 });
      }
    };
    // A map with no size yet (a page opened in a hidden tab) can't work out a flight: Leaflet would
    // throw and take the whole page down. It flies as soon as it has a size.
    const { x, y } = map.getSize();
    if (x > 0 && y > 0) fly();
    else map.once("resize", fly);
    return () => {
      map.off("resize", fly);
      stopWatching();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key]);
  return null;
}
