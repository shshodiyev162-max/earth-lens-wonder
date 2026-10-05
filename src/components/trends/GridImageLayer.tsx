import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { GridSpec } from "@/lib/trends/hotspots";
import { toMercator } from "@/lib/trends/render";

const PANE = "trend-grid";

function toDataUrl(rgba: Uint8ClampedArray, grid: GridSpec): string {
  const { data, width, height } = toMercator(rgba, grid);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Draws a scan-grid image (change map or a value frame) on the map, aligned in Mercator. */
export default function GridImageLayer({ grid, rgba, opacity = 1 }: { grid: GridSpec; rgba: Uint8ClampedArray | null; opacity?: number }) {
  const map = useMap();
  const overlay = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      // Under the country borders (420) and outlines, above the imagery.
      pane.style.zIndex = "410";
      pane.style.pointerEvents = "none";
    }
  }, [map]);

  useEffect(() => {
    if (!rgba) {
      overlay.current?.remove();
      overlay.current = null;
      return;
    }
    const [w, s, e, n] = grid.bbox;
    const bounds = L.latLngBounds([Math.max(-85, s), w], [Math.min(85, n), e]);
    const url = toDataUrl(rgba, grid);
    if (overlay.current) {
      overlay.current.setUrl(url);
      overlay.current.setBounds(bounds);
    } else {
      overlay.current = L.imageOverlay(url, bounds, { pane: PANE, opacity, interactive: false, className: "trend-grid-image" }).addTo(map);
    }
  }, [map, grid, rgba, opacity]);

  useEffect(() => {
    overlay.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(
    () => () => {
      overlay.current?.remove();
      overlay.current = null;
    },
    [],
  );

  return null;
}
