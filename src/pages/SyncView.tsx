import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Link2, Link2Off, Search } from "lucide-react";
import type { LeafletEvent, Map as LeafletMap, ZoomAnimEvent } from "leaflet";
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
import PlaceSearch from "@/components/search/PlaceSearch";
import { useWorkspace, type AreaKind, type SavedArea } from "@/context/WorkspaceContext";
import { useLayerDate } from "@/hooks/useLayerDate";
import { usePlaceSelection } from "@/hooks/usePlaceSelection";
import { useRouteFocusPlace } from "@/hooks/useRouteFocusPlace";
import { DEFAULT_COMPARE_LAYER_ID, DEFAULT_LAYER_ID, getLayerOrDefault, isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate, isIsoDate } from "@/lib/gibs/time";
import { formatArea, type PolygonGeometry } from "@/lib/geo/geometry";
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

  const sidebar = (
    <>
      <SidebarSection title="Search" icon={<Search className="h-3.5 w-3.5 text-primary" />}>
        <PlaceSearch onSelect={select} near={workspace.view.center} />
      </SidebarSection>
      <div className="space-y-3 rounded-2xl border border-border/60 bg-secondary/20 p-3.5">
        <LayerPickerLabel>Left map</LayerPickerLabel>
        <LayerPicker value={leftLayer} onChange={(layer: GibsLayer) => update({ left: layer.id })} label="Left layer" />
        <DateControl
          layer={leftLayer}
          state={leftDate}
          requested={leftRequested}
          onChange={(date) => update({ leftDate: date })}
          label={linkDates ? "Date (both maps)" : "Left date"}
        />
      </div>
      <button
        type="button"
        onClick={() => update(linkDates ? { link: "0", rightDate: leftRequested } : { link: null, rightDate: null })}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold transition",
          linkDates ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-secondary/30 text-foreground/85 hover:text-foreground",
        )}
        aria-pressed={linkDates}
      >
        {linkDates ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
        {linkDates ? "Dates linked — click to set them separately" : "Dates independent — click to link"}
      </button>
      <div className="space-y-3 rounded-2xl border border-border/60 bg-secondary/20 p-3.5">
        <LayerPickerLabel>Right map</LayerPickerLabel>
        <LayerPicker value={rightLayer} onChange={(layer: GibsLayer) => update({ right: layer.id })} label="Right layer" />
        {!linkDates && <DateControl layer={rightLayer} state={rightDate} requested={rightRequested} onChange={(date) => update({ rightDate: date })} label="Right date" />}
        {linkDates && rightDate.date && rightDate.date !== leftDate.date && (
          <p className="text-xs text-muted-foreground">This product publishes on its own schedule — showing {formatDate(rightDate.date)}.</p>
        )}
      </div>
      <AreasPanel layer={isScienceLayer(rightLayer) ? rightLayer : leftLayer} date={isScienceLayer(rightLayer) ? rightDate.date : leftDate.date} dateReady={!rightDate.loading && !leftDate.loading} onZoomTo={zoomToArea} />
    </>
  );

  const label = (layer: GibsLayer, date: string | null, side: "left" | "right") => (
    <div
      className={cn(
        "absolute z-[1000] truncate rounded-lg glass-strong px-2.5 py-1.5 text-[11px] text-foreground/85 shadow-lg shadow-black/30",
        "left-3 max-w-[calc(100%-1.5rem)] sm:max-w-[calc(50%-1.5rem)]",
        side === "left" ? "top-3" : "top-[calc(50%+0.75rem)] sm:left-[calc(50%+0.75rem)] sm:top-3",
      )}
    >
      <span className="font-semibold text-foreground">{layer.name}</span> · {layer.source.split(" · ")[0]}
      {date ? ` · ${formatDate(date)}` : ""}
    </div>
  );

  const overlay = (
    <>
      <div className="absolute right-3 top-12 flex flex-col items-end gap-2 lg:right-4">
        <DrawToolbar
          mode={drawMode}
          onModeChange={setDrawMode}
          vertexCount={vertexCount}
          onFinish={() => setFinishSignal((n) => n + 1)}
          onUndo={() => setUndoSignal((n) => n + 1)}
        />
      </div>
      <div className="absolute left-3 top-12 flex max-w-sm flex-col gap-2">
        <div className="pointer-events-auto lg:hidden">
          <PlaceSearch onSelect={select} variant="map" near={workspace.view.center} placeholder="Search any place…" />
        </div>
        {selection && <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} className="hidden lg:block" />}
      </div>
      {selection && (
        <div className="absolute inset-x-3 bottom-20 flex justify-center lg:hidden">
          <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} />
        </div>
      )}
      <div className="absolute bottom-20 left-3 hidden w-56 xl:block">{isScienceLayer(leftLayer) && <LayerLegend layer={leftLayer} compact />}</div>
      <div className="absolute bottom-20 right-3 hidden w-56 xl:block">{isScienceLayer(rightLayer) && <LayerLegend layer={rightLayer} compact />}</div>
    </>
  );

  return (
    <MapPageShell
      eyebrow="Synchronised maps"
      title="Side by side"
      description="Two maps locked together. Pan or zoom either one — the other follows exactly."
      sidebar={sidebar}
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
          </BaseMap>
          {label(leftLayer, leftDate.date, "left")}
        </div>
        <div className="relative min-h-0 min-w-0 border-t-2 border-primary/40 sm:border-l-2 sm:border-t-0">
          <BaseMap initialView={initialView} onReady={setRightMap}>
            <LayerStack layer={rightLayer} date={rightDate.date} />
            <ReferenceOverlays />
            <AreasLayer areas={workspace.areas} activeId={workspace.activeAreaId} onSelect={workspace.setActiveAreaId} interactive={!drawMode} />
            {selection && <PlaceOutline place={selection.place} geometry={selection.geometry} />}
            <DrawTools mode={drawMode} {...drawProps} />
            <ValueProbe layers={[{ layer: rightLayer, date: rightDate.date }]} disabled={Boolean(drawMode)} />
          </BaseMap>
        </div>
        {label(rightLayer, rightDate.date, "right")}
      </div>
    </MapPageShell>
  );
}
