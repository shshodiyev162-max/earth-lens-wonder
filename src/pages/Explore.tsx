import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Search } from "lucide-react";
import BaseMap from "@/components/map/BaseMap";
import LayerStack from "@/components/map/LayerStack";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import AreasLayer from "@/components/map/AreasLayer";
import DrawTools, { type DrawMode } from "@/components/map/DrawTools";
import DrawToolbar from "@/components/map/DrawToolbar";
import FlyTo from "@/components/map/FlyTo";
import PlaceOutline from "@/components/map/PlaceOutline";
import ValueProbe from "@/components/map/ValueProbe";
import LayerPicker, { LayerPickerLabel } from "@/components/map/LayerPicker";
import DateControl from "@/components/map/DateControl";
import AreasPanel from "@/components/map/AreasPanel";
import SelectedPlaceCard from "@/components/map/SelectedPlaceCard";
import LayerLegend from "@/components/map/LayerLegend";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import { LayerInfoCard, MapStatusPill } from "@/components/map/LayerInfo";
import PlaceSearch from "@/components/search/PlaceSearch";
import type { TileStatus } from "@/components/map/GibsTileLayer";
import { useWorkspace, type AreaKind, type MapView, type SavedArea } from "@/context/WorkspaceContext";
import { useLayerDate } from "@/hooks/useLayerDate";
import { usePlaceSelection } from "@/hooks/usePlaceSelection";
import { useRouteFocusPlace } from "@/hooks/useRouteFocusPlace";
import { DEFAULT_LAYER_ID, getLayerOrDefault, isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { isIsoDate } from "@/lib/gibs/time";
import { formatArea, type PolygonGeometry } from "@/lib/geo/geometry";
import { analysisHrefForArea } from "@/lib/links";

function initialViewFrom(params: URLSearchParams, fallback: MapView): MapView {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const zoom = Number(params.get("z"));
  if (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180) {
    return { center: [lat, lon], zoom: Number.isFinite(zoom) && zoom >= 2 && zoom <= 12 ? zoom : 6 };
  }
  return fallback;
}

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [initialView] = useState(() => initialViewFrom(params, workspace.view));
  const layer = useMemo(() => getLayerOrDefault(params.get("layer"), DEFAULT_LAYER_ID), [params]);
  const requestedDate = isIsoDate(params.get("date")) ? (params.get("date") as string) : null;
  const dateState = useLayerDate(layer, requestedDate);
  const [tileStatus, setTileStatus] = useState<TileStatus>("loading");
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const { selection, select, clear, flyTarget, flyTo } = usePlaceSelection();

  useRouteFocusPlace(select);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const onViewChange = useCallback(
    (view: MapView) => {
      workspace.setView(view);
      updateParams({ lat: view.center[0].toFixed(4), lon: view.center[1].toFixed(4), z: String(view.zoom) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.setView, updateParams],
  );

  const changeLayer = (next: GibsLayer) => {
    // Keep the chosen day when switching layers; resolution snaps it to what exists.
    updateParams({ layer: next.id === DEFAULT_LAYER_ID ? null : next.id });
  };

  const changeDate = (date: string | null) => updateParams({ date });

  const onAreaComplete = (geometry: PolygonGeometry, kind: AreaKind) => {
    setDrawMode(null);
    const area = workspace.addArea({ geometry, kind });
    toast.success(`${area.name} saved`, {
      description: `${formatArea(area.areaKm2)} · measuring ${isScienceLayer(layer) ? layer.name.toLowerCase() : "available data"}`,
      action: { label: "Analyze", onClick: () => navigate(analysisHrefForArea(area.id)) },
    });
  };

  const saveSelection = () => {
    if (!selection?.geometry) return;
    const area = workspace.addArea({ geometry: selection.geometry, kind: "place", name: selection.place.name });
    toast.success(`${area.name} saved to your areas`, { description: formatArea(area.areaKm2) });
  };

  const zoomToArea = (area: SavedArea) => flyTo({ bbox: area.bbox });
  const dateReady = !dateState.loading;

  const sidebar = (
    <>
      <SidebarSection title="Search" icon={<Search className="h-3.5 w-3.5 text-primary" />}>
        <PlaceSearch onSelect={select} near={workspace.view.center} />
      </SidebarSection>
      <div>
        <LayerPickerLabel>Layer</LayerPickerLabel>
        <LayerPicker value={layer} onChange={changeLayer} />
      </div>
      <DateControl layer={layer} state={dateState} requested={requestedDate} onChange={changeDate} />
      <LayerInfoCard layer={layer} />
      <AreasPanel layer={layer} date={dateState.date} dateReady={dateReady} onZoomTo={zoomToArea} />
    </>
  );

  const overlay = (
    <>
      <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-3 lg:left-4 lg:right-4">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <div className="pointer-events-auto w-full max-w-sm lg:hidden">
            <PlaceSearch onSelect={select} variant="map" near={workspace.view.center} placeholder="Search any place…" />
          </div>
          <MapStatusPill layer={layer} date={dateState.date} status={tileStatus} className="hidden sm:flex" />
          {selection && <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} className="hidden lg:block" />}
        </div>
        <DrawToolbar
          mode={drawMode}
          onModeChange={setDrawMode}
          vertexCount={vertexCount}
          onFinish={() => setFinishSignal((n) => n + 1)}
          onUndo={() => setUndoSignal((n) => n + 1)}
        />
      </div>
      {selection && (
        <div className="absolute inset-x-3 bottom-20 flex justify-center lg:hidden">
          <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} />
        </div>
      )}
      {isScienceLayer(layer) && (
        <div className="absolute bottom-24 right-3 hidden w-64 sm:block lg:bottom-20">
          <LayerLegend layer={layer} />
        </div>
      )}
    </>
  );

  return (
    <MapPageShell
      eyebrow="NASA GIBS · live satellite layers"
      title="Explore"
      description="Search any place, pick a NASA layer and a date. Click the map to read real values, or draw an area to measure and analyze it."
      sidebar={sidebar}
      overlay={overlay}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
    >
      <BaseMap initialView={initialView} onViewChange={onViewChange}>
        <LayerStack layer={layer} date={dateState.date} onStatus={setTileStatus} />
        <ReferenceOverlays />
        <AreasLayer areas={workspace.areas} activeId={workspace.activeAreaId} onSelect={workspace.setActiveAreaId} interactive={!drawMode} />
        {selection && <PlaceOutline place={selection.place} geometry={selection.geometry} />}
        <DrawTools
          mode={drawMode}
          onComplete={onAreaComplete}
          onCancel={() => setDrawMode(null)}
          finishSignal={finishSignal}
          undoSignal={undoSignal}
          onVertexCount={setVertexCount}
        />
        <ValueProbe layers={[{ layer, date: dateState.date }]} disabled={Boolean(drawMode)} />
        <FlyTo target={flyTarget} />
      </BaseMap>
    </MapPageShell>
  );
}

