import { useEffect, useMemo, useState } from "react";
import { GeoJSON, Pane } from "react-leaflet";
import { canvas } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { loadCountries } from "@/lib/geo/countries";
import MapDetails from "./MapDetails";

// No place-label tiles: CARTO's now print "API KEY REQUIRED", and NASA's
// Reference_Labels_15m tiles come back as solid black images that cover the imagery.
// Names are drawn from the bundled data instead (see MapDetails).

const PANE = "reference-borders";

/** Natural Earth 1:50m country outlines (borders + coastlines), bundled. See scripts/build-borders.mjs. */
function loadBorders(): Promise<GeoJsonObject | null> {
  return loadCountries().then((index) => index?.collection ?? null);
}

function BorderLines({ data }: { data: GeoJsonObject }) {
  // One canvas for all ~240 detailed outlines keeps panning and zooming smooth.
  const renderer = useMemo(() => canvas({ pane: PANE, padding: 0.5 }), []);
  return (
    <>
      {/*
        Cyan shows over clouds, snow, desert and sea alike, with a dark edge for the brightest of them.
        It also keeps borders apart from white, which on a map always means your own chosen area.
      */}
      <GeoJSON data={data} interactive={false} {...{ renderer }} style={{ color: "#02070d", weight: 3, opacity: 0.45, fill: false }} />
      <GeoJSON data={data} interactive={false} {...{ renderer }} style={{ color: "#00e5ff", weight: 1.1, opacity: 0.9, fill: false }} />
    </>
  );
}

/**
 * Country outlines (borders and coastlines) drawn above the imagery, with the grid, names, scale and
 * cursor readout. A map too small to carry those turns them off with `details={false}`.
 */
export default function ReferenceOverlays({ borders = true, details = true }: { borders?: boolean; details?: boolean }) {
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
    <>
      <Pane name={PANE} style={{ zIndex: 420, pointerEvents: "none" }}>
        {borders && data && <BorderLines data={data} />}
      </Pane>
      {details && <MapDetails />}
    </>
  );
}
