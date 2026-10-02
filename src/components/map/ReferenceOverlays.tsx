import { useEffect, useState } from "react";
import { GeoJSON, Pane } from "react-leaflet";
import type { GeoJsonObject } from "geojson";

// No place-label tiles: CARTO's now print "API KEY REQUIRED", and NASA's
// Reference_Labels_15m tiles come back as solid black images that cover the imagery.
// Places are found with the search bar instead.

let bordersRequest: Promise<GeoJsonObject | null> | null = null;

function loadBorders(): Promise<GeoJsonObject | null> {
  if (!bordersRequest) {
    bordersRequest = fetch(`${import.meta.env.BASE_URL}data/borders-50m.json`)
      .then((response) => (response.ok ? (response.json() as Promise<GeoJsonObject>) : null))
      .catch(() => {
        bordersRequest = null;
        return null;
      });
  }
  return bordersRequest;
}

/** Cyan country borders (Natural Earth, bundled) drawn above the imagery, as in the original version. */
export default function ReferenceOverlays({ borders = true }: { borders?: boolean }) {
  const [data, setData] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    if (!borders) return;
    let active = true;
    loadBorders().then((geojson) => {
      if (active) setData(geojson);
    });
    return () => {
      active = false;
    };
  }, [borders]);

  return (
    <Pane name="reference-borders" style={{ zIndex: 420, pointerEvents: "none" }}>
      {borders && data && <GeoJSON data={data} interactive={false} style={{ color: "#00ffff", weight: 1.2, opacity: 0.9, fill: false }} />}
    </Pane>
  );
}
