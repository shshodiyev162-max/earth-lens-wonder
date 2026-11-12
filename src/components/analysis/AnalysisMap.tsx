import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Feature } from "geojson";
import { GeoJSON, Pane, useMapEvents } from "react-leaflet";
import { Loader2 } from "lucide-react";
import BaseMap from "@/components/map/BaseMap";
import GibsTileLayer from "@/components/map/GibsTileLayer";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import DrawTools, { type DrawMode, type PickedCountry } from "@/components/map/DrawTools";
import DrawToolbar from "@/components/map/DrawToolbar";
import FlyTo, { type FlyTarget } from "@/components/map/FlyTo";
import ZoomLimit from "@/components/map/ZoomLimit";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import type { LatLng, PolygonGeometry } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

function ClickToPick({ enabled, onPick }: { enabled: boolean; onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPick([event.latlng.lat, ((event.latlng.lng + 540) % 360) - 180]);
    },
  });
  return null;
}

interface AnalysisMapProps {
  target: AnalysisTarget | null;
  loading: boolean;
  /** While adding places, countries and seas can be picked one after another. */
  adding: boolean;
  /** The circle drawn around a clicked point. */
  radiusKm: number;
  onPoint: (point: LatLng, radiusKm: number) => void;
  onDrawn: (geometry: PolygonGeometry, kind: AreaKind, picked?: PickedCountry) => void;
  /** What sits over the map's top-left corner: what to do, or the chosen area and a way to its report. */
  children?: ReactNode;
  className?: string;
}

/**
 * The Analysis page's map, where a place is picked: click anywhere for a circle around the point,
 * draw a shape, or pick a country or sea. The chosen area is outlined in white.
 */
export default function AnalysisMap({ target, loading, adding, radiusKm, onPoint, onDrawn, children, className }: AnalysisMapProps) {
  const { view } = useWorkspace();
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const base = getLayer(BASE_LAYER_ID) as GibsLayer;
  const [initialView] = useState(() => (target ? { center: target.center, zoom: 6 } : view));
  // The map shows the chosen area, but holds still while places are added, so the next click lands where you aimed.
  const flown = useRef<FlyTarget | null>(null);
  const flyTarget = useMemo<FlyTarget | null>(() => {
    if (!target) return null;
    if (adding && flown.current) return flown.current;
    return { bbox: target.bbox, key: JSON.stringify(target.bbox) };
  }, [target, adding]);
  flown.current = flyTarget;

  // Done adding: the country picker goes back to picking one place at a time.
  useEffect(() => {
    if (!adding) setDrawMode((mode) => (mode === "country" ? null : mode));
  }, [adding]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <BaseMap initialView={initialView} zoomPosition="topleft">
        <GibsTileLayer layer={base} date={null} />
        <ReferenceOverlays />
        {target && (
          <Pane name="analysis-target" style={{ zIndex: 445 }}>
            <GeoJSON
              key={JSON.stringify(target.bbox) + target.name}
              data={{ type: "Feature", properties: {}, geometry: target.geometry } as Feature}
              interactive={false}
              style={{ color: "#ffffff", weight: 2, fillColor: "#ffffff", fillOpacity: 0.1 }}
            />
          </Pane>
        )}
        <DrawTools
          mode={drawMode}
          onComplete={(geometry, kind, picked) => {
            if (!(adding && drawMode === "country")) setDrawMode(null);
            onDrawn(geometry, kind, picked);
          }}
          onCancel={() => setDrawMode(null)}
          finishSignal={finishSignal}
          undoSignal={undoSignal}
          onVertexCount={setVertexCount}
        />
        <ClickToPick enabled={!drawMode} onPick={(point) => onPoint(point, radiusKm)} />
        {/* Close enough to see the place, not so close that NASA's picture blurs. */}
        <FlyTo target={flyTarget} maxZoom={9} />
        <ZoomLimit layers={[base]} />
      </BaseMap>
      <div className="pointer-events-none absolute inset-0 z-[1000]">
        <DrawToolbar
          className="absolute right-3 top-3"
          mode={drawMode}
          onModeChange={setDrawMode}
          vertexCount={vertexCount}
          onFinish={() => setFinishSignal((n) => n + 1)}
          onUndo={() => setUndoSignal((n) => n + 1)}
        />
        {children && <div className="absolute left-14 right-16 top-3 sm:right-auto">{children}</div>}
        {loading && (
          <div className="absolute inset-x-0 bottom-24 flex justify-center">
            <span role="status" className="float-surface flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-panel-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading the boundary…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
