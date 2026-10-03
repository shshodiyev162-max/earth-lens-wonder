import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Clips two map panes so the left one shows left of the divider and the right
 * one right of it (the same technique as leaflet-side-by-side). The clip is in
 * layer-point space, so it is recomputed whenever the map moves.
 */
export default function SwipeClip({ leftPane, rightPane, ratio }: { leftPane: string; rightPane: string; ratio: number }) {
  const map = useMap();

  useEffect(() => {
    const update = () => {
      const left = map.getPane(leftPane);
      const right = map.getPane(rightPane);
      if (!left || !right) return;
      const size = map.getSize();
      const nw = map.containerPointToLayerPoint([0, 0]);
      const se = map.containerPointToLayerPoint(size);
      const clipX = nw.x + size.x * ratio;
      left.style.clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
      right.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
    };
    update();
    // Panes are created by sibling components; make sure they exist first.
    const frame = requestAnimationFrame(update);
    map.on("move zoom viewreset resize zoomend moveend layeradd", update);
    return () => {
      cancelAnimationFrame(frame);
      map.off("move zoom viewreset resize zoomend moveend layeradd", update);
    };
  }, [map, leftPane, rightPane, ratio]);

  return null;
}
