import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Globe, Info, Loader2, MapPin, Play, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import LocationPicker from "@/components/analysis/LocationPicker";
import { DatasetPicker, MonthsPicker, PeriodPicker } from "@/components/analysis/AnalysisControls";
import Scoreboard from "@/components/analysis/Scoreboard";
import Glossary from "@/components/common/Glossary";
import { AnswerPanel, Methodology, RecentPanel, ResultsHeader } from "@/components/analysis/ResultsPanels";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import type { PickedCountry } from "@/components/map/DrawTools";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useAnalysisTarget } from "@/hooks/useAnalysisTarget";
import { DATASETS, DEFAULT_DATASETS, countClimateRequests, countMaps } from "@/lib/analysis/run";
import {
  LARGE_RUN_MAPS,
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
import { defaultRadiusKm, hasBoundary, type PlaceResult } from "@/lib/geo/geocode";
import type { LatLng, PolygonGeometry } from "@/lib/geo/geometry";
import { cn } from "@/lib/utils";

const TARGET_KEYS = ["area", "osm", "country", "region", "poly", "lat", "lon", "r", "bbox", "name", "ctx"];
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

function EmptyCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Placeholder shaped like the report while NASA data is still arriving. */
function ReportSkeleton() {
  return (
    <div className="space-y-6 border-t border-border pt-6" aria-hidden="true">
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

  // Very large requests wait for a click instead of starting by themselves.
  const maps = countMaps({ start, end, months, datasets });
  const climateRequests = target ? countClimateRequests({ datasets, target }) : 0;
  const runKey = `${target ? target.bbox.join(",") : ""}|${months.length}|${months[0]}|${months[months.length - 1]}|${datasets.join(",")}|${JSON.stringify(analysisPeriod)}`;
  const [confirmedRun, setConfirmedRun] = useState<string | null>(null);
  const large = maps > LARGE_RUN_MAPS;
  const waiting = Boolean(target) && !problems.length && large && confirmedRun !== runKey;
  const run = useAnalysisRun(target, { start, end, months, period: analysisPeriod }, datasets, !problems.length && !waiting);
  const trends = useMemo(() => (run.result ? analysisTrends(run.result) : []), [run.result]);
  const sizeNote = maps
    ? `${maps.toLocaleString("en-US")} monthly NASA maps to read: ${formatEstimate(estimateSeconds(maps, climateRequests))} the first time, seconds after that.${datasets.includes("climate") ? " Climate results come first." : ""}`
    : undefined;
  const resultsRef = useRef<HTMLDivElement>(null);

  /** On phones the report sits below the controls — bring it into view after a choice. */
  const revealResults = () => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1023px)").matches) return;
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const setTargetParams = useCallback(
    (values: Record<string, string | undefined>) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        TARGET_KEYS.forEach((key) => next.delete(key));
        Object.entries(values).forEach(([key, value]) => value !== undefined && next.set(key, value));
        return next;
      });
    },
    [setParams],
  );

  const onPlace = (place: PlaceResult) => {
    if (place.region) {
      setTargetParams({ region: place.region });
    } else if (place.osm && hasBoundary(place)) {
      setTargetParams({ osm: `${place.osm.type}${place.osm.id}`, name: place.name, ctx: place.context || undefined });
    } else {
      setTargetParams({ lat: place.center[0].toFixed(5), lon: place.center[1].toFixed(5), r: String(defaultRadiusKm(place.kind)), name: place.name, ctx: place.context || undefined });
    }
    revealResults();
  };

  const onPoint = (point: LatLng, radiusKm: number) => {
    const keepName = target?.ref.type === "point" && Math.abs(target.ref.lat - point[0]) < 1e-6 && Math.abs(target.ref.lon - point[1]) < 1e-6;
    setTargetParams({
      lat: point[0].toFixed(5),
      lon: point[1].toFixed(5),
      r: String(radiusKm),
      name: keepName ? params.get("name") ?? undefined : undefined,
      ctx: keepName ? params.get("ctx") ?? undefined : undefined,
    });
  };

  const onDrawn = (geometry: PolygonGeometry, kind: AreaKind, country?: PickedCountry) => {
    if (country?.countryId) {
      setTargetParams({ country: country.countryId });
    } else if (country?.region) {
      setTargetParams({ region: country.region });
    } else {
      const area = workspace.addArea({ geometry, kind });
      setTargetParams({ area: area.id });
    }
    revealResults();
  };

  const onArea = (id: string) => {
    setTargetParams({ area: id });
    revealResults();
  };

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
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-editorial text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.05] tracking-[-0.01em] text-foreground">Area analysis</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Pick a place. NASA's monthly records are read for exactly that area, and each measure is tested for a real change. Every number is measured, not simulated.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1fr,2fr] items-start">
          {/* Left Sidebar */}
          <div className="space-y-6">
            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">1. Choose a place</h2>
              <LocationPicker target={target} loading={targetLoading} onPlace={onPlace} onPoint={onPoint} onDrawn={onDrawn} onArea={onArea} />
            </section>

            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">2. Choose a time range and data</h2>
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
                    <li key={text} className="flex gap-1.5 text-muted-foreground">
                      <Info className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden /> {text}
                    </li>
                  ))}
                </ul>
              )}
              <DatasetPicker selected={datasets} onChange={onDatasets} note={sizeNote} />
            </section>
          </div>

          {/* Right Report Section */}
          <section ref={resultsRef} aria-label="Report" className="min-w-0 scroll-mt-20 space-y-8">
            {targetError && (
              <div role="alert" className="glass rounded-2xl p-6 flex items-start gap-3 text-sm text-tone-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {targetError}
              </div>
            )}

            {!target && !targetLoading && !targetError && (
              <EmptyCard
                title="Pick a place to start"
                action={
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-muted-foreground">Or try an example</label>
                    <div className="flex flex-wrap gap-2">
                      {EXAMPLES.map((example) => (
                        <button
                          key={example.name}
                          type="button"
                          onClick={() => {
                            setTargetParams({ lat: String(example.lat), lon: String(example.lon), r: String(example.r), name: example.name, ctx: example.ctx });
                            revealResults();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium glass text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MapPin className="h-3.5 w-3.5 text-primary" /> {example.name}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                Search for a city, region or country on the left, click anywhere on the small map, or draw your own area. Areas you drew on the Explore map show up there
                too.
              </EmptyCard>
            )}

            {targetLoading && !target && (
              <div role="status" aria-label="Fetching the boundary from OpenStreetMap" className="space-y-6">
                <div className="glass rounded-2xl p-6 grid gap-5 sm:grid-cols-[12rem,1fr]">
                  <Skeleton className="aspect-[4/3] w-full rounded-xl" />
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-56 max-w-full" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                    <p className="pt-2 text-xs text-muted-foreground">Fetching the boundary from OpenStreetMap…</p>
                  </div>
                </div>
                <ReportSkeleton />
              </div>
            )}

            {target && (
              <>
                <ResultsHeader target={target} result={run.result} running={running} shareUrl={shareUrl} />

                {waiting && (
                  <div className="glass rounded-2xl p-6 space-y-3" role="status">
                    <p className="text-sm font-medium text-foreground">This is a big request: about {maps.toLocaleString("en-US")} monthly NASA maps.</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Reading them takes {formatEstimate(estimateSeconds(maps, climateRequests))} the first time, depending on how busy NASA's map service is — seconds after that, as
                      the maps are kept on this device. Fewer years, fewer months or fewer datasets make it faster.
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmedRun(runKey)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 pointer-coarse:min-h-11"
                    >
                      <Play className="h-4 w-4" aria-hidden /> Start the analysis
                    </button>
                  </div>
                )}

                {running && (
                  <div role="status" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Reading NASA data{run.progress?.label && run.progress.label !== "Starting" ? ` · ${run.progress.label}` : ""}
                      </span>
                      <span className="font-mono text-foreground">
                        {run.progress?.done ?? 0}/{run.progress?.total ?? "…"}
                      </span>
                    </div>
                    <div className="h-px overflow-hidden bg-border">
                      <div className="h-full bg-primary transition-all duration-300 motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                )}

                {run.status === "error" && (
                  <div role="alert" className="glass rounded-2xl p-6 flex flex-wrap items-center justify-between gap-3 text-sm text-tone-bad">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> {run.error}
                    </span>
                    <button
                      type="button"
                      onClick={run.rerun}
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium glass text-foreground hover:bg-card/80 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" /> Try again
                    </button>
                  </div>
                )}

                {running && !run.result && <ReportSkeleton />}

                {run.result && run.report && (
                  // Results from the run before stay faintly visible until this run's first results arrive.
                  <div className={cn("space-y-8 transition-opacity", running && !run.current && "pointer-events-none opacity-50")}>
                    <AnswerPanel report={run.report} result={run.result} running={running} />
                    <Scoreboard
                      result={run.result}
                      trends={trends}
                      compare={run.result.period?.compare ?? null}
                      running={running}
                      progress={run.progress}
                      onTryAllYears={selection.kind === "all" ? undefined : () => onPeriod({ kind: "all" })}
                    />
                    {run.report.recent && <RecentPanel recent={run.report.recent} />}
                    <div className="space-y-3">
                      <Methodology report={run.report} result={run.result} />
                      <Glossary look="line" />
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
