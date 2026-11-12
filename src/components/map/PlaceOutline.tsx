import { CircleMarker, GeoJSON, Pane } from "react-leaflet";
import type { Feature } from "geojson";
import type { PlaceResult } from "@/lib/geo/geocode";
import type { PolygonGeometry } from "@/lib/geo/geometry";

/** Highlights the place picked in search: its boundary if known, otherwise a pin. */
export default function PlaceOutline({ place, geometry }: { place: PlaceResult; geometry: PolygonGeometry | null }) {
  return (
    <Pane name="search-result" style={{ zIndex: 445, pointerEvents: "none" }}>
      {geometry ? (
        <GeoJSON
          key={place.id}
          data={{ type: "Feature", properties: {}, geometry } as Feature}
          interactive={false}
          style={{ color: "#ffffff", weight: 2, dashArray: "6 6", fillColor: "#ffffff", fillOpacity: 0.04 }}
        />
      ) : (
        <>
          <CircleMarker center={place.center} radius={16} interactive={false} pathOptions={{ color: "#ffffff", weight: 1, fillColor: "#ffffff", fillOpacity: 0.12 }} />
          <CircleMarker center={place.center} radius={6} interactive={false} pathOptions={{ color: "#03040a", weight: 2, fillColor: "#ffffff", fillOpacity: 1 }} />
        </>
      )}
    </Pane>
  );
}
