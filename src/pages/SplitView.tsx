import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftRight, Info } from "lucide-react";
import { Pane } from "react-leaflet";
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
import SwipeClip from "@/components/map/SwipeClip";
import LayerPicker, { LayerPickerLabel } from "@/components/map/LayerPicker";
import DateControl from "@/components/map/DateControl";
import AreasPanel from "@/components/map/AreasPanel";
import SelectedPlaceCard from "@/components/map/SelectedPlaceCard";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import QuickRegions, { type QuickRegion } from "@/components/map/QuickRegions";
import LayerLegend from "@/components/map/LayerLegend";
import { CoordsPill, CursorTracker } from "@/components/map/CursorCoords";
import { useWorkspace, type AreaKind, type SavedArea } from "@/context/WorkspaceContext";
import { useLayerDate } from "@/hooks/useLayerDate";
import { usePlaceSelection } from "@/hooks/usePlaceSelection";
import { useRouteFocusPlace } from "@/hooks/useRouteFocusPlace";
import { DEFAULT_COMPARE_LAYER_ID, DEFAULT_LAYER_ID, getLayerOrDefault, isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate, isIsoDate } from "@/lib/gibs/time";
import { formatArea, type LatLng, type PolygonGeometry } from "@/lib/geo/geometry";
import { analysisHrefForArea } from "@/lib/links";

export default function SplitView() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [initialView] = useState(() => workspace.view);
  const leftLayer = useMemo(() => getLayerOrDefault(params.get("left"), DEFAULT_LAYER_ID), [params]);
  const rightLayer = useMemo(() => getLayerOrDefault(params.get("right"), DEFAULT_COMPARE_LAYER_ID), [params]);
  const leftRequested = isIsoDate(params.get("leftDate")) ? (params.get("leftDate") as string) : null;
  const rightRequested = isIsoDate(params.get("rightDate")) ? (params.get("rightDate") as string) : null;
  const leftDate = useLayerDate(leftLayer, leftRequested);
  const rightDate = useLayerDate(rightLayer, rightRequested);
  const [ratio, setRatio] = useState(0.5);
  const [panelOpen, setPanelOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<LatLng>(() => workspace.view.center);
  const { selection, select, clear, flyTarget, flyTo } = usePlaceSelection();
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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

  const swap = () =>
    update({
      left: rightLayer.id,
      right: leftLayer.id,
      leftDate: rightRequested,
      rightDate: leftRequested,
    });

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

  const setRatioFromClientX = (clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setRatio(Math.min(0.98, Math.max(0.02, (clientX - rect.left) / rect.width)));
  };

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) setRatioFromClientX(event.clientX);
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setRatio((r) => Math.max(0.02, r - 0.05));
    if (event.key === "ArrowRight") setRatio((r) => Math.min(0.98, r + 0.05));
  };

  const jumpToRegion = (region: QuickRegion) => {
    setRegionId(region.id);
    setPanelOpen(false);
    flyTo({ center: region.center, zoom: region.zoom });
  };

  const sidebar = (
    <>
      <SidebarSection>
        <LayerPickerLabel>Left layer</LayerPickerLabel>
        <LayerPicker value={leftLayer} onChange={(layer: GibsLayer) => update({ left: layer.id })} label="Left layer" />
      </SidebarSection>
      <SidebarSection>
        <DateControl layer={leftLayer} state={leftDate} requested={leftRequested} onChange={(date) => update({ leftDate: date })} label="Left date" />
      </SidebarSection>
      {isScienceLayer(leftLayer) && (
        <SidebarSection title="Left legend" icon={<Info className="h-4 w-4 text-accent-cyan" />}>
          <div className="rounded-xl border border-panel-line bg-panel-tint p-4">
            <LayerLegend layer={leftLayer} compact />
          </div>
        </SidebarSection>
      )}

      <div className="mb-5 border-t border-panel-line" />

      <SidebarSection>
        <LayerPickerLabel>Right layer</LayerPickerLabel>
        <LayerPicker value={rightLayer} onChange={(layer: GibsLayer) => update({ right: layer.id })} label="Right layer" />
      </SidebarSection>
      <SidebarSection>
        <DateControl layer={rightLayer} state={rightDate} requested={rightRequested} onChange={(date) => update({ rightDate: date })} label="Right date" />
      </SidebarSection>
      {isScienceLayer(rightLayer) && (
        <SidebarSection title="Right legend" icon={<Info className="h-4 w-4 text-accent-cyan" />}>
          <div className="rounded-xl border border-panel-line bg-panel-tint p-4">
            <LayerLegend layer={rightLayer} compact />
          </div>
        </SidebarSection>
      )}

      <button
        type="button"
        onClick={swap}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-panel-line bg-panel-tint px-4 py-3 text-sm font-medium text-panel-soft transition hover:border-cyan-400/40 hover:text-panel-foreground"
      >
        <ArrowLeftRight className="h-4 w-4 text-accent-cyan" /> Swap sides
      </button>

      <QuickRegions activeId={regionId} onSelect={jumpToRegion} />
      <AreasPanel layer={rightLayer} date={rightDate.date} dateReady={!rightDate.loading} onZoomTo={(area: SavedArea) => flyTo({ bbox: area.bbox })} />

      <section className="mt-auto rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-panel-foreground">
          <Info className="h-4 w-4 shrink-0 text-accent-cyan" /> {leftLayer.name} vs {rightLayer.name}
        </div>
        <p className="text-xs leading-relaxed text-panel-muted">
          Drag the slider to compare the two layers. Tip: pick the same layer on both sides with two different dates to see change over time — floods, fires, harvests or snow melt.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded bg-panel-tint-strong px-2 py-1 text-panel-soft">{leftLayer.source}</span>
          <span className="rounded bg-panel-tint-strong px-2 py-1 text-panel-soft">{rightLayer.source}</span>
        </div>
      </section>
    </>
  );

  const overlay = (
    <>
      <div className="pointer-events-auto absolute left-1/2 top-[3.75rem] flex -translate-x-1/2 items-center gap-3 rounded-full border border-panel-line bg-panel/90 px-4 py-2 shadow-xl backdrop-blur">
        <span className="text-xs text-panel-muted">Compare</span>
        <input
          type="range"
          min={2}
          max={98}
          value={Math.round(ratio * 100)}
          onChange={(event) => setRatio(Number(event.target.value) / 100)}
          className="w-24 accent-cyan-400 sm:w-32"
          aria-label="Comparison position"
        />
        <span className="w-10 text-xs font-medium text-panel-foreground">{Math.round(ratio * 100)}%</span>
      </div>
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
          <div className="pointer-events-auto absolute left-16 top-[7rem] hidden lg:block">
            <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} />
          </div>
          <div className="pointer-events-auto absolute inset-x-3 bottom-20 flex justify-center lg:hidden">
            <SelectedPlaceCard selection={selection} onClose={clear} onSave={saveSelection} />
          </div>
        </>
      )}
      {isScienceLayer(leftLayer) && (
        <div className="absolute bottom-24 left-4 hidden xl:block">
          <LayerLegend layer={leftLayer} />
        </div>
      )}
      {isScienceLayer(rightLayer) && (
        <div className="absolute bottom-24 right-4 hidden sm:block">
          <LayerLegend layer={rightLayer} />
        </div>
      )}
      <CoordsPill point={cursor} />
    </>
  );

  const sideLabel = (layer: GibsLayer, date: string | null) => `${layer.name}${date ? ` ${formatDate(date)}` : ""}`;

  return (
    <MapPageShell
      title="Split comparison"
      description="Compare two NASA layers — or one layer on two dates — on a single map with a draggable slider. Draw areas to measure and analyze them."
      sidebar={sidebar}
      topRight={
        <div className="hidden max-w-[22rem] truncate rounded-lg border border-panel-line bg-panel/85 px-3 py-2 text-[11px] text-panel-muted backdrop-blur md:block">
          {sideLabel(leftLayer, leftDate.date)} vs {sideLabel(rightLayer, rightDate.date)}
        </div>
      }
      overlay={overlay}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
    >
      <div ref={stageRef} className="absolute inset-0">
        <BaseMap initialView={initialView} onViewChange={workspace.setView}>
          <Pane name="compare-left" style={{ zIndex: 210 }}>
            <LayerStack layer={leftLayer} date={leftDate.date} />
          </Pane>
          <Pane name="compare-right" style={{ zIndex: 220 }}>
            <LayerStack layer={rightLayer} date={rightDate.date} />
          </Pane>
          <SwipeClip leftPane="compare-left" rightPane="compare-right" ratio={ratio} />
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
          <ValueProbe
            layers={[
              { layer: leftLayer, date: leftDate.date },
              ...(rightLayer.id !== leftLayer.id || rightDate.date !== leftDate.date ? [{ layer: rightLayer, date: rightDate.date }] : []),
            ]}
            disabled={Boolean(drawMode)}
          />
          <FlyTo target={flyTarget} />
          <CursorTracker onChange={setCursor} />
          <ZoomLimit layers={[leftLayer, rightLayer]} />
        </BaseMap>
        <div className="pointer-events-none absolute inset-y-0 z-[900]" style={{ left: `${ratio * 100}%` }}>
          <div className="absolute inset-y-0 -left-0.5 w-1 bg-cyan-400/70 shadow-lg shadow-cyan-500/40" />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Comparison divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onKeyDown={onHandleKey}
            className="pointer-events-auto absolute top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-col-resize touch-none items-center justify-center rounded-full border-2 border-cyan-400 bg-panel/90 backdrop-blur outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <span className="text-lg text-accent-cyan-soft" aria-hidden="true">
              ⟷
            </span>
          </div>
        </div>
      </div>
    </MapPageShell>
  );
}
