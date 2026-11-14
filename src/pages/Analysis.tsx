import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, FileText, Loader2, Map as MapIcon, Plus, RefreshCw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import LocationPicker from "@/components/analysis/LocationPicker";
import AnalysisMap from "@/components/analysis/AnalysisMap";
import { DatasetPicker, MonthsPicker, PeriodPicker } from "@/components/analysis/AnalysisControls";
import Scoreboard from "@/components/analysis/Scoreboard";
import GroundCheck from "@/components/analysis/GroundCheck";
import Glossary from "@/components/common/Glossary";
import StepLabel from "@/components/common/StepLabel";
import { AnswerPanel, Methodology, RecentPanel, ResultsHeader } from "@/components/analysis/ResultsPanels";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import { ANALYSIS_AREA_KEYS, analysisParts, partKey, partLabel, placePart, savedAreaPart, togglePart, writeAnalysisParts, type AreaPart } from "@/lib/areas/parts";
import type { PickedCountry } from "@/components/map/DrawTools";
import { useGroundCheck } from "@/hooks/useGroundCheck";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useAnalysisTarget } from "@/hooks/useAnalysisTarget";
import { DATASETS, DEFAULT_DATASETS, countClimateRequests, countMaps } from "@/lib/analysis/run";
import {
  LARGE_RUN_MAPS,
  describePeriod,
  estimateSeconds,
  formatEstimate,
  periodHints,
  periodProblems,
  readPeriod,
  requestedMonths,
  selectionMonths,
  writePeriod,
  type PeriodEdit,
} from "@/lib/analysis/period";
import { analysisTrends } from "@/lib/analysis/trend";
import type { AnalysisPeriod, DatasetId } from "@/lib/analysis/types";
import type { PlaceResult } from "@/lib/geo/geocode";
import { formatArea, type LatLng, type PolygonGeometry } from "@/lib/geo/geometry";
import { togetherLabel } from "@/lib/areas/resolve";
import { cn } from "@/lib/utils";

const ALL_DATASETS = DATASETS.map((d) => d.id);

function parseDatasets(value: string | null): DatasetId[] {
  if (!value) return DEFAULT_DATASETS;
  const wanted = value.split(",").filter((id): id is DatasetId => (ALL_DATASETS as string[]).includes(id));
  return wanted.length ? ALL_DATASETS.filter((id) => wanted.includes(id)) : DEFAULT_DATASETS;
}

// Real coordinates for a quick first try; they open as a circle around the point.
const EXAMPLES = [
  { name: "Bukhara", ctx: "Uzbekistan", lat: 39.7747, lon: 64.4286, r: 10 },
  { name: "Aral Sea", ctx: "Kazakhstan / Uzbekistan", lat: 45.0, lon: 59.6, r: 80 },
  { name: "Nile Delta", ctx: "Egypt", lat: 30.85, lon: 31.05, r: 60 },
];

/** Placeholder shaped like the report while NASA data is still arriving. */
function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-full max-w-prose" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** What will be read and how long it takes, with the one button that starts it. */
function ReadyToStart({
  mode,
  large,
  period,
  measures,
  maps,
  estimate,
  onStart,
}: {
  /** "changed": a report for earlier choices is shown below. "stopped": the run for these choices was stopped. */
  mode: "new" | "changed" | "stopped";
  large: boolean;
  period: string;
  measures: string[];
  maps: number;
  estimate: string;
  onStart: () => void;
}) {
  const reading = maps > 0 ? `${maps.toLocaleString("en-US")} monthly NASA maps` : "NASA's climate records for this place";
  const eyebrow = mode === "stopped" ? "Stopped" : mode === "changed" ? "Your choices changed" : large ? "A big request" : "Ready to start";
  const heading = mode === "stopped" ? "Stopped before the end." : mode === "changed" ? "The report below is for your earlier choices." : period;
  return (
    <section aria-labelledby="ready-heading" className="space-y-3">
      <p className="eyebrow">{eyebrow}</p>
      <h3 id="ready-heading" className="max-w-3xl font-editorial text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] text-foreground">
        {heading}
      </h3>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {mode === "stopped" ? "Maps already read are kept on this device, so starting again picks up where it stopped. " : ""}
        {mode === "changed" ? `Start again to read ${period}: ` : ""}
        {measures.join(", ")}. {reading}: {estimate} the first time, depending on how busy NASA's service is, and seconds after that, as they are kept on this device.
        {large ? " Fewer years, months or measures make it faster." : ""}
      </p>
      <button type="button" onClick={onStart} className="btn-solid group">
        {mode === "new" ? "Start the analysis" : "Start the analysis again"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </button>
    </section>
  );
}

export default function Analysis() {
  const [params, setParams] = useSearchParams();
  const workspace = useWorkspace();
  const { target, loading: targetLoading, error: targetError } = useAnalysisTarget(params);

  const selection = useMemo(() => readPeriod(params), [params]);
  const { start, end } = selection;
  const latitude = target?.center[0] ?? 0;
  const calendarMonths = useMemo(() => selectionMonths(selection, latitude), [selection, latitude]);
  const months = useMemo(() => requestedMonths(selection, latitude), [selection, latitude]);
  const analysisPeriod = useMemo<AnalysisPeriod>(
    () => ({
      calendarMonths,
      compare: selection.kind === "compare" && selection.baseline && selection.recent ? { baseline: selection.baseline, recent: selection.recent } : null,
    }),
    [calendarMonths, selection],
  );
  const datasets = useMemo(() => parseDatasets(params.get("ds")), [params]);
  const problems = periodProblems(selection, months.length);
  const hints = periodHints(selection, calendarMonths, months.length);

  /** While on, each place picked joins the area; nothing is read until adding is done. */
  const [adding, setAdding] = useState(false);

  // Nothing is read until "Start the analysis" is pressed, and a new place, period or set of
  // measures waits for it again: reading NASA's maps takes minutes the first time.
  const maps = countMaps({ start, end, months, datasets });
  const climateRequests = target ? countClimateRequests({ datasets, target }) : 0;
  const runKey = `${target ? `${target.bbox.join(",")}|${Math.round(target.areaKm2)}` : ""}|${months.length}|${months[0]}|${months[months.length - 1]}|${datasets.join(",")}|${JSON.stringify(analysisPeriod)}`;
  const [startedRun, setStartedRun] = useState<string | null>(null);
  const [stoppedRun, setStoppedRun] = useState<string | null>(null);
  const started = Boolean(target) && startedRun === runKey;
  const stopped = !started && stoppedRun === runKey;
  const large = maps > LARGE_RUN_MAPS;
  const run = useAnalysisRun(target, { start, end, months, period: analysisPeriod }, datasets, started && !problems.length && !adding);
  // The last report stays, faded, while the same place waits for a new start with other choices.
  const samePlace = Boolean(run.result && target && run.result.target.bbox.join(",") === target.bbox.join(",") && Math.round(run.result.target.areaKm2) === Math.round(target.areaKm2));
  const shownResult = samePlace && !stopped ? run.result : null;
  const stale = Boolean(shownResult) && !started;
  const ready = Boolean(target) && !started && !problems.length && !adding;
  const startAnalysis = () => {
    setStartedRun(runKey);
    setStoppedRun(null);
    setView("report");
    revealResults();
  };
  const stopAnalysis = () => {
    setStoppedRun(runKey);
    setStartedRun(null);
  };
  // "Test every year since 2000" changes the period and starts straight away: the button says what it does.
  const startOnNextChoice = useRef(false);
  useEffect(() => {
    if (!startOnNextChoice.current || !target) return;
    startOnNextChoice.current = false;
    setStartedRun(runKey);
  }, [runKey, target]);
  const trends = useMemo(() => (shownResult ? analysisTrends(shownResult) : []), [shownResult]);
  // NASA's temperature and rainfall trends beside the nearest weather station's, once they're in.
  const groundCheck = useGroundCheck(shownResult, trends, Boolean(shownResult) && !stale);
  const sizeNote = maps
    ? `${maps.toLocaleString("en-US")} monthly NASA maps to read: ${formatEstimate(estimateSeconds(maps, climateRequests))} the first time, seconds after that.${datasets.includes("climate") ? " Climate results come first." : ""}`
    : undefined;
  const resultsRef = useRef<HTMLDivElement>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsShown = !target || controlsOpen;
  /** The big area shows the map (to choose the place) or the report; with no place yet, only the map. */
  const [view, setView] = useState<"map" | "report">(() => (analysisParts(params).length ? "report" : "map"));
  const hasArea = Boolean(target || targetLoading);
  const showing = hasArea ? view : "map";

  /** On phones the report sits below the controls — bring it into view after a choice. */
  const revealResults = () => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1023px)").matches) return;
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const setTargetParams = useCallback(
    (values: Record<string, string | undefined>) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        ANALYSIS_AREA_KEYS.forEach((key) => next.delete(key));
        Object.entries(values).forEach(([key, value]) => value !== undefined && next.set(key, value));
        return next;
      });
    },
    [setParams],
  );

  // The places the area is made of (usually one). While adding, each place picked joins them.
  const parts = useMemo(() => analysisParts(params), [params]);
  useEffect(() => {
    if (!parts.length) setAdding(false);
  }, [parts.length]);
  const partRows = useMemo(
    () =>
      parts.map((part) => {
        const key = partKey(part);
        const loaded = target?.parts?.find((p) => p.key === key);
        return { key, label: loaded?.name ?? partLabel(part), areaKm2: loaded?.areaKm2 };
      }),
    [parts, target],
  );

  /** A place chosen: it becomes the area and its report opens, or, while adding, it joins the area (picking one already in takes it out). */
  const choose = (part: AreaPart) => {
    if (adding && parts.length) {
      setParams((current) => writeAnalysisParts(current, togglePart(analysisParts(current), part)));
      return;
    }
    setParams((current) => writeAnalysisParts(current, [part]));
    setView("report");
    revealResults();
  };

  const showMap = () => {
    setView("map");
    revealResults();
  };

  /** Adding happens on the map; when it's done, the report of the whole area opens. */
  const changeAdding = (next: boolean) => {
    setAdding(next);
    if (next) showMap();
    else setView("report");
  };

  const onPlace = (place: PlaceResult) => choose(placePart(place));

  const onPoint = (point: LatLng, radiusKm: number) => choose({ kind: "point", lat: point[0], lon: point[1], radiusKm });

  /** A new size for the circle around the first place, keeping its name and any places added to it. */
  const onRadius = (radiusKm: number) =>
    setParams((current) => {
      const [first, ...rest] = analysisParts(current);
      return first?.kind === "point" ? writeAnalysisParts(current, [{ ...first, radiusKm }, ...rest]) : current;
    });

  const onDrawn = (geometry: PolygonGeometry, kind: AreaKind, picked?: PickedCountry) => {
    if (picked?.countryId) {
      choose({ kind: "country", id: picked.countryId, name: picked.name });
    } else if (picked?.region) {
      choose({ kind: "region", label: picked.region });
    } else {
      // Drawn shapes are kept with your saved areas, so they can be reused on the other pages.
      const area = workspace.addArea({ geometry, kind });
      choose(adding && parts.length ? savedAreaPart(area) : { kind: "area", id: area.id });
    }
  };

  const onArea = (id: string) => {
    const area = workspace.getArea(id);
    if (area) choose(adding && parts.length ? savedAreaPart(area) : { kind: "area", id });
  };

  const onRemovePart = (index: number) => setParams((current) => writeAnalysisParts(current, analysisParts(current).filter((_, i) => i !== index)));

  const onPeriod = (edit: PeriodEdit) => setParams((current) => writePeriod(current, selection, edit), { replace: true });

  const onDatasets = (next: DatasetId[]) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next.length === DEFAULT_DATASETS.length && DEFAULT_DATASETS.every((id) => next.includes(id))) updated.delete("ds");
        else updated.set("ds", next.join(","));
        return updated;
      },
      { replace: true },
    );

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const running = run.status === "running";
  const progressPct = run.progress ? Math.round((run.progress.done / Math.max(run.progress.total, 1)) * 100) : 0;

  return (
    <div className="lg:flex lg:items-start print:block">
      <aside aria-label="Analysis controls" className="print:hidden border-b border-border bg-panel px-6 pb-6 pt-7 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-[24rem] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <p className="eyebrow">Analysis</p>
        <h1 className="mt-3 font-editorial text-[2.75rem] leading-[1.03] tracking-[-0.012em] text-foreground">Read any place on Earth.</h1>
        {/* On phones, once there is a report, the controls fold away so the report comes first. */}
        <button type="button" aria-expanded={controlsShown} onClick={() => setControlsOpen((open) => !open)} className={cn("link-quiet mt-3 text-xs pointer-coarse:min-h-11 lg:hidden", !target && "hidden")}>
          {controlsShown ? "Hide the place, years and measures" : "Change the place, years or measures"}
        </button>
        <div className={cn("lg:block", controlsShown ? "block" : "hidden")}>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">NASA's monthly records are read for exactly the area you choose, and each measure is tested for a real change. Every number is measured, not simulated.</p>

          <section className="mt-7 space-y-3 border-t border-border pt-4">
            <StepLabel number={1}>Place</StepLabel>
            <LocationPicker
              target={target}
              loading={targetLoading}
              parts={partRows}
              adding={adding}
              onAddingChange={changeAdding}
              onPlace={onPlace}
              onPoint={onPoint}
              onRadius={onRadius}
              onArea={onArea}
              onRemovePart={onRemovePart}
              onShowMap={showMap}
            />
          </section>

          <section className="mt-5 space-y-3 border-t border-border pt-4">
            <StepLabel number={2}>Years and months</StepLabel>
            <PeriodPicker selection={selection} onChange={onPeriod} />
            <MonthsPicker selection={selection} latitude={latitude} onChange={onPeriod} />
            {(problems.length > 0 || hints.length > 0 || selection.notes.length > 0) && (
              <ul className="space-y-1.5 text-xs leading-relaxed" aria-live="polite">
                {problems.map((text) => (
                  <li key={text} className="flex gap-1.5 text-tone-warn">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {text}
                  </li>
                ))}
                {[...selection.notes, ...hints].map((text) => (
                  <li key={text} className="text-muted-foreground">
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-5 space-y-3 border-t border-border pt-4">
            <StepLabel number={3}>Measures</StepLabel>
            <DatasetPicker selected={datasets} onChange={onDatasets} note={sizeNote} />
          </section>
        </div>
      </aside>

      <section ref={resultsRef} aria-label={showing === "map" ? "Map" : "Report"} className="min-w-0 flex-1 scroll-mt-16">
        {hasArea && (
          <div className="sticky top-16 z-[1100] flex h-[3.25rem] items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md print:hidden md:px-6">
            <div className="segmented" role="group" aria-label="Show the map or the report">
              <button type="button" aria-pressed={showing === "map"} onClick={() => setView("map")} className={cn("inline-flex items-center gap-1.5", showing === "map" ? "segment-on" : "segment")}>
                <MapIcon className="h-3.5 w-3.5" aria-hidden /> Map
              </button>
              <button type="button" aria-pressed={showing === "report"} onClick={() => setView("report")} className={cn("inline-flex items-center gap-1.5", showing === "report" ? "segment-on" : "segment")}>
                <FileText className="h-3.5 w-3.5" aria-hidden /> Report
              </button>
            </div>
            {running && showing === "map" && (
              <span className="flex min-w-0 items-center gap-2 truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                <span className="truncate">
                  Reading NASA data · {run.progress?.done ?? 0}/{run.progress?.total ?? "…"}
                </span>
              </span>
            )}
          </div>
        )}

        {targetError && (
          <div role="alert" className="flex items-start gap-3 border-b border-border px-6 py-4 text-sm text-tone-warn md:px-10">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {targetError}
          </div>
        )}

        {showing === "map" && (
          <AnalysisMap
            target={target}
            loading={targetLoading}
            adding={adding}
            radiusKm={target?.ref.type === "point" ? target.ref.radiusKm : 10}
            onPoint={onPoint}
            onDrawn={onDrawn}
            className={cn("h-[clamp(24rem,72dvh,44rem)]", hasArea ? "lg:h-[calc(100dvh-7.25rem)]" : "lg:h-[calc(100dvh-4rem)]")}
          >
            {!target ? (
              <div className="float-surface pointer-events-auto max-w-sm px-4 py-3.5 sm:px-5 sm:py-4">
                <p className="field-label hidden sm:block">Area report</p>
                <h2 className="font-editorial text-[1.45rem] leading-[1.05] text-panel-foreground sm:mt-2 sm:text-[clamp(1.6rem,3vw,2.1rem)]">Pick a place to start.</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-panel-soft sm:mt-2 sm:text-[13px]">
                  <span className="sm:hidden">Tap the map, or draw or pick with the tools on the right.</span>
                  <span className="hidden sm:inline">Click anywhere for the area around that point, draw a shape, or pick a country or sea with the tools on the right. You can also search for a place.</span>
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-3">
                  <span className="mr-0.5 text-xs text-panel-muted">Or try</span>
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.name}
                      type="button"
                      onClick={() => {
                        setTargetParams({ lat: String(example.lat), lon: String(example.lon), r: String(example.r), name: example.name, ctx: example.ctx });
                        setView("report");
                        revealResults();
                      }}
                      className="chip"
                    >
                      {example.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="float-surface pointer-events-auto max-w-sm px-4 py-3.5">
                <p className="field-label">{adding ? "Adding places" : target.parts ? togetherLabel(target.parts.length) : "Chosen area"}</p>
                <p translate="no" className="mt-1.5 truncate font-editorial text-[1.6rem] leading-tight text-panel-foreground">
                  {target.name}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] tabular-nums text-panel-muted">{formatArea(target.areaKm2)}</p>
                <p className="mt-2 hidden text-xs leading-relaxed text-panel-soft sm:block">
                  {adding
                    ? "Click countries and seas with the flag tool, draw shapes, or click for a circle: each joins the area. Pick one again to take it out."
                    : "Click the map, draw, or pick a country or sea to choose another place."}
                </p>
                {adding ? (
                  <button type="button" onClick={() => changeAdding(false)} className="btn-solid mt-3">
                    Done adding
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={ready ? startAnalysis : () => setView("report")} className="btn-solid group">
                      {ready ? "Start the analysis" : "See the report"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                    </button>
                    <button type="button" onClick={() => changeAdding(true)} className="btn-line">
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Add another place
                    </button>
                  </div>
                )}
              </div>
            )}
          </AnalysisMap>
        )}

        {showing === "report" && targetLoading && !target && (
          <div role="status" aria-label="Fetching the boundary from OpenStreetMap">
            <Skeleton className="h-[clamp(16rem,38vh,26rem)] w-full rounded-none" />
            <div className="px-6 py-8 md:px-10">
              <p className="font-mono text-[11px] text-muted-foreground">Fetching the boundary from OpenStreetMap…</p>
              <ReportSkeleton />
            </div>
          </div>
        )}

        {showing === "report" && target && (
          <>
            <ResultsHeader target={target} result={stale ? null : shownResult} running={running} shareUrl={shareUrl} />

            <div className="space-y-10 px-6 py-9 md:px-10">
              {ready && (
                <ReadyToStart
                  mode={stopped ? "stopped" : stale ? "changed" : "new"}
                  large={large}
                  period={describePeriod(selection, calendarMonths, "long")}
                  measures={DATASETS.filter((d) => datasets.includes(d.id)).map((d) => d.label)}
                  maps={maps}
                  estimate={formatEstimate(estimateSeconds(maps, climateRequests))}
                  onStart={startAnalysis}
                />
              )}

              {running && (
                <div role="status" aria-live="polite">
                  <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      Reading NASA data{run.progress?.label && run.progress.label !== "Starting" ? ` · ${run.progress.label}` : ""}
                    </span>
                    <span className="flex items-center gap-3">
                      {run.progress?.done ?? 0}/{run.progress?.total ?? "…"}
                      <button type="button" onClick={stopAnalysis} className="btn-line px-2.5 py-1 font-sans text-xs">
                        <X className="h-3 w-3" aria-hidden /> Stop
                      </button>
                    </span>
                  </div>
                  <div className="h-px overflow-hidden bg-border">
                    <div className="h-full bg-foreground transition-all duration-300 motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              {run.status === "error" && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 text-sm text-tone-bad">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {run.error}
                  </span>
                  <button type="button" onClick={run.rerun} className="btn-line">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
                  </button>
                </div>
              )}

              {running && !shownResult && <ReportSkeleton />}

              {shownResult && run.report && (
                // The report for earlier choices stays faintly visible until a new run's first results arrive.
                <div className={cn("space-y-12 transition-opacity", ((running && !run.current) || stale) && "pointer-events-none opacity-50")}>
                  <AnswerPanel report={run.report} result={shownResult} running={running} />
                  <Scoreboard
                    result={shownResult}
                    trends={trends}
                    compare={shownResult.period?.compare ?? null}
                    running={running}
                    progress={run.progress}
                    onTryAllYears={
                      selection.kind === "all"
                        ? undefined
                        : () => {
                            startOnNextChoice.current = true;
                            onPeriod({ kind: "all" });
                          }
                    }
                  />
                  <GroundCheck state={groundCheck} />
                  {run.report.recent && <RecentPanel recent={run.report.recent} />}
                  <div className="space-y-2.5">
                    <Methodology report={run.report} result={shownResult} />
                    <Glossary look="line" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
