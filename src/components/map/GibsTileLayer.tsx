import { useEffect, useMemo, useRef } from "react";
import { TileLayer } from "react-leaflet";
import { tileUrlTemplate, type GibsLayer } from "@/lib/gibs/catalog";

export type TileStatus = "loading" | "ready" | "partial" | "error";

export const GIBS_ATTRIBUTION = 'Imagery: <a href="https://www.earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a>';

interface GibsTileLayerProps {
  layer: GibsLayer;
  date: string | null;
  pane?: string;
  onStatus?: (status: TileStatus) => void;
}

/**
 * A NASA GIBS layer, loaded the same way as the original (GitHub) version:
 * a plain Leaflet tile layer, recreated when the layer or date changes.
 * Above its native zoom (only possible on Split/Sync with two layers) tiles are enlarged.
 */
export default function GibsTileLayer({ layer, date, pane, onStatus }: GibsTileLayerProps) {
  const url = useMemo(() => tileUrlTemplate(layer, date), [layer, date]);
  const counts = useRef({ loaded: 0, failed: 0 });
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    counts.current = { loaded: 0, failed: 0 };
    statusRef.current?.("loading");
  }, [url]);

  // Only pass `pane` when there is one: an explicit `pane: undefined` would
  // override Leaflet's default "tilePane" and crash when the layer is added.
  const placement = pane ? { pane } : {};

  return (
    <TileLayer
      key={url}
      url={url}
      maxNativeZoom={layer.maxNativeZoom}
      {...placement}
      attribution={GIBS_ATTRIBUTION}
      eventHandlers={{
        tileload: () => {
          counts.current.loaded += 1;
        },
        tileerror: () => {
          counts.current.failed += 1;
        },
        load: () => {
          const { loaded, failed } = counts.current;
          statusRef.current?.(failed > 0 && loaded === 0 ? "error" : failed > loaded ? "partial" : "ready");
          counts.current = { loaded: 0, failed: 0 };
        },
      }}
    />
  );
}
