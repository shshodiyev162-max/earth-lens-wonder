import { useEffect, useMemo, useState } from "react";
import type { Feature } from "geojson";
import { GeoJSON, Pane, useMapEvents } from "react-leaflet";
import { LocateFixed, Loader2, MousePointerClick, Shapes } from "lucide-react";
import BaseMap from "@/components/map/BaseMap";
import GibsTileLayer from "@/components/map/GibsTileLayer";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import DrawTools, { type DrawMode } from "@/components/map/DrawTools";
import DrawToolbar, { DrawHint } from "@/components/map/DrawToolbar";
import FlyTo, { type FlyTarget } from "@/components/map/FlyTo";
import PlaceSearch from "@/components/search/PlaceSearch";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import type { PlaceResult } from "@/lib/geo/geocode";
import { formatArea, type LatLng, type PolygonGeometry } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const RADII = [2, 5, 10, 25, 50];

function ClickToPick({ enabled, onPick }: { enabled: boolean; onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPick([event.latlng.lat, ((event.latlng.lng + 540) % 360) - 180]);
    },
  });
  return null;
}

interface LocationPickerProps {
  target: AnalysisTarget | null;
  loading: boolean;
  onPlace: (place: PlaceResult) => void;
  onPoint: (point: LatLng, radiusKm: number) => void;
  onDrawn: (geometry: PolygonGeometry, kind: AreaKind) => void;
  onArea: (id: string) => void;
}

export default function LocationPicker({ target, loading, onPlace, onPoint, onDrawn, onArea }: LocationPickerProps) {
  const { areas, view } = useWorkspace();
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const radius = target?.ref.type === "point" ? target.ref.radiusKm : 10;
  const base = getLayer(BASE_LAYER_ID) as GibsLayer;

  const flyTarget = useMemo<FlyTarget | null>(() => (target ? { bbox: target.bbox, key: JSON.stringify(target.bbox) } : null), [target]);

  useEffect(() => setLocateError(null), [target]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocateError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onPoint([position.coords.latitude, position.coords.longitude], radius);
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location — allow location access or search instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <PlaceSearch onSelect={onPlace} near={view.center} placeholder="Search a city, region or coordinates" ariaLabel="Search a place to analyze" clearOnSelect />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <button
            type="button"
            onClick={locate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-medium text-slate-300 transition hover:border-primary/40 hover:text-white"
          >
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
            Use my location
          </button>
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="h-3.5 w-3.5" /> or click / draw on the map
          </span>
        </div>
        {locateError && <p className="mt-2 text-xs text-amber-300">{locateError}</p>}
      </div>

      <div className="relative h-64 overflow-hidden rounded-2xl border border-white/10 sm:h-72">
        <BaseMap initialView={target ? { center: target.center, zoom: 8 } : view} zoomPosition="bottomright">
          <GibsTileLayer layer={base} date={null} />
          <ReferenceOverlays />
          {target && (
            <Pane name="analysis-target" style={{ zIndex: 445 }}>
              <GeoJSON
                key={JSON.stringify(target.bbox)}
                data={{ type: "Feature", properties: {}, geometry: target.geometry } as Feature}
                interactive={false}
                style={{ color: "#34d399", weight: 2.5, fillColor: "#34d399", fillOpacity: 0.12 }}
              />
            </Pane>
          )}
          <DrawTools
            mode={drawMode}
            onComplete={(geometry, kind) => {
              setDrawMode(null);
              onDrawn(geometry, kind);
            }}
            onCancel={() => setDrawMode(null)}
            finishSignal={finishSignal}
            undoSignal={undoSignal}
            onVertexCount={setVertexCount}
          />
          <ClickToPick enabled={!drawMode} onPick={(point) => onPoint(point, radius)} />
          <FlyTo target={flyTarget} maxZoom={12} />
        </BaseMap>
        <div className="pointer-events-none absolute inset-0 z-[1000]">
          <DrawToolbar
            className="absolute right-2 top-2"
            mode={drawMode}
            onModeChange={setDrawMode}
            vertexCount={vertexCount}
            onFinish={() => setFinishSignal((n) => n + 1)}
            onUndo={() => setUndoSignal((n) => n + 1)}
            showHint={false}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#02070d]/40">
              <span className="flex items-center gap-2 rounded-full bg-[#07111d]/90 px-3 py-1.5 text-xs text-slate-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Loading boundary…
              </span>
            </div>
          )}
        </div>
      </div>

      {drawMode && (
        <DrawHint
          mode={drawMode}
          vertexCount={vertexCount}
          onFinish={() => setFinishSignal((n) => n + 1)}
          onUndo={() => setUndoSignal((n) => n + 1)}
          onCancel={() => setDrawMode(null)}
          className="-mt-2"
        />
      )}

      {target?.ref.type === "point" && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Area around the point</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Radius">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={radius === r}
                onClick={() => onPoint(target.center, r)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  radius === r ? "bg-primary text-primary-foreground" : "bg-white/5 text-slate-300 hover:bg-white/10",
                )}
              >
                {r} km
              </button>
            ))}
          </div>
        </div>
      )}

      {areas.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Shapes className="h-3.5 w-3.5 text-primary" /> Your areas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {areas.map((area) => {
              const active = target?.ref.type === "area" && target.ref.id === area.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => onArea(area.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                    active ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25",
                  )}
                >
                  <span className="font-medium">{area.name}</span> <span className="text-slate-500">· {formatArea(area.areaKm2)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
