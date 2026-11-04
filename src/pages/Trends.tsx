import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMapEvents } from "react-leaflet";
import { AlertTriangle, Info, Loader2, RefreshCw, ScanSearch, X } from "lucide-react";
import BaseMap from "@/components/map/BaseMap";
import GibsTileLayer from "@/components/map/GibsTileLayer";
import ReferenceOverlays from "@/components/map/ReferenceOverlays";
import FlyTo, { type FlyTarget } from "@/components/map/FlyTo";
import LayerLegend from "@/components/map/LayerLegend";
import MapPageShell, { SidebarSection } from "@/components/map/MapPageShell";
import GridImageLayer from "@/components/trends/GridImageLayer";
import HotspotLayer from "@/components/trends/HotspotLayer";
import HotspotList from "@/components/trends/HotspotList";
import HotspotCard from "@/components/trends/HotspotCard";
import QueryChips from "@/components/trends/QueryChips";
import TrendLegend from "@/components/trends/TrendLegend";
import TrendQueryBox from "@/components/trends/TrendQueryBox";
import TimeAnimator from "@/components/trends/TimeAnimator";
import { useFrames, type FrameMode } from "@/hooks/useFrames";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTrendScan } from "@/hooks/useTrendScan";
import { explainVerdict, signed } from "@/lib/analysis/stats";
import { formatArea, type BBox } from "@/lib/geo/geometry";
import { BASE_LAYER_ID, getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { initialViewFrom } from "@/lib/mapView";
import { interpretWithAi, isQueryAiConfigured } from "@/lib/query/ai";
import { INDICATORS, monthsLabel } from "@/lib/query/indicators";
import { completeSeasonYears } from "@/lib/query/period";
import { analysisHref, compareHref, encodeTime, hotspotTitle, interpretation, paramsForEdit, paramsForText, queryFromParams, resultsHeading, seasonAverage, seasonDescription, type QueryEdit } from "@/lib/trends/query";
import { changeImage, changeScale } from "@/lib/trends/render";
import { cn } from "@/lib/utils";

/** Reports the map's current bounds (for questions that name no place). */
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

const base = getLayer(BASE_LAYER_ID) as GibsLayer;

/** "30 s – 2 min": NASA's map service answers in 0.4–1.5 s per map with six at a time. */
function timeRange(maps: number): string {
  const format = (seconds: number) => (seconds < 90 ? `${Math.max(5, Math.round(seconds / 5) * 5)} s` : `${Math.round(seconds / 60)} min`);
  return `about ${format(maps * 0.4)} – ${format(maps * 1.5)}`;
}

export default function Trends() {
  const [params, setParams] = useSearchParams();
  const workspace = useWorkspace();
  const [initialView] = useState(() => initialViewFrom(params, workspace.view));
  const hasQuestion = Boolean(params.get("q") || params.get("ind") || params.get("country") || params.get("osm") || params.get("poly"));
  const query = useMemo(() => (hasQuestion ? queryFromParams(params) : null), [params, hasQuestion]);
  const [mapBounds, setMapBounds] = useState<BBox | null>(null);
  const [scanView, setScanView] = useState<BBox | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"change" | "frames">("change");
  const [frameMode, setFrameMode] = useState<FrameMode>("yearly");
  const [frameIndex, setFrameIndex] = useState(0);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // A question without a place scans the map view as it was when the question was asked.
  useEffect(() => {
    if (query && !query.place && !query.area && !scanView && mapBounds) setScanView(mapBounds);
  }, [query, scanView, mapBounds]);

  const scan = useTrendScan(query, scanView);
  const { result, area, plan, months, availability, labels } = scan;
  const indicator = query ? INDICATORS[query.indicator] : null;

  // Fly to the area once it is known, and start fresh with each new result.
  useEffect(() => {
    if (area && area.kind !== "view") setFlyTarget({ bbox: area.bbox, key: `${area.name}|${area.bbox.join(",")}` });
  }, [area]);
  useEffect(() => {
    setSelectedId(null);
    setFrameIndex(0);
  }, [result]);

  // Questions the rules couldn't read: ask the optional AI endpoint, if configured.
  useEffect(() => {
    setAiNote(null);
    if (!query || query.understood || !query.text || !isQueryAiConfigured()) return;
    const controller = new AbortController();
    interpretWithAi(query.text, controller.signal)
      .then((answer) => {
        if (!answer || controller.signal.aborted) return;
        setAiNote("Read with the help of the optional AI service — check the chips below.");
        setParams((current) => {
          const next = new URLSearchParams(current);
          next.set("ind", answer.indicators[0]);
          next.set("dir", answer.direction);
          next.set("place", answer.place ?? "");
          next.set("t", encodeTime(answer.time));
          return next;
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [query, setParams]);

  const submit = useCallback(
    (text: string) => {
      setScanView(mapBounds);
      setSelectedId(null);
      setViewMode("change");
      setParams(paramsForText(text));
    },
    [mapBounds, setParams],
  );

  const edit = useCallback(
    (change: QueryEdit) => {
      if (!query) return;
      if ("place" in change && !change.place) setScanView(mapBounds);
      setParams(paramsForEdit(params, query, change));
    },
    [params, query, mapBounds, setParams],
  );

  const scale = useMemo(() => (result && indicator ? changeScale(result.trends, indicator, result.plan.kind === "trend") : null), [result, indicator]);
  const changeRgba = useMemo(() => (result && scale ? changeImage(result.trends, scale) : null), [result, scale]);
  const { frames, layer: frameLayer } = useFrames(result, frameMode, viewMode === "frames");
  const frameRgba = viewMode === "frames" ? (frames[Math.min(frameIndex, frames.length - 1)]?.rgba ?? null) : null;

  const hotspots = useMemo(() => (result ? result.hotspots.map((h) => ({ ...h, label: labels[h.id] ?? h.label })) : []), [result, labels]);
  const selected = hotspots.find((h) => h.id === selectedId) ?? null;
  const select = (id: string) => {
    setSelectedId(id);
    const hotspot = hotspots.find((h) => h.id === id);
    if (hotspot) setFlyTarget({ bbox: hotspot.bbox, key: `${id}-${Date.now()}` });
    if (window.matchMedia?.("(max-width: 1023px)").matches) setPanelOpen(false);
  };

  const years = availability ? completeSeasonYears(months.length ? months : [1], availability.window) : null;
  const busy = scan.status === "preparing" || scan.status === "scanning";
  const mapCount = plan ? plan.years.length * plan.months.length : 0;
  const progressPct = scan.progress ? Math.round((scan.progress.done / Math.max(1, scan.progress.total)) * 100) : 0;

  const sidebar = (
    <>
      <SidebarSection>
        <TrendQueryBox value={query?.text ?? ""} onSubmit={submit} busy={busy} showExamples={!query} />
      </SidebarSection>

      {query && !query.understood && (
        <SidebarSection>
          <div role="status" className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs leading-relaxed text-panel-soft">
            I couldn't tell what to measure in “{query.text}”. Mention vegetation, heat, rainfall or drought, soil moisture, dust or snow — or pick one below. Showing vegetation for now.
          </div>
        </SidebarSection>
      )}
      {aiNote && <p className="mb-3 text-[11px] text-panel-muted">{aiNote}</p>}

      {query && (
        <SidebarSection title="Understood as">
          <QueryChips query={query} areaName={area?.name ?? null} plan={plan} months={months} years={years} onEdit={edit} />
          {plan && indicator && (
            <p className="mt-2 text-[11px] leading-relaxed text-panel-muted">
              {interpretation(query, area?.name ?? null, plan, months)}. Compares {seasonDescription(months)}
              {plan.kind === "trend" ? `: ${plan.baseline[0]}–${plan.baseline[1]} (baseline) with ${plan.recent[0]}–${plan.recent[1]} (recent), and tests every year in between.` : "."}
            </p>
          )}
        </SidebarSection>
      )}

      {busy && (
        <SidebarSection>
          <div role="status" aria-live="polite" className="rounded-xl border border-panel-line bg-panel-tint p-3">
            <div className="mb-2 flex items-center gap-2 text-sm text-panel-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-accent-cyan" aria-hidden />
              {scan.status === "preparing" ? "Finding the place and NASA's record…" : (scan.progress?.message ?? "Scanning…")}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-tint-strong" aria-hidden>
              <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${scan.status === "preparing" ? 5 : progressPct}%` }} />
            </div>
            {mapCount > 0 && (
              <p className="mt-2 text-[11px] text-panel-muted">
                About {mapCount} monthly NASA maps · {timeRange(mapCount)} the first time, depending on how busy NASA's map service is; seconds after that (kept on this device).
              </p>
            )}
            <button type="button" onClick={scan.cancel} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-panel-tint-strong px-2.5 py-1.5 text-xs text-panel-soft hover:text-panel-foreground">
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </SidebarSection>
      )}

      {scan.status === "error" && (
        <SidebarSection>
          <div role="alert" className="rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 text-sm text-panel-foreground">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tone-warn" aria-hidden />
              {scan.error}
            </p>
            <button type="button" onClick={scan.retry} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-panel-tint-strong px-3 py-1.5 text-xs font-medium text-panel-foreground hover:bg-panel-tint-hover">
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        </SidebarSection>
      )}

      {scan.status === "done" && result && query && area && plan && indicator && (
        <>
          <SidebarSection>
            <h2 className="text-base font-semibold leading-snug text-panel-foreground">{resultsHeading(hotspots.length, query, area, plan)}</h2>
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
              Scanned {formatArea(result.region.scannedKm2)} of land · {Math.round(result.region.validShare * 100)}% had data in both periods · hotspots cover {formatArea(result.region.changedKm2)}.
            </p>
          </SidebarSection>
          {hotspots.length > 0 ? (
            <SidebarSection title="Hotspots">
              <HotspotList hotspots={hotspots} labels={labels} indicator={indicator} plan={plan} selectedId={selectedId} onSelect={select} />
            </SidebarSection>
          ) : (
            <SidebarSection>
              <p className="rounded-xl border border-panel-line bg-panel-tint p-3 text-xs leading-relaxed text-panel-soft">
                No area changed by at least {indicator.minChange} {indicator.unit} in this direction. Try “Any change”, a longer period or another place.
              </p>
            </SidebarSection>
          )}
          <SidebarSection title="About these results" icon={<Info className="h-3.5 w-3.5 text-accent-cyan" />}>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-panel-muted">
              <li>
                Data: {indicator.product}, read as {result.grid.width}×{result.grid.height} grids from NASA GIBS{result.coarse ? " (large area: scanned coarsely, top hotspots re-read finer)" : ""}.
              </li>
              <li>
                Hotspots: neighbouring pixels whose {monthsLabel(months)} average changed by at least {indicator.minChange} {indicator.unit}
                {plan.kind === "trend" ? ", with their own yearly trend pointing the same way (Mann–Kendall p < 0.1)" : ""}. Ranked by area × size of change.
              </li>
              {plan.kind === "trend" && <li>Each pixel's yearly values are tested with Mann–Kendall; the slope is Sen's slope (robust to outliers).</li>}
              <li>Lakes and seas are left out; clouds or gaps leave pixels without data.</li>
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </SidebarSection>
        </>
      )}
    </>
  );

  const overlay = (
    <>
      {selected && plan && indicator && query && area && availability && (
        <>
          <div className="pointer-events-auto absolute left-16 top-[3.75rem] hidden lg:block">
            <HotspotCard
              hotspot={selected}
              title={hotspotTitle(selected)}
              indicator={indicator}
              plan={plan}
              analysisHref={analysisHref(selected, query, area, plan, availability.window.latest)}
              compareHref={compareHref(selected, query, plan, months)}
              onClose={() => setSelectedId(null)}
            />
          </div>
          <div className="pointer-events-auto absolute inset-x-3 bottom-20 flex justify-center lg:hidden">
            <HotspotCard
              hotspot={selected}
              title={hotspotTitle(selected)}
              indicator={indicator}
              plan={plan}
              analysisHref={analysisHref(selected, query, area, plan, availability.window.latest)}
              compareHref={compareHref(selected, query, plan, months)}
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
                ["change", result.plan.kind === "trend" ? "Trend map" : "Change map"],
                ["frames", "Values over time"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={cn("rounded-full px-3 py-1.5 font-medium", viewMode === mode ? "bg-cyan-400/20 text-accent-cyan-soft" : "text-panel-muted hover:text-panel-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          {viewMode === "frames" && <TimeAnimator frames={frames} index={frameIndex} onIndex={setFrameIndex} mode={frameMode} onMode={setFrameMode} seasonLabel={monthsLabel(months)} />}
        </div>
      )}
      {result && scale && indicator && (
        <div className="absolute bottom-24 right-4 hidden sm:block">
          {viewMode === "change" ? <TrendLegend scale={scale} title={`${indicator.label}: ${scale.mode === "perDecade" ? "trend" : "change"}`} /> : frameLayer && <LayerLegend layer={frameLayer} />}
        </div>
      )}
    </>
  );

  const viewMoved = Boolean(query && !query.place && !query.area && mapBounds && scanView && mapBounds.some((v, i) => Math.abs(v - scanView[i]) > 0.01));

  return (
    <MapPageShell
      title="Trend detective"
      description="Ask where Earth is changing. TerraVision reads NASA's monthly maps, tests every pixel for a real trend and ranks the places that changed most."
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
        {result && <HotspotLayer hotspots={hotspots} selectedId={selectedId} onSelect={select} area={area?.kind === "view" ? null : (area?.geometry ?? null)} />}
        <BoundsTracker onChange={setMapBounds} />
        <FlyTo target={flyTarget} maxZoom={10} />
      </BaseMap>
    </MapPageShell>
  );
}
