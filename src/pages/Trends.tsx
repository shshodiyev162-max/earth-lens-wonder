import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GeoJSON, Pane, useMapEvents } from "react-leaflet";
import type { Feature } from "geojson";
import { AlertTriangle, Info, ListChecks, Loader2, MessageSquareText, RefreshCw, ScanSearch, X } from "lucide-react";
import AreasLayer from "@/components/map/AreasLayer";
import BaseMap from "@/components/map/BaseMap";
import DrawTools, { type DrawMode, type PickedCountry } from "@/components/map/DrawTools";
import DrawToolbar, { DrawHint } from "@/components/map/DrawToolbar";
import GibsTileLayer from "@/components/map/GibsTileLayer";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import FlyTo, { type FlyTarget } from "@/components/map/FlyTo";
import LayerLegend from "@/components/map/LayerLegend";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import AreaPicker from "@/components/trends/AreaPicker";
import GridImageLayer from "@/components/trends/GridImageLayer";
import HotspotLayer from "@/components/trends/HotspotLayer";
import HotspotList from "@/components/trends/HotspotList";
import HotspotCard from "@/components/trends/HotspotCard";
import MeasureTabs from "@/components/trends/MeasureTabs";
import ReaderNotes from "@/components/trends/ReaderNotes";
import ResultFilters from "@/components/trends/ResultFilters";
import TrendForm from "@/components/trends/TrendForm";
import TrendLegend from "@/components/trends/TrendLegend";
import TrendQueryBox from "@/components/trends/TrendQueryBox";
import TimeAnimator from "@/components/trends/TimeAnimator";
import { useFrames, type FrameMode } from "@/hooks/useFrames";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import { useExactAreaGeometry } from "@/hooks/useExactAreaGeometry";
import { gridBudget, useTrendScans } from "@/hooks/useTrendScans";
import { defaultEndMonth } from "@/lib/analysis/period";
import { explainVerdict, signed } from "@/lib/analysis/stats";
import { bboxOf, formatArea, type BBox, type PolygonGeometry } from "@/lib/geo/geometry";
import { encodeGeometryForLink } from "@/lib/geo/polyline";
import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { initialViewFrom } from "@/lib/mapView";
import { interpretWithAi, isQueryAiConfigured } from "@/lib/query/ai";
import { INDICATORS, monthsLabel, SEASONS, type IndicatorId } from "@/lib/query/indicators";
import { DEFAULT_YEARS } from "@/lib/query/period";
import { PIXEL_SIGNIFICANCE, STRICT_P } from "@/lib/trends/hotspots";
import {
  analysisHref,
  applyEdit,
  compareHref,
  DEFAULT_FILTER,
  filterFor,
  hotspotTitle,
  paramsFor,
  paramsForText,
  queryFromParams,
  resultsHeading,
  scanKey,
  seasonAverage,
  seasonDescription,
  type QueryEdit,
  type ResultFilter,
  type TrendQuery,
} from "@/lib/trends/query";
import { changeImage, changeScale } from "@/lib/trends/render";
import { rebuildHotspots, type HotspotDetail } from "@/lib/trends/scan";
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
        style={{ color: "#f8fafc", weight: 2.5, opacity: 0.95, dashArray: "7 5", fillColor: "#22d3ee", fillOpacity: 0.14 }}
      />
    </Pane>
  );
}

type PanelMode = "ask" | "pick";

/** Ask in words, or choose every part step by step. */
function ModeSwitch({ mode, onChange }: { mode: PanelMode; onChange: (mode: PanelMode) => void }) {
  const options: [PanelMode, string, typeof ListChecks][] = [
    ["ask", "Ask a question", MessageSquareText],
    ["pick", "Choose step by step", ListChecks],
  ];
  return (
    <div className="flex rounded-xl border border-panel-line bg-panel-tint p-1 text-xs" role="radiogroup" aria-label="How to search">
      {options.map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-medium transition pointer-coarse:min-h-11",
            mode === value ? "bg-cyan-400/20 text-accent-cyan-soft" : "text-panel-muted hover:text-panel-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

const base = getLayer(BASE_LAYER_ID) as GibsLayer;
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
  const panelMode: PanelMode = params.get("mode") === "pick" ? "pick" : "ask";
  const hasSearch = Boolean(params.get("q") || params.get("ind") || params.get("country") || params.get("osm") || params.get("poly"));
  /** The choices as they stand (they are the page address). Choosing step by step starts from an empty form. */
  const draft = useMemo(() => (hasSearch || panelMode === "pick" ? queryFromParams(params) : null), [params, hasSearch, panelMode]);
  /** The choices the results were found for. */
  const [applied, setApplied] = useState<TrendQuery | null>(() => (draft?.understood ? draft : null));
  const [mapBounds, setMapBounds] = useState<BBox | null>(null);
  const [scanView, setScanView] = useState<BBox | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"change" | "frames">("change");
  const [frameMode, setFrameMode] = useState<FrameMode>("yearly");
  const [frameIndex, setFrameIndex] = useState(0);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [finishSignal, setFinishSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const panelId = useId();
  const chosenGeometry = useExactAreaGeometry(draft?.area ?? null);

  // A search without a place scans the map view as it was when the search ran.
  useEffect(() => {
    if (applied && !applied.place && !applied.area && !scanView && mapBounds) setScanView(mapBounds);
  }, [applied, scanView, mapBounds]);

  const scan = useTrendScans(applied, scanView);
  const area = scan.area;
  const active: IndicatorId | null = applied ? (draft?.tab && applied.indicators.includes(draft.tab) ? draft.tab : (applied.indicators[0] ?? null)) : null;
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
    for (const id of applied?.indicators ?? []) {
      const done = scan.measures[id]?.result;
      if (done) out[id] = rebuildHotspots(done, filterOf(id));
    }
    return out;
  }, [applied, scan.measures, filterOf]);
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
      if (panelMode === "pick") next.set("mode", "pick");
      setParams(next, { replace: true });
    },
    [draft, panelMode, setParams],
  );

  const setPanelMode = (mode: PanelMode) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (mode === "pick") next.set("mode", "pick");
        else next.delete("mode");
        return next;
      },
      { replace: true },
    );

  /** Drawing needs the map: on phones the panel steps aside until the shape is done. */
  const startDrawing = (mode: DrawMode | null) => {
    setDrawMode(mode);
    setVertexCount(0);
    if (mode && window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(false);
  };

  const onAreaComplete = (geometry: PolygonGeometry, kind: AreaKind, country?: PickedCountry) => {
    setDrawMode(null);
    if (country) {
      edit({ area: { country: country.countryId, name: country.name } });
    } else {
      // Drawn shapes are kept with your saved areas, so they can be reused here and in Explore and Analysis.
      const saved = workspace.addArea({ geometry, kind });
      edit({ area: { poly: encodeGeometryForLink(geometry), name: saved.name } });
    }
    setFlyTarget({ bbox: bboxOf(geometry), key: `chosen-${Date.now()}` });
    if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(true);
  };

  const pickSavedArea = (id: string) => {
    const area = workspace.getArea(id);
    if (area) edit({ area: { poly: encodeGeometryForLink(area.geometry), name: area.name } });
  };

  const runSearch = useCallback(
    (query: TrendQuery) => {
      if (!query.place && !query.area) setScanView(mapBounds);
      setSelectedId(null);
      setViewMode("change");
      setApplied(query.understood ? query : null);
    },
    [mapBounds],
  );

  const submit = useCallback(
    (text: string) => {
      const next = paramsForText(text);
      setParams(next);
      runSearch(queryFromParams(next));
    },
    [runSearch, setParams],
  );

  // Questions the rules couldn't read at all: ask the optional AI endpoint, if configured.
  useEffect(() => {
    setAiNote(null);
    if (!draft || draft.understood || draft.notes.length || !draft.text || params.get("ind") !== null || !isQueryAiConfigured()) return;
    const controller = new AbortController();
    interpretWithAi(draft.text, controller.signal)
      .then((answer) => {
        if (!answer || controller.signal.aborted) return;
        setAiNote("Read with the help of the optional AI service — check the choices below.");
        const next = applyEdit(draft, {
          indicators: answer.indicators,
          filters: Object.fromEntries(answer.indicators.map((id) => [id, { direction: answer.direction, ...DEFAULT_FILTER }])),
          place: answer.place,
          time: answer.time,
        });
        setParams(paramsFor(next), { replace: true });
        runSearch(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [draft, params, runSearch, setParams]);

  const setTab = (id: IndicatorId) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id === applied?.indicators[0]) next.delete("tab");
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
    if (hotspot) setFlyTarget({ bbox: hotspot.bbox, key: `${id}-${Date.now()}` });
    if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(false);
  };

  /** Look closer: the same measures, scanned inside one hotspot. */
  const scanHere = (hotspot: HotspotDetail) => {
    if (!draft) return;
    const next = applyEdit(draft, { area: { poly: encodeGeometryForLink(hotspot.geometry), name: hotspotTitle(hotspot) } });
    const nextParams = paramsFor(next);
    if (panelMode === "pick") nextParams.set("mode", "pick");
    setParams(nextParams);
    runSearch(next);
  };

  const busy = scan.status === "preparing" || scan.status === "scanning";
  const measureMaps = plan ? plan.years.length * plan.months.length : 0;
  const progressPct = measure?.progress ? Math.round((measure.progress.done / Math.max(1, measure.progress.total)) * 100) : 0;
  const position = applied && active ? applied.indicators.indexOf(active) + 1 : 0;
  const latest = measure?.availability?.window.latest ?? defaultEndMonth();
  const estimate = draft?.understood ? `About ${estimateMaps(draft)} monthly NASA maps · ${timeRange(estimateMaps(draft))} the first time.` : null;
  const minChange = indicator && filter ? indicator.minChange * filter.minFactor : 0;
  const shownKm2 = hotspots.reduce((sum, h) => sum + h.areaKm2, 0);

  const results =
    applied && active && indicator && filter ? (
      <div id={panelId} role={applied.indicators.length > 1 ? "tabpanel" : undefined} aria-labelledby={applied.indicators.length > 1 ? `measure-tab-${active}` : undefined} className="space-y-4">
        {(!measure || measure.status === "waiting") && scan.status !== "error" && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-panel-line bg-panel-tint p-3 text-xs text-panel-soft">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan" aria-hidden />
            {scan.status === "preparing" ? "Finding the place and NASA's record…" : `Waiting — ${indicator.label.toLowerCase()} is scanned after the measures before it.`}
          </p>
        )}

        {measure?.status === "scanning" && (
          <div role="status" aria-live="polite" className="rounded-xl border border-panel-line bg-panel-tint p-3">
            <div className="mb-2 flex items-center gap-2 text-sm text-panel-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent-cyan" aria-hidden />
              {measure.progress?.message ?? "Scanning…"}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-tint-strong" aria-hidden>
              <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${Math.max(3, progressPct)}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-panel-muted">
              {applied.indicators.length > 1 ? `Measure ${position} of ${applied.indicators.length}. ` : ""}
              {measureMaps > 0 && `About ${measureMaps} monthly NASA maps · ${timeRange(measureMaps)} the first time, depending on how busy NASA's map service is; seconds after that (kept on this device).`}
            </p>
            <button type="button" onClick={scan.cancel} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-panel-tint-strong px-2.5 py-1.5 text-xs text-panel-soft hover:text-panel-foreground pointer-coarse:min-h-11">
              <X className="h-3 w-3" /> Stop
            </button>
          </div>
        )}

        {(measure?.status === "error" || measure?.status === "stopped") && (
          <div role={measure.status === "error" ? "alert" : "status"} className="rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-sm text-panel-foreground">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warn" aria-hidden />
              {measure.status === "error" ? measure.error : `The ${indicator.label.toLowerCase()} scan was stopped.`}
            </p>
            {measure.plan && (
              <button
                type="button"
                onClick={() => scan.retry(active)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-panel-tint-strong px-3 py-1.5 text-xs font-medium text-panel-foreground hover:bg-panel-tint-hover pointer-coarse:min-h-11"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {measure.status === "error" ? "Try again" : `Scan ${indicator.label.toLowerCase()}`}
              </button>
            )}
          </div>
        )}

        {measure?.status === "done" && result && area && plan && (
          <>
            <ResultFilters indicator={indicator} filter={filter} tested={plan.kind === "trend"} onChange={setFilter} />
            <div>
              <h2 className="text-base font-semibold leading-snug text-panel-foreground">{resultsHeading(hotspots.length, active, filter.direction, area, plan)}</h2>
              {result.region.verdict ? (
                <p className="mt-1.5 text-xs leading-relaxed text-panel-soft">
                  Across the whole area: <strong className="text-panel-foreground">{result.region.verdict.label.toLowerCase()}</strong>.{" "}
                  {explainVerdict(result.region.verdict, seasonAverage(months), indicator.unit, indicator.decimals)}
                </p>
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed text-panel-soft">
                  Across the whole area, {seasonAverage(months).toLowerCase()} changed by {signed(result.region.meanChange, indicator.decimals)} {indicator.unit}.
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-panel-muted">
                Scanned {formatArea(result.region.scannedKm2)} of land · {Math.round(result.region.validShare * 100)}% had data in both periods · these hotspots cover {formatArea(shownKm2)}.
              </p>
            </div>
            {hotspots.length > 0 ? (
              <HotspotList hotspots={hotspots} labels={scan.labels} indicator={indicator} plan={plan} selectedId={selectedId} onSelect={select} />
            ) : (
              <p className="rounded-xl border border-panel-line bg-panel-tint p-3 text-xs leading-relaxed text-panel-soft">
                No area changed by at least {minChange} {indicator.unit} {filter.direction === "any" ? "either way" : "in this direction"}
                {filter.minAreaKm2 ? ` over ${filter.minAreaKm2.toLocaleString("en-US")} km² or more` : ""}. Try “Both”, a smaller change, or another period or place.
              </p>
            )}
            <details className="group rounded-xl border border-panel-line bg-panel-tint p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-panel-soft">
                <Info className="h-3.5 w-3.5 text-accent-cyan" aria-hidden /> About these results
              </summary>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-panel-muted">
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
                <li>Lakes and seas are left out; clouds or gaps leave pixels without data.</li>
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    ) : null;

  const sidebar = (
    <>
      <SidebarSection>
        <ModeSwitch mode={panelMode} onChange={setPanelMode} />
      </SidebarSection>

      {panelMode === "ask" ? (
        <SidebarSection>
          <TrendQueryBox value={draft?.text ?? ""} onSubmit={submit} showExamples={!draft} />
        </SidebarSection>
      ) : (
        <p className="mb-4 text-xs leading-relaxed text-panel-muted">
          Pick an area on the map, what to measure, the years and the months — then find changes.
          {draft?.understood && (
            <>
              {" "}
              In words: <span className="text-panel-soft">“{draft.text}”</span>
            </>
          )}
        </p>
      )}

      {panelMode === "ask" && draft && !draft.understood && !draft.notes.length && !aiNote && (
        <SidebarSection>
          <p role="status" className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs leading-relaxed text-panel-soft">
            {draft.text ? `I couldn't tell what to measure in “${draft.text}”. ` : ""}Pick one or more measures below — vegetation, surface heat, rainfall, soil moisture, dust or snow — then find changes.
          </p>
        </SidebarSection>
      )}
      {panelMode === "ask" && draft && draft.notes.length > 0 && (
        <SidebarSection>
          <ReaderNotes
            notes={draft.notes}
            chosen={draft.indicators}
            onAdd={(ids, note) => {
              const indicators = [...draft.indicators, ...ids];
              edit({ indicators, filters: { ...draft.filters, ...Object.fromEntries(ids.map((id) => [id, { direction: note.direction, ...DEFAULT_FILTER }])) } });
            }}
          />
        </SidebarSection>
      )}
      {aiNote && <p className="mb-3 text-[11px] text-panel-muted">{aiNote}</p>}

      {draft && (
        <SidebarSection title="Your search">
          <TrendForm
            query={draft}
            where={<AreaPicker query={draft} foundName={area?.name ?? null} savedAreas={workspace.areas} drawMode={drawMode} onDraw={startDrawing} onEdit={edit} />}
            years={{ first: 2000, last: LAST_YEAR }} onEdit={edit} onRun={() => runSearch(draft)} dirty={dirty} current={Boolean(applied) && scan.status !== "error" && scan.status !== "idle"} busy={busy} estimate={estimate} />
        </SidebarSection>
      )}

      {scan.status === "error" && (
        <SidebarSection>
          <div role="alert" className="rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-sm text-panel-foreground">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warn" aria-hidden />
              {scan.error}
            </p>
            <button type="button" onClick={() => scan.retry()} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-panel-tint-strong px-3 py-1.5 text-xs font-medium text-panel-foreground hover:bg-panel-tint-hover pointer-coarse:min-h-11">
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </SidebarSection>
      )}

      {applied && active && scan.status !== "idle" && scan.status !== "error" && (
        <SidebarSection title="Results">
          {dirty && <p className="mb-2 text-[11px] text-panel-muted">Showing results for: “{applied.text}”.</p>}
          {applied.indicators.length > 1 && (
            <div className="mb-3">
              <MeasureTabs indicators={applied.indicators} measures={scan.measures} counts={counts} active={active} onChange={setTab} panelId={panelId} />
            </div>
          )}
          {results}
        </SidebarSection>
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
          <DrawHint mode={drawMode} vertexCount={vertexCount} onFinish={() => setFinishSignal((n) => n + 1)} onUndo={() => setUndoSignal((n) => n + 1)} onCancel={() => startDrawing(null)} className="max-w-[20rem]" />
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
              className="max-h-[55vh] overflow-y-auto"
            />
          </div>
        </>
      )}
      {result && indicator && (
        <div className={cn("absolute bottom-20 left-1/2 flex w-[min(28rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col items-center gap-2", selected && "hidden lg:flex")}>
          <div className="pointer-events-auto flex rounded-full border border-panel-line bg-panel/90 p-0.5 text-xs shadow-xl backdrop-blur" role="radiogroup" aria-label="Map shows">
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
                className={cn("rounded-full px-3 py-1.5 font-medium pointer-coarse:min-h-11", viewMode === mode ? "bg-cyan-400/20 text-accent-cyan-soft" : "text-panel-muted hover:text-panel-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          {viewMode === "frames" &&
            (framesLoading ? (
              <p role="status" className="pointer-events-auto flex items-center gap-2 rounded-lg border border-panel-line bg-panel/90 px-3 py-2 text-xs text-panel-muted backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan" aria-hidden /> Preparing monthly maps…
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

  return (
    <MapPageShell
      title="Trend detective"
      description="Ask where Earth is changing. TerraScope reads NASA's monthly maps, tests every pixel for a real trend and ranks the places that changed most."
      sidebar={sidebar}
      topRight={
        viewMoved ? (
          <button type="button" onClick={() => setScanView(mapBounds)} className="flex items-center gap-2 rounded-lg border border-panel-line bg-panel/90 px-3 py-2 text-xs font-medium text-panel-foreground shadow-xl backdrop-blur hover:border-cyan-400/50">
            <ScanSearch className="h-3.5 w-3.5 text-accent-cyan" /> Scan this view
          </button>
        ) : indicator && plan ? (
          <div role="status" className="rounded-lg border border-panel-line bg-panel/85 px-3 py-2 text-[11px] text-panel-muted backdrop-blur">
            NASA {indicator.product.split(" (")[0].split(",")[0]} · {plan.kind === "comparison" ? `${plan.baseline[0]} vs ${plan.recent[0]}` : `${plan.startYear}–${plan.endYear}`}
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
        {(panelMode === "pick" || drawMode || !result) && <AreasLayer areas={workspace.areas} activeId={null} onSelect={pickSavedArea} interactive={!drawMode} />}
        {chosenGeometry && (dirty || !result) && <ChosenAreaLayer geometry={chosenGeometry} />}
        {result && <HotspotLayer hotspots={hotspots} selectedId={selectedId} onSelect={select} area={area?.kind === "view" ? null : (area?.geometry ?? null)} />}
        <DrawTools mode={drawMode} onComplete={onAreaComplete} onCancel={() => startDrawing(null)} finishSignal={finishSignal} undoSignal={undoSignal} onVertexCount={setVertexCount} />
        <BoundsTracker onChange={setMapBounds} />
        <FlyTo target={flyTarget} maxZoom={10} />
      </BaseMap>
    </MapPageShell>
  );
}
