import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftRight, GripVertical, Search } from "lucide-react";
import { Pane } from "react-leaflet";
import BaseMap from "@/components/map/BaseMap";
import LayerStack from "@/components/map/LayerStack";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import AreasLayer from "@/components/map/AreasLayer";
import DrawTools, { type DrawMode } from "@/components/map/DrawTools";
import DrawToolbar from "@/components/map/DrawToolbar";
import FlyTo from "@/components/map/FlyTo";
import PlaceOutline from "@/components/map/PlaceOutline";
import ValueProbe from "@/components/map/ValueProbe";
import SwipeClip from "@/components/map/SwipeClip";
import LayerPicker, { LayerPickerLabel } from "@/components/map/LayerPicker";
import DateControl from "@/components/map/DateControl";
import AreasPanel from "@/components/map/AreasPanel";
import SelectedPlaceCard from "@/components/map/SelectedPlaceCard";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import { LayerInfoCard } from "@/components/map/LayerInfo";
import PlaceSearch from "@/components/search/PlaceSearch";
import { useWorkspace, type AreaKind, type SavedArea } from "@/context/WorkspaceContext";
import { useLayerDate } from "@/hooks/useLayerDate";
import { usePlaceSelection } from "@/hooks/usePlaceSelection";
import { useRouteFocusPlace } from "@/hooks/useRouteFocusPlace";
import { DEFAULT_COMPARE_LAYER_ID, DEFAULT_LAYER_ID, getLayerOrDefault, type GibsLayer } from "@/lib/gibs/catalog";
import { formatDate, isIsoDate } from "@/lib/gibs/time";
import { formatArea, type PolygonGeometry } from "@/lib/geo/geometry";
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

  const sidebar = (
    <>
      <SidebarSection title="Search" icon={<Search className="h-3.5 w-3.5 text-primary" />}>
        <PlaceSearch onSelect={select} near={workspace.view.center} />
      </SidebarSection>
      <div className="space-y-3 rounded-2xl border border-white/10 p-3.5">
        <LayerPickerLabel>Left side</LayerPickerLabel>
        <LayerPicker value={leftLayer} onChange={(layer: GibsLayer) => update({ left: layer.id })} label="Left layer" />
        <DateControl layer={leftLayer} state={leftDate} requested={leftRequested} onChange={(date) => update({ leftDate: date })} label="Left date" />
      </div>
      <button
        type="button"
        onClick={swap}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2 text-xs font-semibold text-slate-300 transition hover:border-primary/40 hover:text-white"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" /> Swap sides
      </button>
      <div className="space-y-3 rounded-2xl border border-white/10 p-3.5">
        <LayerPickerLabel>Right side</LayerPickerLabel>
        <LayerPicker value={rightLayer} onChange={(layer: GibsLayer) => update({ right: layer.id })} label="Right layer" />
        <DateControl layer={rightLayer} state={rightDate} requested={rightRequested} onChange={(date) => update({ rightDate: date })} label="Right date" />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Tip: pick the same layer on both sides with two different dates to see change over time — floods, fires, harvests or snow melt.
      </p>
      <LayerInfoCard layer={rightLayer} />
      <AreasPanel layer={rightLayer} date={rightDate.date} dateReady={!rightDate.loading} onZoomTo={(area: SavedArea) => flyTo({ bbox: area.bbox })} />
    </>
  );

  const overlay = (
    <>
      <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-3 lg:left-4 lg:right-4">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <div className="pointer-events-auto w-full max-w-sm lg:hidden">
            <PlaceSearch onSelect={select} variant="map" near={workspace.view.center} placeholder="Search any place…" />
          </div>
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
      <div className="absolute bottom-[4.75rem] left-3 hidden max-w-[45%] rounded-lg border border-white/10 bg-[#07111d]/85 px-2.5 py-1.5 text-[11px] text-slate-300 backdrop-blur sm:block">
        ◀ <span className="font-semibold text-white">{leftLayer.name}</span> · {leftLayer.source.split(" · ")[0]}
        {leftDate.date ? ` · ${formatDate(leftDate.date)}` : ""}
      </div>
      <div className="absolute bottom-[4.75rem] right-3 hidden max-w-[45%] rounded-lg border border-white/10 bg-[#07111d]/85 px-2.5 py-1.5 text-right text-[11px] text-slate-300 backdrop-blur sm:block">
        <span className="font-semibold text-white">{rightLayer.name}</span> · {rightLayer.source.split(" · ")[0]}
        {rightDate.date ? ` · ${formatDate(rightDate.date)}` : ""} ▶
      </div>
    </>
  );

  return (
    <MapPageShell
      eyebrow="Swipe comparison"
      title="Compare"
      description="Two NASA layers or two dates on one map. Drag the divider to reveal what changed."
      sidebar={sidebar}
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
        </BaseMap>
        <div className="pointer-events-none absolute inset-y-0 z-[900]" style={{ left: `${ratio * 100}%` }}>
          <div className="absolute inset-y-0 -left-px w-0.5 bg-primary/80 shadow-[0_0_12px_rgba(45,212,191,0.6)]" />
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
            className="pointer-events-auto absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border-2 border-primary bg-[#07111d]/95 text-primary shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <GripVertical className="h-5 w-5" />
          </div>
        </div>
      </div>
    </MapPageShell>
  );
}
