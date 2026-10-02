import { useMapEvents } from "react-leaflet";
import { MapPin } from "lucide-react";
import type { LatLng } from "@/lib/geo/geometry";

/** Reports the latitude/longitude under the mouse (or the map centre after a pan). Render inside a map. */
export function CursorTracker({ onChange }: { onChange: (point: LatLng) => void }) {
  useMapEvents({
    mousemove: (event) => onChange([event.latlng.lat, event.latlng.lng]),
    moveend: (event) => {
      const center = event.target.getCenter();
      onChange([center.lat, center.lng]);
    },
  });
  return null;
}

/** The small "Lat / Lng" pill from the original Split and Sync views. */
export function CoordsPill({ point }: { point: LatLng }) {
  return (
    <div className="absolute bottom-4 left-4 hidden rounded-lg border border-white/10 bg-[#07111d]/85 px-3 py-2 text-xs text-white backdrop-blur md:block">
      <MapPin className="mr-1 inline h-3 w-3 text-cyan-400" />
      Lat: {point[0].toFixed(3)}, Lng: {point[1].toFixed(3)}
    </div>
  );
}
