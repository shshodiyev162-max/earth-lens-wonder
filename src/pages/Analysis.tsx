import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Loader2, RefreshCw, Satellite } from "lucide-react";
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

function EmptyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#0a1422]/50 px-6 py-14 text-center">
      <Satellite className="mb-3 h-8 w-8 text-primary" />
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

function SeriesUnavailable({ title, series }: { title: string; series: SatelliteSeries }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1422]/60 p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
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
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 text-sm text-amber-100">
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
    <div className="min-h-[calc(100dvh-4rem)] bg-[#02070d]">
      <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:py-8">
        <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Analyze any place on Earth</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Choose a place — search it, click the map, draw an outline or use your location. TerraVision reads NASA satellite imagery and climate records for
            that exact area and explains what changed. Every number below is measured, not simulated.
          </p>
        </motion.header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px),1fr]">
          <aside className="space-y-6 rounded-2xl border border-white/10 bg-[#07111d]/90 p-5 lg:sticky lg:top-20">
            <LocationPicker target={target} loading={targetLoading} onPlace={onPlace} onPoint={onPoint} onDrawn={onDrawn} onArea={onArea} />
            <PeriodPicker period={period} start={start} end={end} onChange={onPeriod} />
            <DatasetPicker selected={datasets} onChange={onDatasets} />
          </aside>

          <div ref={resultsRef} className="min-w-0 scroll-mt-20 space-y-5">
            {targetError && (
              <section className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {targetError}
              </section>
            )}

            {!target && !targetLoading && !targetError && (
              <EmptyCard title="Pick a place to start">
                Search for a city, region or country on the left, click anywhere on the small map, or draw your own area. Areas you drew on the Explore map show up
                there too.
              </EmptyCard>
            )}

            {targetLoading && !target && (
              <EmptyCard title="Loading place…">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Fetching the boundary from OpenStreetMap
                </span>
              </EmptyCard>
            )}

            {target && (
              <>
                <ResultsHeader target={target} result={run.result} shareUrl={shareUrl} />

                {running && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4" role="status" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-300">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Reading NASA data{run.progress?.label && run.progress.label !== "Starting" ? ` · ${run.progress.label}` : ""}
                      </span>
                      <span className="font-mono text-slate-400">
                        {run.progress?.done ?? 0}/{run.progress?.total ?? "…"}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                )}

                {run.status === "error" && (
                  <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-4 text-sm text-red-100">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> {run.error}
                    </span>
                    <button type="button" onClick={run.rerun} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
                      <RefreshCw className="h-3.5 w-3.5" /> Try again
                    </button>
                  </section>
                )}

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
