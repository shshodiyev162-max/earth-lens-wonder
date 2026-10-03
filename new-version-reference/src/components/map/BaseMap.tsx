import { useEffect, type ReactNode } from "react";
import { AttributionControl, MapContainer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import type { MapView } from "@/context/WorkspaceContext";
import { cn } from "@/lib/utils";

/** Leaflet upsamples tiles past each layer's native zoom up to this level. */
export const MAX_MAP_ZOOM = 12;

function ViewReporter({ onChange }: { onChange?: (view: MapView) => void }) {
  useMapEvents({
    moveend(event) {
      const map = event.target as LeafletMap;
      const center = map.getCenter();
      onChange?.({ center: [Number(center.lat.toFixed(4)), Number(center.lng.toFixed(4))], zoom: map.getZoom() });
    },
  });
  return null;
}

function MapReady({ onReady }: { onReady?: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady?.(map);
    // Containers often change size after first paint (sidebars, fonts); keep tiles aligned.
    const observer = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, onReady]);
  return null;
}

interface BaseMapProps {
  initialView: MapView;
  children?: ReactNode;
  className?: string;
  onViewChange?: (view: MapView) => void;
  onReady?: (map: LeafletMap) => void;
  zoomControl?: boolean;
  attribution?: boolean;
  zoomPosition?: "topleft" | "topright" | "bottomleft" | "bottomright";
}

export default function BaseMap({
  initialView,
  children,
  className,
  onViewChange,
  onReady,
  zoomControl = true,
  attribution = true,
  zoomPosition = "bottomright",
}: BaseMapProps) {
  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      minZoom={2}
      maxZoom={MAX_MAP_ZOOM}
      worldCopyJump
      maxBounds={[
        [-85, -720],
        [85, 720],
      ]}
      maxBoundsViscosity={0.8}
      zoomControl={false}
      attributionControl={false}
      className={cn("h-full w-full", className)}
    >
      {zoomControl && <ZoomControl position={zoomPosition} />}
      {attribution && <AttributionControl position="bottomleft" prefix={false} />}
      <ViewReporter onChange={onViewChange} />
      <MapReady onReady={onReady} />
      {children}
    </MapContainer>
  );
}
