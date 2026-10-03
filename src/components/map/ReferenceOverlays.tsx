import { useEffect, useMemo, useState } from "react";
import { GeoJSON, Pane } from "react-leaflet";
import { canvas } from "leaflet";
import type { GeoJsonObject } from "geojson";

// No place-label tiles: CARTO's now print "API KEY REQUIRED", and NASA's
// Reference_Labels_15m tiles come back as solid black images that cover the imagery.
// Places are found with the search bar instead.

const PANE = "reference-borders";

let bordersRequest: Promise<GeoJsonObject | null> | null = null;

/** Natural Earth 1:50m country outlines (borders + coastlines), bundled. See scripts/build-borders.mjs. */
function loadBorders(): Promise<GeoJsonObject | null> {
  if (!bordersRequest) {
    bordersRequest = fetch(`${import.meta.env.BASE_URL}data/countries-50m.json`)
      .then((response) => (response.ok ? (response.json() as Promise<GeoJsonObject>) : null))
      .catch(() => {
        bordersRequest = null;
        return null;
      });
  }
  return bordersRequest;
}

function BorderLines({ data }: { data: GeoJsonObject }) {
  // One canvas for all ~240 detailed outlines keeps panning and zooming smooth.
  const renderer = useMemo(() => canvas({ pane: PANE, padding: 0.5 }), []);
  return (
    <>
      {/* Soft dark edge so the cyan line stays visible over white clouds and pale deserts. */}
      <GeoJSON data={data} interactive={false} {...{ renderer }} style={{ color: "#02070d", weight: 3, opacity: 0.45, fill: false }} />
      <GeoJSON data={data} interactive={false} {...{ renderer }} style={{ color: "#00ffff", weight: 1.2, opacity: 0.9, fill: false }} />
    </>
  );
}

/** Cyan country outlines (borders and coastlines) drawn above the imagery, as in the original version. */
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
    <Pane name={PANE} style={{ zIndex: 420, pointerEvents: "none" }}>
      {borders && data && <BorderLines data={data} />}
    </Pane>
  );
}
