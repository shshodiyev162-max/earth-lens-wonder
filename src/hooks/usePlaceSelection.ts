import { useCallback, useRef, useState } from "react";
import { fetchBoundary, hasBoundary, zoomForKind, type PlaceResult } from "@/lib/geo/geocode";
import type { PolygonGeometry } from "@/lib/geo/geometry";
import { findNamedRegion, regionGeometry } from "@/lib/geo/regions";
import type { FlyTarget } from "@/components/map/FlyTo";

export interface PlaceSelection {
  place: PlaceResult;
  geometry: PolygonGeometry | null;
  loadingBoundary: boolean;
}

/** Selected search result + its boundary (fetched lazily) + where to fly. */
export function usePlaceSelection() {
  const [selection, setSelection] = useState<PlaceSelection | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const counter = useRef(0);

  const select = useCallback((place: PlaceResult) => {
    counter.current += 1;
    const wantsBoundary = hasBoundary(place);
    setSelection({ place, geometry: null, loadingBoundary: wantsBoundary });
    setFlyTarget(
      place.bbox && place.kind !== "poi"
        ? { bbox: place.bbox, key: `${place.id}-${counter.current}` }
        : { center: place.center, zoom: zoomForKind(place.kind), key: `${place.id}-${counter.current}` },
    );
    // A sea or named region has its shape bundled; other places ask OpenStreetMap for their boundary.
    const region = place.region ? findNamedRegion(place.region) : null;
    const boundary = region ? regionGeometry(region) : wantsBoundary && place.osm ? fetchBoundary(place.osm, { kind: place.kind }) : null;
    boundary
      ?.then((geometry) => setSelection((current) => (current?.place.id === place.id ? { ...current, geometry, loadingBoundary: false } : current)))
      .catch(() => setSelection((current) => (current?.place.id === place.id ? { ...current, loadingBoundary: false } : current)));
  }, []);

  const clear = useCallback(() => setSelection(null), []);

  const flyTo = useCallback((target: Omit<FlyTarget, "key">) => {
    counter.current += 1;
    setFlyTarget({ ...target, key: `manual-${counter.current}` });
  }, []);

  return { selection, select, clear, flyTarget, flyTo };
}
