import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Globe, Loader2, MapPin, RefreshCw } from "lucide-react";
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
    <div className="space-y-6" aria-hidden="true">
      <div className="glass rounded-2xl p-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="glass rounded-2xl p-6">
        <Skeleton className="h-4 w-28 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-tile rounded-lg p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="glass rounded-2xl p-6 space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}

function SeriesUnavailable({ title, series }: { title: string; series: SatelliteSeries }) {
  return (
    <div className="glass rounded-2xl p-6">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {series.status === "error"
          ? `NASA GIBS couldn't be reached for this dataset (${series.error ?? "network error"}). Try again in a moment.`
          : "No valid pixels for this area in the selected period — for example open water, permanent cloud, or a product that doesn't cover this region."}
      </p>
    </div>
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
    <div className="grid gap-6 2xl:grid-cols-2">
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
        <section className="glass rounded-2xl p-6 text-sm text-tone-warn">
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
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground">Area Analysis</h1>
          </div>
          <p className="text-muted-foreground">
            Choose a place, a time range and the NASA datasets to read. TerraVision measures that exact area in NASA satellite imagery and climate records and explains
            what changed — every number is measured, not simulated.
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
              <PeriodPicker period={period} start={start} end={end} onChange={onPeriod} />
              <DatasetPicker selected={datasets} onChange={onDatasets} />
            </section>
          </div>

          {/* Right Report Section */}
          <section ref={resultsRef} aria-label="Report" className="min-w-0 scroll-mt-20 space-y-6">
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
                <ResultsHeader target={target} result={run.result} report={run.report} running={running} shareUrl={shareUrl} />

                {running && (
                  <div className="glass rounded-2xl p-6" role="status" aria-live="polite">
                    <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Reading NASA data{run.progress?.label && run.progress.label !== "Starting" ? ` · ${run.progress.label}` : ""}
                      </span>
                      <span className="font-mono text-foreground">
                        {run.progress?.done ?? 0}/{run.progress?.total ?? "…"}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full gradient-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
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
                  <div className={cn("space-y-6 transition-opacity", running && "pointer-events-none opacity-50")}>
                    <InsightPanel key={run.result.generatedAt} report={run.report} result={run.result} />
                    <KpiGrid kpis={run.report.kpis} />
                    <Charts result={run.result} />
                    <FindingsList findings={run.report.findings} />
                    <Methodology report={run.report} result={run.result} />
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
