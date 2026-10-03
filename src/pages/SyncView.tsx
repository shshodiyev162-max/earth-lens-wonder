import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Info, Link2, Link2Off } from "lucide-react";
import type { LeafletEvent, Map as LeafletMap, ZoomAnimEvent } from "leaflet";
import BaseMap from "@/components/map/BaseMap";
import LayerStack from "@/components/map/LayerStack";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import AreasLayer from "@/components/map/AreasLayer";
import DrawTools, { type DrawMode } from "@/components/map/DrawTools";
import DrawToolbar from "@/components/map/DrawToolbar";
import FlyTo from "@/components/map/FlyTo";
import ZoomLimit from "@/components/map/ZoomLimit";
import PlaceOutline from "@/components/map/PlaceOutline";
import ValueProbe from "@/components/map/ValueProbe";
import LayerPicker, { LayerPickerLabel } from "@/components/map/LayerPicker";
import DateControl from "@/components/map/DateControl";
import AreasPanel from "@/components/map/AreasPanel";
import SelectedPlaceCard from "@/components/map/SelectedPlaceCard";
import LayerLegend from "@/components/map/LayerLegend";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import QuickRegions, { type QuickRegion } from "@/components/map/QuickRegions";
import { CoordsPill, CursorTracker } from "@/components/map/CursorCoords";
import { useWorkspace, type AreaKind, type SavedArea } from "@/context/WorkspaceContext";
import { useLayerDate } from "@/hooks/useLayerDate";
import { usePlaceSelection } from "@/hooks/usePlaceSelection";
import { useRouteFocusPlace } from "@/hooks/useRouteFocusPlace";
import { DEFAULT_COMPARE_LAYER_ID, DEFAULT_LAYER_ID, getLayerOrDefault, isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate, isIsoDate } from "@/lib/gibs/time";
import { formatArea, type LatLng, type PolygonGeometry } from "@/lib/geo/geometry";
import { analysisHrefForArea } from "@/lib/links";
import { cn } from "@/lib/utils";

/** Keeps two Leaflet maps in lock-step (pan, zoom and zoom animation). */
function useLinkedMaps(a: LeafletMap | null, b: LeafletMap | null) {
  useEffect(() => {
    if (!a || !b) return;
    let locked = false;
    const link = (source: LeafletMap, target: LeafletMap) => {
      const onMove = () => {
        if (locked) return;
        const animating = (source as unknown as { _animatingZoom?: boolean })._animatingZoom || (target as unknown as { _animatingZoom?: boolean })._animatingZoom;
        if (animating) return;
        locked = true;
        target.setView(source.getCenter(), source.getZoom(), { animate: false });
        locked = false;
      };
      const onZoomAnim = (event: LeafletEvent) => {
        if (locked) return;
        const { center, zoom } = event as ZoomAnimEvent;
        locked = true;
        target.setView(center, zoom, { animate: true });
        locked = false;
      };
      source.on("move", onMove);
      source.on("moveend", onMove);
      source.on("zoomanim", onZoomAnim);
      return () => {
        source.off("move", onMove);
        source.off("moveend", onMove);
        source.off("zoomanim", onZoomAnim);
      };
    };
    b.setView(a.getCenter(), a.getZoom(), { animate: false });
    const unlinkAB = link(a, b);
    const unlinkBA = link(b, a);
    return () => {
      unlinkAB();
      unlinkBA();
    };
  }, [a, b]);
}

export default function SyncView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [initialView] = useState(() => workspace.view);
  const [leftMap, setLeftMap] = useState<LeafletMap | null>(null);
  const [rightMap, setRightMap] = useState<LeafletMap | null>(null);
  const leftLayer = useMemo(() => getLayerOrDefault(params.get("left"), DEFAULT_LAYER_ID), [params]);
  const rightLayer = useMemo(() => getLayerOrDefault(params.get("right"), DEFAULT_COMPARE_LAYER_ID), [params]);
  const linkDates = params.get("link") !== "0";
  const leftRequested = isIsoDate(params.get("leftDate")) ? (params.get("leftDate") as string) : null;
  const rightRequested = linkDates ? leftRequested : isIsoDate(params.get("rightDate")) ? (params.get("rightDate") as string) : null;
  const leftDate = useLayerDate(leftLayer, leftRequested);
  const rightDate = useLayerDate(rightLayer, rightRequested);
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<LatLng>(() => workspace.view.center);
  const left = usePlaceSelection();
  const { selection, select, clear } = left;

  useLinkedMaps(leftMap, rightMap);
  useRouteFocusPlace(select);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const onAreaComplete = (geometry: PolygonGeometry, kind: AreaKind) => {
    setDrawMode(null);
    const area = workspace.addArea({ geometry, kind });
    toast.success(`${area.name} saved`, {
      description: formatArea(area.areaKm2),
      action: { label: "Analyze", onClick: () => navigate(analysisHrefForArea(area.id)) },
    });
  };

  const saveSelection = () => {
    if (!selection?.geometry) return;
    const area = workspace.addArea({ geometry: selection.geometry, kind: "place", name: selection.place.name });
    toast.success(`${area.name} saved to your areas`, { description: formatArea(area.areaKm2) });
  };

  const zoomToArea = (area: SavedArea) => left.flyTo({ bbox: area.bbox });

  const drawProps = {
    onComplete: onAreaComplete,
    onCancel: () => setDrawMode(null),
    finishSignal,
    undoSignal,
    onVertexCount: setVertexCount,
  };

  const jumpToRegion = (region: QuickRegion) => {
    setRegionId(region.id);
    setPanelOpen(false);
    left.flyTo({ center: region.center, zoom: region.zoom });
  };

  const sidebar = (
    <>
      <SidebarSection>
        <LayerPickerLabel>Left layer</LayerPickerLabel>
        <LayerPicker value={leftLayer} onChange={(layer: GibsLayer) => update({ left: layer.id })} label="Left layer" />
      </SidebarSection>
      <SidebarSection>
        <LayerPickerLabel>Right layer</LayerPickerLabel>
        <LayerPicker value={rightLayer} onChange={(layer: GibsLayer) => update({ right: layer.id })} label="Right layer" />
      </SidebarSection>
      <SidebarSection>
        <DateControl
          layer={leftLayer}
          state={leftDate}
          requested={leftRequested}
          onChange={(date) => update({ leftDate: date })}
          label={linkDates ? "Observation date" : "Left date"}
        />
        {linkDates && rightDate.date && rightDate.date !== leftDate.date && (
          <p className="mt-2 text-xs text-panel-muted">The right layer publishes on its own schedule — showing {formatDate(rightDate.date)}.</p>
        )}
      </SidebarSection>
      {!linkDates && (
        <SidebarSection>
          <DateControl layer={rightLayer} state={rightDate} requested={rightRequested} onChange={(date) => update({ rightDate: date })} label="Right date" />
        </SidebarSection>
      )}
      <button
        type="button"
        onClick={() => update(linkDates ? { link: "0", rightDate: leftRequested } : { link: null, rightDate: null })}
        aria-pressed={linkDates}
        className={cn(
          "mb-5 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition",
          linkDates ? "border-cyan-400/40 bg-cyan-400/10 text-accent-cyan-soft" : "border-panel-line bg-panel-tint text-panel-soft hover:border-cyan-400/40 hover:text-panel-foreground",
        )}
      >
        {linkDates ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
        {linkDates ? "Dates linked — set them separately" : "Dates separate — link them"}
      </button>

      <QuickRegions activeId={regionId} onSelect={jumpToRegion} />
      <AreasPanel layer={isScienceLayer(rightLayer) ? rightLayer : leftLayer} date={isScienceLayer(rightLayer) ? rightDate.date : leftDate.date} dateReady={!rightDate.loading && !leftDate.loading} onZoomTo={zoomToArea} />

      <section className="mt-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-panel-foreground">
          <Info className="h-4 w-4 shrink-0 text-accent-cyan" /> {leftLayer.name} + {rightLayer.name}
        </div>
        <p className="text-xs leading-relaxed text-panel-muted">{leftLayer.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded bg-panel-tint-strong px-2 py-1 text-panel-soft">{leftLayer.source}</span>
          <span className="rounded bg-panel-tint-strong px-2 py-1 text-panel-soft">{rightLayer.source}</span>
        </div>
      </section>
    </>
  );

  // On phones the two maps are stacked, so each gets a small name tag.
  const phoneLabel = (layer: GibsLayer, date: string | null, side: "left" | "right") => (
    <div
      className={cn(
        "absolute left-3 z-[1000] max-w-[calc(100%-1.5rem)] truncate rounded-lg border border-panel-line bg-panel/85 px-3 py-1.5 text-[11px] text-panel-soft backdrop-blur sm:hidden",
        side === "left" ? "bottom-3" : "bottom-20",
      )}
    >
      <span className="font-semibold text-panel-foreground">{layer.name}</span>
      {date ? ` · ${formatDate(date)}` : ""}
    </div>
  );

  const overlay = (
    <>
      <div className="absolute right-3 top-[3.75rem] lg:right-5">
        <DrawToolbar
          mode={drawMode}
          onModeChange={setDrawMode}
          vertexCount={vertexCount}
          onFinish={() => setFinishSignal((n) => n + 1)}
          onUndo={() => setUndoSignal((n) => n + 1)}
        />
      </div>
      {selection && (
        <>
          <div className="pointer-events-auto absolute left-5 top-[3.75rem] hidden lg:block">
            <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} />
          </div>
          <div className="pointer-events-auto absolute inset-x-3 bottom-20 flex justify-center lg:hidden">
            <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} />
          </div>
        </>
      )}
      {isScienceLayer(leftLayer) && (
        <div className="absolute bottom-20 left-4 hidden sm:block">
          <LayerLegend layer={leftLayer} />
        </div>
      )}
      {isScienceLayer(rightLayer) && (
        <div className="absolute bottom-20 left-[calc(50%+1rem)] hidden sm:block">
          <LayerLegend layer={rightLayer} />
        </div>
      )}
      <CoordsPill point={cursor} />
    </>
  );

  return (
    <MapPageShell
      title="Synced maps"
      description="Two NASA layers in lockstep. Pan, zoom, or jump to a quick region — both views stay perfectly in sync."
      sidebar={sidebar}
      topRight={
        <div className="hidden max-w-[22rem] truncate rounded-lg border border-panel-line bg-panel/85 px-3 py-2 text-[11px] text-panel-muted backdrop-blur md:block">
          {leftLayer.name} + {rightLayer.name}
        </div>
      }
      overlay={overlay}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
    >
      <div className="absolute inset-0 grid grid-rows-2 sm:grid-cols-2 sm:grid-rows-1">
        <div className="relative min-h-0 min-w-0">
          <BaseMap initialView={initialView} onViewChange={workspace.setView} onReady={setLeftMap} zoomControl={false} attribution={false}>
            <LayerStack layer={leftLayer} date={leftDate.date} />
            <ReferenceOverlays />
            <AreasLayer areas={workspace.areas} activeId={workspace.activeAreaId} onSelect={workspace.setActiveAreaId} interactive={!drawMode} />
            {selection && <PlaceOutline place={selection.place} geometry={selection.geometry} />}
            <DrawTools mode={drawMode} {...drawProps} />
            <ValueProbe layers={[{ layer: leftLayer, date: leftDate.date }]} disabled={Boolean(drawMode)} />
            <FlyTo target={left.flyTarget} />
            <CursorTracker onChange={setCursor} />
            <ZoomLimit layers={[leftLayer, rightLayer]} />
          </BaseMap>
          {phoneLabel(leftLayer, leftDate.date, "left")}
        </div>
        <div className="relative min-h-0 min-w-0 border-t border-panel-line-strong sm:border-l sm:border-t-0">
          <BaseMap initialView={initialView} onReady={setRightMap}>
            <LayerStack layer={rightLayer} date={rightDate.date} />
            <ReferenceOverlays />
            <AreasLayer areas={workspace.areas} activeId={workspace.activeAreaId} onSelect={workspace.setActiveAreaId} interactive={!drawMode} />
            {selection && <PlaceOutline place={selection.place} geometry={selection.geometry} />}
            <DrawTools mode={drawMode} {...drawProps} />
            <ValueProbe layers={[{ layer: rightLayer, date: rightDate.date }]} disabled={Boolean(drawMode)} />
            <CursorTracker onChange={setCursor} />
            <ZoomLimit layers={[leftLayer, rightLayer]} />
          </BaseMap>
          {phoneLabel(rightLayer, rightDate.date, "right")}
        </div>
      </div>
    </MapPageShell>
  );
}
