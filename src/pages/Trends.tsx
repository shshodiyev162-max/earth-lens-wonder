import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { demoAttr, demoById, DEMOS } from "@/lib/demo/scripts";
import DemoPlayer, { type DemoControls } from "@/components/demo/DemoPlayer";
import { useSearchParams } from "react-router-dom";
import { GeoJSON, Pane, useMapEvents } from "react-leaflet";
import type { Feature } from "geojson";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RefreshCw, ScanSearch, X } from "lucide-react";
import AreasLayer from "@/components/map/AreasLayer";
import BaseMap from "@/components/map/BaseMap";
import DrawTools, { type DrawMode, type PickedPlace } from "@/components/map/DrawTools";
import DrawToolbar, { DrawHint } from "@/components/map/DrawToolbar";
import GibsTileLayer from "@/components/map/GibsTileLayer";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import FlyTo, { type FlyTarget } from "@/components/map/FlyTo";
import LayerLegend from "@/components/map/LayerLegend";
import MapPageShell from "@/components/map/MapPageShell";
import AreaPicker from "@/components/trends/AreaPicker";
import AreaSummaryCard from "@/components/trends/AreaSummaryCard";
import AreaCoverCard from "@/components/trends/AreaCoverCard";
import { useLandCover } from "@/hooks/useLandCover";
import { suggestMeasures } from "@/lib/trends/landcover";
import Glossary from "@/components/common/Glossary";
import { MEASURE_DEFINITIONS } from "@/lib/glossary";
import GridImageLayer from "@/components/trends/GridImageLayer";
import HotspotLayer from "@/components/trends/HotspotLayer";
import HotspotList from "@/components/trends/HotspotList";
import HotspotCard from "@/components/trends/HotspotCard";
import MeasureTabs from "@/components/trends/MeasureTabs";
import ResultFilters from "@/components/trends/ResultFilters";
import TrendForm from "@/components/trends/TrendForm";
import TrendLegend from "@/components/trends/TrendLegend";
import TimeAnimator from "@/components/trends/TimeAnimator";
import { useFrames, type FrameMode } from "@/hooks/useFrames";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import { useExactAreaGeometry } from "@/hooks/useExactAreaGeometry";
import { usePlaceArea } from "@/hooks/usePlaceArea";
import { useResolvedParts } from "@/hooks/useResolvedParts";
import { partKey, partLabel, savedAreaPart, togglePart, type AreaPart } from "@/lib/areas/parts";
import { combineGeometries, combinedAreaKm2, combinedName } from "@/lib/geo/combine";
import { gridBudget, useTrendScans } from "@/hooks/useTrendScans";
import { defaultEndMonth } from "@/lib/analysis/period";
import { longerPeriodHint } from "@/lib/analysis/trend";
import { areaKm2, bboxOf, centroidOf, type BBox, type PolygonGeometry } from "@/lib/geo/geometry";
import { encodeGeometryForLink } from "@/lib/geo/polyline";
import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { initialViewFrom } from "@/lib/mapView";
import { INDICATOR_ORDER, INDICATORS, monthsLabel, SEASONS, type IndicatorId } from "@/lib/query/indicators";
import { DEFAULT_YEARS } from "@/lib/query/period";
import { clearOfHotspotCard } from "@/lib/trends/cardRoom";
import { PIXEL_SIGNIFICANCE, STRICT_P } from "@/lib/trends/hotspots";
import {
  analysisHref,
  applyEdit,
  areaAnalysisHref,
  compareHref,
  DEFAULT_FILTER,
  editForParts,
  filterFor,
  hotspotTitle,
  paramsFor,
  queryFromParams,
  resultsHeading,
  scanKey,
  seasonAverage,
  seasonDescription,
  trendParts,
  type QueryEdit,
  type ResultFilter,
  type TrendQuery,
} from "@/lib/trends/query";
import { changeImage, changeScale } from "@/lib/trends/render";
import { rebuildHotspots, summarizeArea, type HotspotDetail } from "@/lib/trends/scan";
import { cn } from "@/lib/utils";

/** Reports the map's current bounds (for searches that name no place). */
function BoundsTracker({ onChange }: { onChange: (bbox: BBox) => void }) {
  const map = useMapEvents({
    moveend: () => report(),
  });
  const report = () => {
    const b = map.getBounds();
    onChange([Math.max(-180, b.getWest()), Math.max(-85, b.getSouth()), Math.min(180, b.getEast()), Math.min(85, b.getNorth())]);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => report(), []);
  return null;
}

/** The area chosen on the map, outlined before (and while) it is scanned. */
function ChosenAreaLayer({ geometry }: { geometry: PolygonGeometry }) {
  return (
    <Pane name="trend-chosen-area" style={{ zIndex: 426, pointerEvents: "none" }}>
      <GeoJSON
        key={JSON.stringify(geometry).length}
        data={{ type: "Feature", properties: {}, geometry } as Feature}
        interactive={false}
        style={{ color: "#ffffff", weight: 2.5, opacity: 0.95, dashArray: "7 5", fillColor: "#ffffff", fillOpacity: 0.14 }}
      />
    </Pane>
  );
}

const base = getLayer(BASE_LAYER_ID) as GibsLayer;
const FIRST_YEAR = 2000;
const LAST_YEAR = Number(defaultEndMonth().slice(0, 4)) - 1;

/** "30 s – 2 min": NASA's map service answers in 0.4–1.5 s per map with six at a time. */
function timeRange(maps: number): string {
  const format = (seconds: number) => (seconds < 90 ? `${Math.max(5, Math.round(seconds / 5) * 5)} s` : `${Math.round(seconds / 60)} min`);
  return `about ${format(maps * 0.4)} – ${format(maps * 1.5)}`;
}

/** A rough count of the monthly maps a search will read, before NASA's record is checked. */
function estimateMaps(query: TrendQuery): number {
  const t = query.time;
  const years = t.kind === "versus" ? 2 : t.kind === "since" ? LAST_YEAR - t.start + 1 : t.kind === "range" ? t.end - t.start + 1 : t.kind === "last" ? t.years : t.kind === "year" ? 11 : DEFAULT_YEARS;
  const budget = gridBudget(query.indicators.length);
  return query.indicators.reduce((sum, id) => {
    const months = query.months?.length ?? SEASONS[query.season ?? INDICATORS[id].season].months.length;
    return sum + Math.min(budget, Math.max(1, years) * months);
  }, 0);
}

export default function Trends() {
  const [params, setParams] = useSearchParams();
  const workspace = useWorkspace();
  const [initialView] = useState(() => initialViewFrom(params, workspace.view));
  /** The choices as they stand (they are the page address). A fresh page starts from an empty form. */
  const draft = useMemo(() => queryFromParams(params), [params]);
  /** The choices the results were found for. */
  const [applied, setApplied] = useState<TrendQuery | null>(() => (draft?.understood ? draft : null));
  const [mapBounds, setMapBounds] = useState<BBox | null>(null);
  const [scanView, setScanView] = useState<BBox | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  /** The panel shows the form until a search runs, then the results; "Change search" brings the form back. */
  const [formOpen, setFormOpen] = useState(!applied);
  /** A worked example being played ("choose" shows the list). Started with ?demo=… or the Demo button. */
  const [demo, setDemo] = useState<string | null>(() => params.get("demo"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"change" | "frames">("change");
  const [frameMode, setFrameMode] = useState<FrameMode>("yearly");
  const [frameIndex, setFrameIndex] = useState(0);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const panelId = useId();
  const exactGeometry = useExactAreaGeometry(draft?.area ?? null);
  // A typed, listed or clicked place (a sea, a region, a city…) is found straight away, so it is
  // outlined and described before anything is scanned.
  const placeArea = usePlaceArea(draft && !draft.area ? draft.place : null, Boolean(draft?.near));
  const firstGeometry = exactGeometry ?? placeArea.area?.geometry ?? null;
  // Places added to the chosen one: outlined with it, and read with it as one area.
  const added = useResolvedParts(draft.extra);
  const addedGeometries = useMemo(() => added.parts.flatMap((part) => (part ? [part.geometry] : [])), [added.parts]);
  const chosenGeometry = useMemo(
    () => (firstGeometry && addedGeometries.length ? combineGeometries([firstGeometry, ...addedGeometries]) : firstGeometry),
    [firstGeometry, addedGeometries],
  );
  const parts = useMemo(() => trendParts(draft), [draft]);
  const hasPlace = parts.length > 0;
  /** While on, each place picked joins the chosen area instead of replacing it. */
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!hasPlace) setAdding(false);
  }, [hasPlace]);
  const partRows = useMemo(
    () =>
      parts.map((part, index) => {
        if (index === 0) return { key: partKey(part), label: draft.area?.name ?? placeArea.area?.name ?? partLabel(part), areaKm2: firstGeometry ? areaKm2(firstGeometry) : undefined };
        const loaded = added.parts[index - 1];
        return { key: partKey(part), label: loaded?.name ?? partLabel(part), areaKm2: loaded?.areaKm2 };
      }),
    [parts, draft.area, placeArea.area, firstGeometry, added.parts],
  );
  /** The places scanned, for the link to Analysis: a country typed by name goes by its code. */
  const linkParts = useMemo(() => {
    const list = applied ? trendParts(applied) : [];
    const found = placeArea.area;
    if (list[0]?.kind === "place" && found?.countryId && applied?.place === draft.place) list[0] = { kind: "country", id: found.countryId, name: found.name };
    return list;
  }, [applied, draft.place, placeArea.area]);
  const togetherKm2 = useMemo(
    () => (firstGeometry && parts.length > 1 && addedGeometries.length === parts.length - 1 ? combinedAreaKm2([firstGeometry, ...addedGeometries]) : undefined),
    [firstGeometry, addedGeometries, parts.length],
  );

  // A search without a place scans the map view as it was when the search ran.
  useEffect(() => {
    if (applied && !applied.place && !applied.area && !scanView && mapBounds) setScanView(mapBounds);
  }, [applied, scanView, mapBounds]);

  const scan = useTrendScans(applied, scanView);
  const area = scan.area;
  // The measures being scanned: the chosen ones, or for "what changed" those picked from the place's land cover.
  const scanned = scan.indicators;
  const active: IndicatorId | null = applied ? (draft?.tab && scanned.includes(draft.tab) ? draft.tab : (scanned[0] ?? null)) : null;
  const measure = active ? scan.measures[active] : undefined;
  const result = measure?.result ?? null;
  const plan = measure?.plan ?? null;
  const months = measure?.months ?? [];
  const indicator = active ? INDICATORS[active] : null;
  const filterOf = useCallback(
    (id: IndicatorId): ResultFilter => (draft?.filters[id] ? filterFor(draft, id) : applied?.filters[id] ? filterFor(applied, id) : { direction: "any", ...DEFAULT_FILTER }),
    [draft, applied],
  );
  const filter = active ? filterOf(active) : null;

  // Hotspots for the current filter of every finished measure (re-clustered locally, no new maps).
  const rebuilt = useMemo(() => {
    const out: Partial<Record<IndicatorId, HotspotDetail[]>> = {};
    for (const id of scanned) {
      const done = scan.measures[id]?.result;
      if (done) out[id] = rebuildHotspots(done, filterOf(id));
    }
    return out;
  }, [scanned, scan.measures, filterOf]);
  const counts = useMemo(() => Object.fromEntries(Object.entries(rebuilt).map(([id, list]) => [id, list?.length ?? 0])) as Partial<Record<IndicatorId, number>>, [rebuilt]);
  const activeHotspots = active ? rebuilt[active] : undefined;
  const { requestNames } = scan;
  useEffect(() => {
    if (activeHotspots?.length) requestNames(activeHotspots);
  }, [activeHotspots, requestNames]);
  const hotspots = useMemo(() => (activeHotspots ?? []).map((h) => ({ ...h, label: scan.labels[h.id] ?? h.label })), [activeHotspots, scan.labels]);

  // Fly to the area once it is known, and start fresh with each new result or tab.
  useEffect(() => {
    if (area && area.kind !== "view") setFlyTarget({ bbox: area.bbox, key: `${area.name}|${area.bbox.join(",")}` });
  }, [area]);
  useEffect(() => {
    setSelectedId(null);
    setFrameIndex(0);
  }, [result, active]);

  const dirty = Boolean(draft && (!applied || scanKey(draft) !== scanKey(applied)));

  const edit = useCallback(
    (change: QueryEdit) => {
      const next = paramsFor(applyEdit(draft ?? queryFromParams(new URLSearchParams()), change));
      setParams(next, { replace: true });
    },
    [draft, setParams],
  );

  /** A change to the search itself (not to how results are filtered) goes through the form. */
  const editSearch = useCallback(
    (change: QueryEdit) => {
      setFormOpen(true);
      edit(change);
    },
    [edit],
  );

  /** Drawing needs the map: on phones the panel steps aside until the shape is done. */
  const startDrawing = (mode: DrawMode | null) => {
    setDrawMode(mode);
    setVertexCount(0);
    if (mode && window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(false);
  };

  /** Adds a place to the chosen area, or takes it out when it is already in. */
  const addPart = (part: AreaPart) => editSearch(editForParts(togglePart(trendParts(draft), part)));

  /** Takes one place out (the next one leads when the first goes). */
  const removePart = (index: number) => editSearch(editForParts(trendParts(draft).filter((_, i) => i !== index)));

  const onAreaComplete = (geometry: PolygonGeometry, kind: AreaKind, picked?: PickedPlace) => {
    if (adding && hasPlace) {
      // Countries and seas can be clicked one after another while adding.
      const keepPicking = drawMode === "country";
      if (!keepPicking) setDrawMode(null);
      if (picked?.countryId) addPart({ kind: "country", id: picked.countryId, name: picked.name });
      else if (picked?.region) addPart({ kind: "region", label: picked.region });
      else addPart(savedAreaPart(workspace.addArea({ geometry, kind }), { local: false }));
      if (!keepPicking && window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(true);
      return;
    }
    setDrawMode(null);
    if (picked?.countryId) {
      editSearch({ area: { country: picked.countryId, name: picked.name } });
    } else if (picked?.region) {
      // A sea or ocean: the same as choosing it by name.
      editSearch({ place: picked.region });
    } else {
      // Drawn shapes are kept with your saved areas, so they can be reused here and in Explore and Analysis.
      const saved = workspace.addArea({ geometry, kind });
      editSearch({ area: { poly: encodeGeometryForLink(geometry), name: saved.name } });
    }
    setFlyTarget({ bbox: bboxOf(geometry), key: `chosen-${Date.now()}` });
    if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(true);
  };

  // A place found by search shows its boundary once it arrives.
  const osmId = draft.area?.osm ?? null;
  useEffect(() => {
    if (osmId && exactGeometry) setFlyTarget({ bbox: bboxOf(exactGeometry), key: `osm-${osmId}` });
  }, [osmId, exactGeometry]);

  // Show a place once it is found (the scan's own area, when it arrives, is the same place).
  useEffect(() => {
    const found = placeArea.area;
    if (found) setFlyTarget({ bbox: found.bbox, key: `${found.name}|${found.bbox.join(",")}` });
  }, [placeArea.area]);

  const pickSavedArea = (id: string) => {
    const area = workspace.getArea(id);
    if (area && adding && hasPlace) addPart(savedAreaPart(area, { local: false }));
    else if (area?.region) editSearch({ place: area.region });
    else if (area) editSearch({ area: { poly: encodeGeometryForLink(area.geometry), name: area.name } });
  };

  const runSearch = useCallback(
    (query: TrendQuery) => {
      if (!query.place && !query.area) setScanView(mapBounds);
      setSelectedId(null);
      setViewMode("change");
      setFormOpen(!query.understood);
      setApplied(query.understood ? query : null);
    },
    [mapBounds],
  );

  const setTab = (id: IndicatorId) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id === scanned[0]) next.delete("tab");
        else next.set("tab", id);
        return next;
      },
      { replace: true },
    );
  const setFilter = (next: ResultFilter) => active && draft && edit({ filters: { ...draft.filters, [active]: next } });

  const scale = useMemo(() => (result && indicator ? changeScale(result.trends, indicator, result.plan.kind === "trend") : null), [result, indicator]);
  const changeRgba = useMemo(() => (result && scale ? changeImage(result.trends, scale) : null), [result, scale]);
  const { frames, layer: frameLayer, loading: framesLoading } = useFrames(result, frameMode, viewMode === "frames");
  const frameRgba = viewMode === "frames" ? (frames[Math.min(frameIndex, frames.length - 1)]?.rgba ?? null) : null;

  const selected = hotspots.find((h) => h.id === selectedId) ?? null;
  const select = (id: string) => {
    setSelectedId(id);
    const hotspot = hotspots.find((h) => h.id === id);
    if (hotspot) setFlyTarget({ bbox: hotspot.bbox, padding: clearOfHotspotCard({ width: window.innerWidth, height: window.innerHeight }), key: `${id}-${Date.now()}` });
    if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(false);
  };

  /** Look closer: the same measures, scanned inside one hotspot. */
  const scanHere = (hotspot: HotspotDetail) => {
    if (!draft) return;
    const next = applyEdit(draft, { area: { poly: encodeGeometryForLink(hotspot.geometry), name: hotspotTitle(hotspot) } });
    const nextParams = paramsFor(next);
    setParams(nextParams);
    runSearch(next);
  };

  /** The same search over every year of the record (offered when a short record shows no clear trend). */
  const tryAllYears = () => {
    const base = applied ?? draft;
    if (!base) return;
    const next = applyEdit(base, { time: { kind: "since", start: 2000 } });
    const nextParams = paramsFor(next);
    setParams(nextParams);
    runSearch(next);
  };

  // What the place is like: the exact outline when one is chosen, otherwise the area last scanned.
  const coverGeometry = chosenGeometry ?? (area && !(draft?.place && draft.place !== applied?.place) ? area.geometry : null);
  const coverName = chosenGeometry
    ? partRows.length > 1
      ? combinedName(partRows.map((row) => row.label))
      : (draft?.area?.name ?? placeArea.area?.name ?? "This area")
    : area && coverGeometry
      ? area.kind === "view"
        ? "The map view"
        : area.name
      : null;
  const landCover = useLandCover(coverGeometry);
  const coverWater = draft.extra.length
    ? undefined
    : exactGeometry
      ? undefined
      : chosenGeometry
        ? placeArea.area?.water
        : area?.water;
  const suggestions = useMemo(
    () => (landCover.cover && coverGeometry ? suggestMeasures(landCover.cover, centroidOf(coverGeometry)[0], coverWater) : []),
    [landCover.cover, coverGeometry, coverWater],
  );

  const busy = scan.status === "preparing" || scan.status === "scanning";
  const measureMaps = plan ? plan.years.length * plan.months.length : 0;
  const progressPct = measure?.progress ? Math.round((measure.progress.done / Math.max(1, measure.progress.total)) * 100) : 0;
  const position = applied && active ? scanned.indexOf(active) + 1 : 0;
  const latest = measure?.availability?.window.latest ?? defaultEndMonth();
  const estimate = draft?.understood ? `About ${estimateMaps(draft)} monthly NASA maps · ${timeRange(estimateMaps(draft))} the first time.` : null;
  const minChange = indicator && filter ? indicator.minChange * filter.minFactor : 0;
  const shownKm2 = hotspots.reduce((sum, h) => sum + h.areaKm2, 0);
  const summary = useMemo(() => (result && filter ? summarizeArea(result, filter) : null), [result, filter]);
  const areaName = area ? (area.kind === "view" ? "The map view" : area.name) : "";
  const areaKind = !area
    ? ""
    : area.kind === "view"
      ? "What the map showed when you searched"
      : applied?.extra.length
        ? (area.context ?? "Places together")
        : area.kind === "country"
        ? "Country"
        : applied?.area?.poly
          ? "Outlined on the map"
          : (area.context ?? "Place");

  const results =
    applied && active && indicator && filter ? (
      <div {...demoAttr("results")} id={panelId} role={scanned.length > 1 ? "tabpanel" : undefined} aria-labelledby={scanned.length > 1 ? `measure-tab-${active}` : undefined} className="space-y-6">
        {(!measure || measure.status === "waiting") && scan.status !== "error" && (
          <p role="status" className="flex items-center gap-2 border-t border-panel-line pt-3 text-xs text-panel-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-panel-muted" aria-hidden />
            {scan.status === "preparing" ? "Finding the place and NASA's record…" : `Waiting — ${indicator.label.toLowerCase()} is scanned after the measures before it.`}
          </p>
        )}

        {measure?.status === "scanning" && (
          <div role="status" aria-live="polite">
            <p className="font-editorial text-[2rem] leading-[1.08] text-panel-foreground">Reading NASA's record of {indicator.noun}.</p>
            <div className="mt-4 h-px overflow-hidden bg-panel-line-strong" aria-hidden>
              <div className="h-full bg-panel-foreground transition-all duration-300 motion-reduce:transition-none" style={{ width: `${Math.max(2, progressPct)}%` }} />
            </div>
            <p className="mt-2 font-mono text-[11px] tabular-nums text-panel-soft">{measure.progress?.message ?? "Scanning…"}</p>
            <p className="mt-3 text-xs leading-relaxed text-panel-muted">
              {scanned.length > 1 ? `Measure ${position} of ${scanned.length}. ` : ""}
              {measureMaps > 0 && `About ${measureMaps} monthly maps, ${timeRange(measureMaps)} the first time, depending on how busy NASA's map service is. Seconds after that, as they are kept on this device.`}
            </p>
            <button type="button" onClick={scan.cancel} className="btn-line mt-3">
              <X className="h-3 w-3" aria-hidden /> Stop
            </button>
          </div>
        )}

        {(measure?.status === "error" || measure?.status === "stopped") && (
          <div role={measure.status === "error" ? "alert" : "status"} className="rounded-lg border border-panel-line p-3.5 text-sm text-panel-foreground">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warn" aria-hidden />
              {measure.status === "error" ? measure.error : `The ${indicator.label.toLowerCase()} scan was stopped.`}
            </p>
            {measure.plan && !measure.wrongPlace && (
              <button
                type="button"
                onClick={() => scan.retry(active)}
                className="btn-line mt-3"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {measure.status === "error" ? "Try again" : `Scan ${indicator.label.toLowerCase()}`}
              </button>
            )}
          </div>
        )}

        {measure?.status === "done" && result && area && plan && (
          <>
            {summary && (
              <AreaSummaryCard
                name={areaName}
                kind={areaKind}
                summary={summary}
                verdict={result.region.verdict}
                series={result.region.series}
                indicator={indicator}
                surface={result.surface}
                plan={plan}
                filter={filter}
                seasonSubject={seasonAverage(months)}
                hotspotCount={hotspots.length}
                hotspotKm2={shownKm2}
                analysisHref={areaAnalysisHref(area, applied.area, active, plan, latest, linkParts)}
                compareHref={compareHref({ center: area.center, areaKm2: summary.scannedKm2 }, active, plan, months)}
                hint={plan.kind === "trend" ? longerPeriodHint(result.region.verdict, plan.startYear) : null}
                onTryAllYears={tryAllYears}
                onZoom={() => {
                  setFlyTarget({ bbox: area.bbox, key: `whole-${Date.now()}` });
                  if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(false);
                }}
              />
            )}
            <div className="space-y-4 border-t border-panel-line pt-6">
              <p className="eyebrow text-panel-muted">Where it changed most</p>
              <h2 className="font-editorial text-[1.6rem] leading-[1.12] text-panel-foreground">{resultsHeading(hotspots.length, active, filter.direction, area, plan)}</h2>
              <ResultFilters indicator={indicator} filter={filter} tested={plan.kind === "trend"} onChange={setFilter} />
              {hotspots.length > 0 ? (
                <div {...demoAttr("hotspots")}>
                  <HotspotList hotspots={hotspots} labels={scan.labels} indicator={indicator} plan={plan} selectedId={selectedId} onSelect={select} />
                </div>
              ) : (
                <p className="border-t border-panel-line pt-3 text-xs leading-relaxed text-panel-soft">
                  No area changed by at least {minChange} {indicator.unit} {filter.direction === "any" ? "either way" : "in this direction"}
                  {filter.minAreaKm2 ? ` over ${filter.minAreaKm2.toLocaleString("en-US")} km² or more` : ""}. Try “Both”, a smaller change, or another period or place.
                </p>
              )}
            </div>
            <div className="space-y-2.5 border-t border-panel-line pt-4 text-[13px] leading-relaxed text-panel-muted">
              <p>
                <span className="text-panel-soft">{indicator.label}.</span> {MEASURE_DEFINITIONS[active]}
              </p>
            </div>
            <details className="group rounded-lg border border-panel-line p-3.5">
              <summary className="flex cursor-pointer items-center text-xs font-medium text-panel-soft pointer-coarse:min-h-11">About these results</summary>
              <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-panel-muted">
                <li>
                  Data: {indicator.product}, read as {result.grid.width}×{result.grid.height} grids from NASA GIBS{result.coarse ? " (large area: scanned coarsely, top hotspots re-read finer)" : ""}.
                </li>
                <li>
                  Compares {seasonDescription(months)}
                  {plan.kind === "trend" ? `: ${plan.baseline[0]}–${plan.baseline[1]} (baseline) with ${plan.recent[0]}–${plan.recent[1]} (recent), and tests every year read in between.` : "."}
                </li>
                <li>
                  Hotspots: neighbouring pixels whose {monthsLabel(months)} average changed by at least {minChange} {indicator.unit}
                  {plan.kind === "trend" ? `, with their own yearly trend pointing the same way (Mann–Kendall p < ${filter.strict ? STRICT_P : PIXEL_SIGNIFICANCE})` : ""}. Ranked by area × size of change.
                </li>
                {plan.kind === "trend" && <li>Each pixel's yearly values are tested with Mann–Kendall; the slope is Sen's slope (robust to outliers).</li>}
                <li>Changing what is shown re-groups the pixels already read — no new maps are needed.</li>
                <li>
                  {result.surface === "land"
                    ? "Lakes and seas are left out; clouds or gaps leave pixels without data."
                    : result.surface === "water"
                      ? indicator.surface === "water"
                        ? "Land is left out (this measure is read on the sea); clouds or gaps leave pixels without data."
                        : "Land is left out: this area is a sea, so the air over its water is read."
                      : "This measure covers the air over land and sea alike, so nothing is left out."}
                </li>
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
            <Glossary />
          </>
        )}
      </div>
    ) : null;

  const showForm = formOpen || !applied;
  const sidebar = showForm ? (
    <>
      <div className="mb-5 space-y-3">
        {draft.understood && draft.text && (
          <p className="text-[13px] leading-relaxed text-panel-soft">
            In words: <span className="text-panel-foreground">“{draft.text}”</span>
          </p>
        )}
        {!applied && !draft.understood && (
          <div>
            <p className="font-mono text-[10.5px] tabular-nums text-panel-muted">
              {INDICATOR_ORDER.length} measures · {FIRST_YEAR}–{LAST_YEAR} · one NASA map per month
            </p>
            <h2 className="field-label mt-5">Worked examples</h2>
            <ul className="mt-2 border-b border-panel-line">
              {DEMOS.map((example) => (
                <li key={example.id}>
                  <button
                    type="button"
                    onClick={() => setDemo(example.id)}
                    className="group flex w-full items-center justify-between gap-3 border-t border-panel-line py-2 text-left text-[13px] leading-snug text-panel-soft transition-colors hover:text-panel-foreground pointer-coarse:min-h-11"
                  >
                    {example.title}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.5} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          {(applied || draft.understood) && (
            <button type="button" onClick={() => setDemo("choose")} className="link-quiet pointer-coarse:min-h-11">
              Watch a demo
            </button>
          )}
          {applied && (
            <button type="button" onClick={() => setFormOpen(false)} className="link-quiet inline-flex items-center gap-1 pointer-coarse:min-h-11">
              <ArrowLeft className="h-3 w-3" aria-hidden /> Back to the results
            </button>
          )}
        </div>
      </div>
      <TrendForm
        query={draft}
        where={
          <div className="space-y-3">
            <div {...demoAttr("where")}>
              <AreaPicker
                query={draft}
                foundName={placeArea.area?.name ?? area?.name ?? null}
                savedAreas={workspace.areas}
                drawMode={drawMode}
                onDraw={startDrawing}
                onEdit={edit}
                placeError={[placeArea.error, ...added.errors].filter(Boolean).join(" ") || null}
                parts={partRows}
                togetherKm2={togetherKm2}
                adding={adding}
                onAddingChange={(next) => {
                  setAdding(next);
                  if (!next && drawMode === "country") startDrawing(null);
                }}
                onAdd={addPart}
                onRemovePart={removePart}
              />
            </div>
            {coverName && (
              <AreaCoverCard
                name={coverName}
                status={landCover.status}
                cover={landCover.cover}
                first={landCover.first}
                suggestions={suggestions}
                selected={draft.everything ? scanned : draft.indicators}
                onAdd={(id) => edit({ indicators: [...(draft.everything ? scanned : draft.indicators), id] })}
                onUseAll={(ids) => edit({ indicators: ids })}
              />
            )}
          </div>
        }
        years={{ first: FIRST_YEAR, last: LAST_YEAR }}
        onEdit={edit}
        onRun={() => runSearch(draft)}
        dirty={dirty}
        current={Boolean(applied) && scan.status !== "error" && scan.status !== "idle"}
        busy={busy}
        estimate={estimate}
      />
    </>
  ) : (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-panel-line pb-4">
        <p className="min-w-0 text-[13px] leading-snug text-panel-soft">{applied.text}</p>
        <button type="button" onClick={() => setFormOpen(true)} className="btn-line shrink-0 px-3 py-1.5">
          Change search
        </button>
      </div>
      {scan.status === "error" && (
        <div role="alert" className="mb-6 rounded-lg border border-panel-line p-3.5 text-sm text-panel-foreground">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warn" aria-hidden />
            {scan.error}
          </p>
          <button type="button" onClick={() => scan.retry()} className="btn-line mt-3">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
          </button>
        </div>
      )}
      {active && scan.status !== "idle" && scan.status !== "error" && (
        <>
          {dirty && <p className="mb-3 text-xs text-panel-muted">Showing results for: “{applied.text}”.</p>}
          {scanned.length > 1 && (
            <div {...demoAttr("tabs")} className="mb-6">
              <MeasureTabs indicators={scanned} measures={scan.measures} counts={counts} active={active} onChange={setTab} panelId={panelId} />
            </div>
          )}
          {results}
        </>
      )}
    </>
  );

  const overlay = (
    <>
      <div className="absolute right-3 top-[3.75rem] lg:right-5">
        <DrawToolbar
          mode={drawMode}
          onModeChange={startDrawing}
          vertexCount={vertexCount}
          onFinish={() => setFinishSignal((n) => n + 1)}
          onUndo={() => setUndoSignal((n) => n + 1)}
          showHint={false}
        />
      </div>
      {drawMode && (
        <div className="absolute inset-x-3 top-[3.75rem] flex justify-center lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2">
          <DrawHint
            mode={drawMode}
            vertexCount={vertexCount}
            onFinish={() => setFinishSignal((n) => n + 1)}
            onUndo={() => setUndoSignal((n) => n + 1)}
            onCancel={() => startDrawing(null)}
            className="max-w-[20rem]"
          />
        </div>
      )}
      {selected && plan && indicator && active && area && (
        <>
          <div className="pointer-events-auto absolute left-16 top-[3.75rem] hidden lg:block">
            <HotspotCard
              hotspot={selected}
              title={hotspotTitle(selected)}
              indicator={indicator}
              plan={plan}
              analysisHref={analysisHref(selected, active, area, plan, latest)}
              compareHref={compareHref(selected, active, plan, months)}
              onScanHere={() => scanHere(selected)}
              onClose={() => setSelectedId(null)}
              className="max-h-[calc(100dvh-14.5rem)] overflow-y-auto"
            />
          </div>
          <div className="pointer-events-auto absolute inset-x-3 bottom-20 flex justify-center lg:hidden">
            <HotspotCard
              hotspot={selected}
              title={hotspotTitle(selected)}
              indicator={indicator}
              plan={plan}
              analysisHref={analysisHref(selected, active, area, plan, latest)}
              compareHref={compareHref(selected, active, plan, months)}
              onScanHere={() => scanHere(selected)}
              onClose={() => setSelectedId(null)}
              className="max-h-[45dvh] overflow-y-auto"
            />
          </div>
        </>
      )}
      {result && indicator && (
        <div className={cn("absolute bottom-20 left-1/2 flex w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col items-center gap-2", selected && "hidden lg:flex")}>
          <div className="float-surface pointer-events-auto flex rounded-full p-0.5 text-xs" role="radiogroup" aria-label="Map shows">
            {(
              [
                ["change", result.plan.kind === "trend" ? `${indicator.label} trend` : `${indicator.label} change`],
                ["frames", "Values over time"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={viewMode === mode ? "segment-on" : "segment"}
              >
                {label}
              </button>
            ))}
          </div>
          {viewMode === "frames" &&
            (framesLoading ? (
              <p role="status" className="float-surface pointer-events-auto flex items-center gap-2 px-3 py-2 text-xs text-panel-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-panel-muted" aria-hidden /> Preparing monthly maps…
              </p>
            ) : (
              <TimeAnimator frames={frames} index={frameIndex} onIndex={setFrameIndex} mode={frameMode} onMode={setFrameMode} seasonLabel={monthsLabel(months)} />
            ))}
        </div>
      )}
      {result && scale && indicator && (
        <div className="absolute bottom-24 right-4 hidden sm:block">
          {viewMode === "change" ? <TrendLegend scale={scale} title={`${indicator.label}: ${scale.mode === "perDecade" ? "trend" : "change"}`} /> : frameLayer && <LayerLegend layer={frameLayer} />}
        </div>
      )}
    </>
  );

  const viewMoved = Boolean(applied && !applied.place && !applied.area && mapBounds && scanView && mapBounds.some((v, i) => Math.abs(v - scanView[i]) > 0.01));

  // What the demo player can do on this page; rebuilt every render so it sees the latest state.
  const demoControls: DemoControls = {
    act: (action) => {
      switch (action.kind) {
        case "edit":
          editSearch(action.edit);
          break;
        case "run":
          if (draft) runSearch(draft);
          break;
        case "filter":
          if (filter) setFilter({ ...filter, direction: action.direction });
          break;
        case "select-hotspot": {
          const hotspot = hotspots[action.rank - 1];
          if (hotspot) select(hotspot.id);
          break;
        }
        case "close-hotspot":
          setSelectedId(null);
          break;
      }
    },
    ready: (wait) => (wait === "scan-done" ? scan.status === "done" || scan.status === "error" : landCover.status === "done" || landCover.status === "error"),
    setPanel: (open) => {
      if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(open);
      else setPanelOpen(true);
    },
  };
  const demoRef = useRef(demoControls);
  demoRef.current = demoControls;

  return (
    <>
      <MapPageShell
        eyebrow="Trends"
        title="Where is Earth changing?"
        description="Choose a measure and a place. TerraScope reads one NASA map per month, tests every pixel for a real trend, and ranks the places that changed most."
        compactHeader={!showForm}
        sidebar={sidebar}
        topRight={
          viewMoved ? (
            <button type="button" onClick={() => setScanView(mapBounds)} className="float-surface flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-panel-foreground hover:border-panel-foreground/50 pointer-coarse:min-h-11">
              <ScanSearch className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Scan this view
            </button>
          ) : indicator && plan ? (
            <div role="status" className="float-surface hidden rounded-full px-3 py-1.5 font-mono text-[10.5px] tabular-nums text-panel-soft sm:block">
              {indicator.product.split(" (")[0].split(",")[0]} · {plan.kind === "comparison" ? `${plan.baseline[0]} vs ${plan.recent[0]}` : `${plan.startYear}–${plan.endYear}`}
            </div>
          ) : null
        }
        overlay={overlay}
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
      >
        <BaseMap initialView={initialView} onViewChange={workspace.setView}>
          <GibsTileLayer layer={base} date={null} />
          {result && <GridImageLayer grid={result.grid} rgba={viewMode === "frames" ? frameRgba : changeRgba} opacity={viewMode === "frames" ? 0.95 : 1} />}
          <ReferenceOverlays />
          <AreasLayer areas={workspace.areas} activeId={null} onSelect={pickSavedArea} interactive={!drawMode} />
          {chosenGeometry && (dirty || !result) && <ChosenAreaLayer geometry={chosenGeometry} />}
          {result && <HotspotLayer hotspots={hotspots} selectedId={selectedId} onSelect={select} area={area?.kind === "view" ? null : (area?.geometry ?? null)} />}
          <DrawTools
            mode={drawMode}
            onComplete={onAreaComplete}
            onCancel={() => startDrawing(null)}
            finishSignal={finishSignal}
            undoSignal={undoSignal}
            onVertexCount={setVertexCount}
          />
          <BoundsTracker onChange={setMapBounds} />
          <FlyTo target={flyTarget} maxZoom={10} />
        </BaseMap>
      </MapPageShell>
      {demo && <DemoPlayer script={demoById(demo)} controls={() => demoRef.current} onChoose={setDemo} onClose={() => setDemo(null)} />}
    </>
  );
}
