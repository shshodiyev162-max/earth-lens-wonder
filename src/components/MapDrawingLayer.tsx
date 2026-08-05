import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { ensureLeafletDraw, setupDrawControl, renderSelectedAreas } from "@/lib/mapDrawing";
import { useRegion } from "@/context/RegionContext";
import type { MapLayer } from "@/lib/map-layers";

export default function MapDrawingLayer({ layers }: { layers: MapLayer[] }) {
  const map = useMap();
  const { selectedAreas, addSelectedArea, removeSelectedArea, activeAreaId, setActiveAreaId } = useRegion();
  const groupRef = useRef<any>(null);
  const areasRef = useRef(selectedAreas);
  areasRef.current = selectedAreas;

  useEffect(() => {
    let cancelled = false;
    let L: any = null;
    ensureLeafletDraw().then((loaded) => {
      if (cancelled) return;
      L = loaded;
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
      }
      groupRef.current = new L.FeatureGroup().addTo(map);
      setupDrawControl({
        map: map as any,
        L,
        featureGroup: groupRef.current,
        layers,
        getSelectedAreas: () => areasRef.current,
        onAdd: addSelectedArea,
        onRemove: removeSelectedArea,
      });
      renderSelectedAreas({
        featureGroup: groupRef.current,
        L,
        selectedAreas: areasRef.current,
        activeAreaId,
        onActivate: setActiveAreaId,
      });
    });
    return () => {
      cancelled = true;
      if (groupRef.current && map) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  useEffect(() => {
    if (!groupRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    renderSelectedAreas({
      featureGroup: groupRef.current,
      L,
      selectedAreas,
      activeAreaId,
      onActivate: setActiveAreaId,
    });
  }, [selectedAreas, activeAreaId, layers, setActiveAreaId]);

  return null;
}