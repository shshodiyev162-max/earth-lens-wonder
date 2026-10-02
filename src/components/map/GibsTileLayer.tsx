import { useEffect, useMemo, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";
import { tileUrlTemplate, type GibsLayer } from "@/lib/gibs/catalog";
import { MAX_MAP_ZOOM } from "./BaseMap";

export type TileStatus = "loading" | "ready" | "partial" | "error";

export const GIBS_ATTRIBUTION = 'Imagery: <a href="https://www.earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a>';

interface GibsTileLayerProps {
  layer: GibsLayer;
  date: string | null;
  opacity?: number;
  pane?: string;
  zIndex?: number;
  onStatus?: (status: TileStatus) => void;
}

interface Source {
  url: string;
  maxNativeZoom: number;
}

/**
 * A GIBS WMTS layer that never asks for zoom levels the server doesn't have
 * (maxNativeZoom) and reports whether tiles actually arrived.
 *
 * When the date or layer changes, the previous imagery stays on screen until the
 * new tiles have loaded, so the map never flashes black while NASA responds.
 */
export default function GibsTileLayer({ layer, date, opacity = 1, pane, zIndex, onStatus }: GibsTileLayerProps) {
  const url = useMemo(() => tileUrlTemplate(layer, date), [layer, date]);
  const [sources, setSources] = useState<Source[]>(() => [{ url, maxNativeZoom: layer.maxNativeZoom }]);
  const counts = useRef({ loaded: 0, failed: 0 });
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    counts.current = { loaded: 0, failed: 0 };
    statusRef.current?.("loading");
    setSources((current) => {
      if (current[current.length - 1]?.url === url) return current;
      // Keep only the last finished imagery underneath the incoming one.
      return [...current.slice(-1), { url, maxNativeZoom: layer.maxNativeZoom }];
    });
  }, [url, layer.maxNativeZoom]);

  // Only pass `pane` when there is one: an explicit `pane: undefined` would
  // override Leaflet's default "tilePane" and crash when the layer is added.
  const placement = pane ? { pane } : {};

  return (
    <>
      {sources.map((source) => {
        const current = source.url === url;
        return (
          <TileLayer
            key={source.url}
            url={source.url}
            maxNativeZoom={source.maxNativeZoom}
            maxZoom={MAX_MAP_ZOOM}
            minZoom={1}
            opacity={opacity}
            {...placement}
            zIndex={zIndex}
            keepBuffer={4}
            updateWhenZooming={false}
            attribution={GIBS_ATTRIBUTION}
            eventHandlers={
              current
                ? {
                    loading: () => statusRef.current?.("loading"),
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
                      // The new imagery is complete: drop the old one underneath.
                      setSources((all) => (all.length > 1 ? all.filter((item) => item.url === source.url) : all));
                    },
                  }
                : undefined
            }
          />
        );
      })}
    </>
  );
}
