import { defaultRadiusKm, hasBoundary, type PlaceResult } from "./geo/geocode";
import type { LatLng } from "./geo/geometry";

/** Link to the Analysis page for a search result. */
export function analysisHrefForPlace(place: PlaceResult, radiusKm = defaultRadiusKm(place.kind)): string {
  const params = new URLSearchParams();
  if (place.osm && hasBoundary(place)) {
    params.set("osm", `${place.osm.type}${place.osm.id}`);
  } else {
    params.set("lat", place.center[0].toFixed(5));
    params.set("lon", place.center[1].toFixed(5));
    params.set("r", String(radiusKm));
  }
  params.set("name", place.name);
  if (place.context) params.set("ctx", place.context);
  return `/analysis?${params}`;
}

export function analysisHrefForPoint(point: LatLng, radiusKm = 10, name?: string): string {
  const params = new URLSearchParams({ lat: point[0].toFixed(5), lon: point[1].toFixed(5), r: String(radiusKm) });
  if (name) params.set("name", name);
  return `/analysis?${params}`;
}

export function analysisHrefForArea(areaId: string): string {
  return `/analysis?area=${encodeURIComponent(areaId)}`;
}
