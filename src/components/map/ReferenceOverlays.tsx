import { useEffect, useState } from "react";
import { GeoJSON, Pane, TileLayer } from "react-leaflet";
import type { GeoJsonObject } from "geojson";

// Place labels from NASA GIBS (built from OpenStreetMap). No key needed; CARTO's
// label tiles now require one and return an "API KEY REQUIRED" watermark instead.
const LABELS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Reference_Labels_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png";
const LABELS_ATTRIBUTION = 'Labels: NASA GIBS · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

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

/** Country borders (Natural Earth, bundled) and place labels drawn above the imagery. */
export default function ReferenceOverlays({ labels = true, borders = true }: { labels?: boolean; borders?: boolean }) {
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
      <Pane name="reference-borders" style={{ zIndex: 420, pointerEvents: "none" }}>
        {borders && data && <GeoJSON data={data} interactive={false} style={{ color: "#00ffff", weight: 1.2, opacity: 0.9, fill: false }} />}
      </Pane>
      <Pane name="reference-labels" style={{ zIndex: 430, pointerEvents: "none" }}>
        {labels && <TileLayer url={LABELS_URL} attribution={LABELS_ATTRIBUTION} maxNativeZoom={13} maxZoom={20} opacity={0.95} />}
      </Pane>
    </>
  );
}
