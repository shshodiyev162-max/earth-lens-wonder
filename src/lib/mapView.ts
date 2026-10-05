import type { MapView } from "@/context/WorkspaceContext";

/** A map view from ?lat=&lon=&z= (shared links), or the fallback. */
export function initialViewFrom(params: URLSearchParams, fallback: MapView): MapView {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const zoom = Number(params.get("z"));
  if (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180) {
    return { center: [lat, lon], zoom: Number.isFinite(zoom) && zoom >= 2 && zoom <= 12 ? zoom : 6 };
  }
  return fallback;
}
