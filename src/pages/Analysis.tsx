import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Loader2, MapPin, RefreshCw, Satellite } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import LocationPicker from "@/components/analysis/LocationPicker";
import { DatasetPicker, PeriodPicker } from "@/components/analysis/AnalysisControls";
import { ChartCard, RainChart, SingleSeriesChart, SoilChart, TemperatureChart, VegetationChart } from "@/components/analysis/Charts";
import { FindingsList, InsightPanel, KpiGrid, Methodology, ResultsHeader } from "@/components/analysis/ResultsPanels";
import { useWorkspace, type AreaKind } from "@/context/WorkspaceContext";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useAnalysisTarget } from "@/hooks/useAnalysisTarget";
import { DATASETS } from "@/lib/analysis/run";
import { PERIOD_OPTIONS, periodRange, type PeriodId } from "@/lib/analysis/period";
import type { AnalysisResult, DatasetId, SatelliteSeries } from "@/lib/analysis/types";
import { defaultRadiusKm, hasBoundary, type PlaceResult } from "@/lib/geo/geocode";
import type { LatLng, PolygonGeometry } from "@/lib/geo/geometry";
import { formatMonth } from "@/lib/gibs/time";
import { cn } from "@/lib/utils";

const TARGET_KEYS = ["area", "osm", "lat", "lon", "r", "bbox", "name", "ctx"];
const ALL_DATASETS = DATASETS.map((d) => d.id);

function parseDatasets(value: string | null): DatasetId[] {
  if (!value) return ALL_DATASETS;
  const wanted = value.split(",").filter((id): id is DatasetId => (ALL_DATASETS as string[]).includes(id));
  return wanted.length ? ALL_DATASETS.filter((id) => wanted.includes(id)) : ALL_DATASETS;
}

function seriesNote(series: SatelliteSeries | undefined, end: string): string | undefined {
  if (!series) return undefined;
  if (series.status === "error") return `Couldn't load: ${series.error ?? "NASA GIBS did not respond"}.`;
  if (series.latestAvailable && series.latestAvailable < end) return `NASA has published this product up to ${formatMonth(series.latestAvailable, "long")}.`;
  return undefined;
}

// Real coordinates for a quick first try; they open as a circle around the point.
const EXAMPLES = [
  { name: "Bukhara", ctx: "Uzbekistan", lat: 39.7747, lon: 64.4286, r: 10 },
  { name: "Aral Sea", ctx: "Kazakhstan / Uzbekistan", lat: 45.0, lon: 59.6, r: 80 },
  { name: "Nile Delta", ctx: "Egypt", lat: 30.85, lon: 31.05, r: 60 },
];

function EmptyCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/70 px-6 py-14 text-center glass">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <span className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 animate-float">
        <Satellite className="h-7 w-7 text-primary" aria-hidden="true" />
      </span>
      <h2 className="relative font-display text-xl font-semibold text-foreground">{title}</h2>
      <div className="relative mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action && <div className="relative mt-6">{action}</div>}
    </section>
  );
}

/** Placeholder shaped like the report while NASA data is still arriving. */
function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="space-y-3 rounded-2xl p-5 glass">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 rounded-2xl p-4 glass">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 2xl:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl p-5 glass">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SeriesUnavailable({ title, series }: { title: string; series: SatelliteSeries }) {
  return (
    <section className="rounded-2xl border-dashed p-5 glass">
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {series.status === "error"
          ? `NASA GIBS couldn't be reached for this dataset (${series.error ?? "network error"}). Try again in a moment.`
          : "No valid pixels for this area in the selected period — for example open water, permanent cloud, or a product that doesn't cover this region."}
      </p>
    </section>
  );
}

function Charts({ result }: { result: AnalysisResult }) {
  const { satellite, climate } = result;
  const climatePoints = climate?.status === "ok" ? climate.points : [];
  const veg = satellite.vegetation;
  const heat = satellite.surfaceHeat;
  const air = satellite.air;
  const snow = satellite.snow;
  const hasValues = (series?: SatelliteSeries) => Boolean(series?.points.some((p) => p.value !== null));
  const snowVisible = snow && snow.points.some((p) => (p.value ?? 0) >= 1);

  return (
    <div className="grid gap-5 2xl:grid-cols-2">
      {veg &&
        (hasValues(veg) ? (
          <ChartCard title="Vegetation health (NDVI)" subtitle="Area mean and spread of pixels · MODIS Terra monthly" footer={seriesNote(veg, result.end)}>
            <VegetationChart series={veg} />
          </ChartCard>
        ) : (
          <SeriesUnavailable title="Vegetation health (NDVI)" series={veg} />
        ))}
      {(climatePoints.length > 0 || hasValues(heat)) && (
        <ChartCard
          title="Temperature"
          subtitle={[climatePoints.length ? "Air: NASA POWER vs 2001–2020 normal" : null, hasValues(heat) ? "Ground: MODIS land surface (day)" : null].filter(Boolean).join(" · ")}
          footer={seriesNote(heat, result.end)}
        >
          <TemperatureChart climate={climatePoints} surface={hasValues(heat) ? heat : undefined} />
        </ChartCard>
      )}
      {heat && !hasValues(heat) && <SeriesUnavailable title="Surface heat" series={heat} />}
      {climatePoints.length > 0 && (
        <ChartCard title="Rainfall" subtitle="Monthly total vs 2001–2020 normal · NASA POWER">
          <RainChart climate={climatePoints} />
        </ChartCard>
      )}
      {climatePoints.some((p) => p.soil !== null) && (
        <ChartCard title="Soil moisture" subtitle="Root-zone soil wetness vs normal · NASA POWER (MERRA-2)">
          <SoilChart climate={climatePoints} />
        </ChartCard>
      )}
      {air &&
        (hasValues(air) ? (
          <ChartCard title="Aerosols & dust" subtitle="Aerosol optical depth at 550 nm · MERRA-2 monthly" footer={seriesNote(air, result.end)}>
            <SingleSeriesChart series={air} color="#facc15" reference={{ y: 0.4, label: "hazy" }} />
          </ChartCard>
        ) : (
          <SeriesUnavailable title="Aerosols & dust" series={air} />
        ))}
      {snow && snowVisible && (
        <ChartCard title="Snow cover" subtitle="Average share of the area under snow · MODIS Terra monthly" footer={seriesNote(snow, result.end)}>
          <SingleSeriesChart series={snow} color="#a5b4fc" kind="area" />
        </ChartCard>
      )}
      {climate?.status === "error" && (
        <section className="rounded-2xl border border-earth-yellow/20 bg-earth-yellow/[0.06] p-5 text-sm text-earth-yellow">
          NASA POWER (climate) didn't respond: {climate.error}. Satellite results above are unaffected.
        </section>
      )}
    </div>
  );
}

export default function Analysis() {
  const [params, setParams] = useSearchParams();
  const workspace = useWorkspace();
  const { target, loading: targetLoading, error: targetError } = useAnalysisTarget(params);

  const periodParam = params.get("period");
  const period: PeriodId = (PERIOD_OPTIONS.find((o) => o.id === periodParam)?.id ?? "12") as PeriodId;
  const { start, end } = periodRange(period, params.get("start"), params.get("end"));
  const datasets = useMemo(() => parseDatasets(params.get("ds")), [params]);
  const run = useAnalysisRun(target, start, end, datasets);
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
    if (place.osm && hasBoundary(place)) {
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

  const onDrawn = (geometry: PolygonGeometry, kind: AreaKind) => {
    const area = workspace.addArea({ geometry, kind });
    setTargetParams({ area: area.id });
    revealResults();
  };

  const onArea = (id: string) => {
    setTargetParams({ area: id });
    revealResults();
  };

  const onPeriod = (next: PeriodId, customStart?: string, customEnd?: string) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === "12") updated.delete("period");
        else updated.set("period", next);
        if (next === "custom" && customStart && customEnd) {
          updated.set("start", customStart);
          updated.set("end", customEnd);
        } else {
          updated.delete("start");
          updated.delete("end");
        }
        return updated;
      },
      { replace: true },
    );
  };

  const onDatasets = (next: DatasetId[]) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next.length === ALL_DATASETS.length) updated.delete("ds");
        else updated.set("ds", next.join(","));
        return updated;
      },
      { replace: true },
    );

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const running = run.status === "running";
  const progressPct = run.progress ? Math.round((run.progress.done / Math.max(run.progress.total, 1)) * 100) : 0;

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden gradient-hero">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/3 top-0 h-[480px] w-[480px] max-w-[120vw] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px] animate-pulse-glow" />
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-1/3 h-[380px] w-[380px] max-w-[100vw] rounded-full bg-glow-blue/5 blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
      <div className="relative mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:py-8">
        <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="eyebrow mb-2">NASA GIBS · NASA POWER · MERRA-2</p>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-primary glow-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-4xl">
              Analyze any place <span className="text-gradient">on Earth</span>
            </h1>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Choose a place — search it, click the map, draw an outline or use your location. TerraVision reads NASA satellite imagery and climate records for
            that exact area and explains what changed. Every number below is measured, not simulated.
          </p>
        </motion.header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px),1fr]">
          <aside aria-label="Analysis settings" className="space-y-6 rounded-2xl glass-strong p-4 sm:p-5 lg:sticky lg:top-20">
            <LocationPicker target={target} loading={targetLoading} onPlace={onPlace} onPoint={onPoint} onDrawn={onDrawn} onArea={onArea} />
            <PeriodPicker period={period} start={start} end={end} onChange={onPeriod} />
            <DatasetPicker selected={datasets} onChange={onDatasets} />
          </aside>

          <div ref={resultsRef} className="min-w-0 scroll-mt-20 space-y-5">
            {targetError && (
              <section className="flex items-start gap-3 rounded-2xl border border-earth-yellow/25 bg-earth-yellow/[0.07] p-4 text-sm text-earth-yellow">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {targetError}
              </section>
            )}

            {!target && !targetLoading && !targetError && (
              <EmptyCard
                title="Pick a place to start"
                action={
                  <div className="flex flex-col items-center gap-3">
                    <span className="section-label">Or try an example</span>
                    <div className="flex flex-wrap justify-center gap-2">
                      {EXAMPLES.map((example) => (
                        <button
                          key={example.name}
                          type="button"
                          onClick={() => {
                            setTargetParams({ lat: String(example.lat), lon: String(example.lon), r: String(example.r), name: example.name, ctx: example.ctx });
                            revealResults();
                          }}
                          className="btn-glass px-3.5 py-2 text-sm"
                        >
                          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" /> {example.name}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                Search for a city, region or country on the left, click anywhere on the small map, or draw your own area. Areas you drew on the Explore map show up
                there too.
              </EmptyCard>
            )}

            {targetLoading && !target && (
              <div role="status" aria-label="Fetching the boundary from OpenStreetMap" className="space-y-5">
                <div className="grid gap-5 rounded-2xl p-5 glass sm:grid-cols-[13rem,1fr]">
                  <Skeleton className="aspect-[4/3] w-full rounded-xl" />
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-32" />
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
                <ResultsHeader target={target} result={run.result} report={run.report} running={running} shareUrl={shareUrl} />

                {running && (
                  <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 backdrop-blur-xl" role="status" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-foreground/85">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Reading NASA data{run.progress?.label && run.progress.label !== "Starting" ? ` · ${run.progress.label}` : ""}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {run.progress?.done ?? 0}/{run.progress?.total ?? "…"}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full gradient-primary glow-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                )}

                {run.status === "error" && (
                  <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-earth-red/25 bg-earth-red/[0.07] p-4 text-sm text-earth-red">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> {run.error}
                    </span>
                    <button type="button" onClick={run.rerun} className="btn-glass px-3 py-1.5 text-xs">
                      <RefreshCw className="h-3.5 w-3.5" /> Try again
                    </button>
                  </section>
                )}

                {running && !run.result && <ReportSkeleton />}

                {run.result && run.report && (
                  <div className={cn("space-y-5 transition-opacity", running && "pointer-events-none opacity-50")}>
                    <InsightPanel key={run.result.generatedAt} report={run.report} result={run.result} />
                    <KpiGrid kpis={run.report.kpis} />
                    <Charts result={run.result} />
                    <FindingsList findings={run.report.findings} />
                    <Methodology report={run.report} result={run.result} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
