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
          style={{ color: "#f8fafc", weight: 2, dashArray: "6 6", fillColor: "#f8fafc", fillOpacity: 0.04 }}
        />
      ) : (
        <>
          <CircleMarker center={place.center} radius={16} interactive={false} pathOptions={{ color: "#22d3ee", weight: 1, fillColor: "#22d3ee", fillOpacity: 0.12 }} />
          <CircleMarker center={place.center} radius={6} interactive={false} pathOptions={{ color: "#07111d", weight: 2, fillColor: "#22d3ee", fillOpacity: 1 }} />
        </>
      )}
    </Pane>
  );
}
