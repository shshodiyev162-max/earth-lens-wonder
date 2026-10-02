import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Check, CircleAlert, Copy, Download, ExternalLink, Info, Loader2, Map as MapIcon, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Sparkline } from "./Charts";
import type { Finding, InsightReport, Kpi, Tone } from "@/lib/analysis/insights";
import type { AnalysisResult, AnalysisTarget, DatasetId } from "@/lib/analysis/types";
import { DATASET_BY_ID } from "@/lib/analysis/run";
import { buildCsv, downloadText, slugify } from "@/lib/analysis/export";
import { isAiConfigured, requestAiNarrative, type AiNarrative } from "@/lib/analysisClient";
import { formatMonth } from "@/lib/gibs/time";
import { formatArea, formatLatLng } from "@/lib/geo/geometry";
import { cn } from "@/lib/utils";

const TONE_STYLE: Record<Tone, { icon: typeof Info; className: string }> = {
  critical: { icon: AlertTriangle, className: "text-red-300 bg-red-500/10 border-red-500/25" },
  warning: { icon: CircleAlert, className: "text-amber-200 bg-amber-500/10 border-amber-500/25" },
  positive: { icon: BadgeCheck, className: "text-emerald-200 bg-emerald-500/10 border-emerald-500/25" },
  neutral: { icon: Info, className: "text-slate-200 bg-white/[0.03] border-white/10" },
};

const CONCERN_STYLE = {
  low: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  moderate: "bg-sky-500/15 text-sky-200 border-sky-500/30",
  elevated: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  high: "bg-red-500/15 text-red-200 border-red-500/30",
};

export function ResultsHeader({ target, result, shareUrl }: { target: AnalysisTarget; result: AnalysisResult | null; shareUrl: string }) {
  const [copied, setCopied] = useState(false);
  const mapHref = `/map?${new URLSearchParams({
    lat: target.center[0].toFixed(4),
    lon: target.center[1].toFixed(4),
    z: String(target.areaKm2 > 200_000 ? 5 : target.areaKm2 > 20_000 ? 7 : target.areaKm2 > 1_000 ? 9 : 11),
    layer: "MODIS_Terra_L3_NDVI_16Day",
  })}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the link — copy it from the address bar instead.");
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-[#0a1422]/80 p-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Area report</p>
        <h2 className="mt-1 truncate text-2xl font-bold text-white">{target.name}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {[target.context, formatArea(target.areaKm2), formatLatLng(target.center, 2)].filter(Boolean).join(" · ")}
        </p>
        {result && (
          <p className="mt-1 text-xs text-slate-500">
            {formatMonth(result.start, "long")} – {formatMonth(result.end, "long")} · NASA GIBS (MODIS, MERRA-2) · NASA POWER
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={mapHref} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
          <MapIcon className="h-3.5 w-3.5" /> View on map
        </Link>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          disabled={!result}
          onClick={() => result && downloadText(`terravision-${slugify(target.name)}-${result.start}-to-${result.end}.csv`, buildCsv(result))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Download CSV
        </button>
      </div>
    </div>
  );
}

export function InsightPanel({ report, result }: { report: InsightReport; result: AnalysisResult }) {
  const [ai, setAi] = useState<{ status: "idle" | "loading" | "done" | "error"; narrative?: AiNarrative; error?: string }>({ status: "idle" });
  const aiEnabled = isAiConfigured();

  const askAi = async () => {
    setAi({ status: "loading" });
    try {
      setAi({ status: "done", narrative: await requestAiNarrative(result, report) });
    } catch (error) {
      setAi({ status: "error", error: error instanceof Error ? error.message : "AI request failed" });
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0b1a2c] to-[#0a1422] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", CONCERN_STYLE[report.concern.level])}>
          Concern: {report.concern.level}
        </span>
        <span className="text-[11px] text-slate-500">Computed from the measurements below — thresholds are listed in each finding.</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug text-white">{report.headline}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{report.summary}</p>

      {aiEnabled && (
        <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3">
          {ai.status === "done" && ai.narrative ? (
            <>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-200">
                <Sparkles className="h-3.5 w-3.5" /> AI briefing (written from the numbers above)
              </div>
              <p className="text-sm leading-relaxed text-slate-200">{ai.narrative.summary}</p>
              {ai.narrative.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                  {ai.narrative.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={askAi}
              disabled={ai.status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-60"
            >
              {ai.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {ai.status === "loading" ? "Writing briefing…" : "Write an AI briefing"}
            </button>
          )}
          {ai.status === "error" && <p className="mt-2 text-xs text-amber-300">{ai.error}</p>}
        </div>
      )}
    </section>
  );
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-5">
      {kpis.map((kpi) => (
        <div key={kpi.id} className="rounded-2xl border border-white/10 bg-[#0a1422]/80 p-4">
          <div className="text-[11px] font-medium text-slate-400">{kpi.label}</div>
          <div
            className={cn(
              "mt-1 text-2xl font-bold",
              kpi.tone === "critical" ? "text-red-300" : kpi.tone === "warning" ? "text-amber-200" : kpi.tone === "positive" ? "text-emerald-300" : "text-white",
            )}
          >
            {kpi.value}
          </div>
          <div className="truncate text-[11px] text-slate-500" title={kpi.sub}>
            {kpi.sub}
          </div>
          <Sparkline values={kpi.spark} color={DATASET_BY_ID[kpi.dataset as DatasetId]?.color} className="mt-2" />
        </div>
      ))}
    </div>
  );
}

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1422]/80 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <TrendingUp className="h-4 w-4 text-primary" /> What the data shows
      </h3>
      <ul className="space-y-2">
        {findings.map((finding) => {
          const style = TONE_STYLE[finding.tone];
          const Icon = style.icon;
          return (
            <li key={finding.id} className={cn("flex gap-3 rounded-xl border p-3", style.className)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{finding.title}</p>
                {finding.detail && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{finding.detail}</p>}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">{DATASET_BY_ID[finding.dataset]?.source}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Methodology({ report, result }: { report: InsightReport; result: AnalysisResult }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1422]/60 p-5 text-xs leading-relaxed text-slate-400">
      <h3 className="mb-2 text-sm font-semibold text-white">How these numbers are made</h3>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          Satellite values come from NASA GIBS monthly products. For every month the app requests an image of the area, rasterises the area outline onto it
          and converts each pixel back to its physical value using NASA's official colormap. The mean of all valid pixels is shown; the band is the 10th–90th
          percentile.
        </li>
        <li>“Measured” share = pixels with a valid value ÷ pixels in the area. Water, persistent cloud and snow can lower it for vegetation and surface heat.</li>
        <li>
          Climate comes from the NASA POWER API (MERRA-2 reanalysis and CERES satellite radiation) at{" "}
          {result.climate && result.climate.samplePoints.length > 1 ? `${result.climate.samplePoints.length} points inside the area, averaged` : "the area's centre"}, compared with the
          2001–2020 monthly normals.
        </li>
        <li>Findings use fixed thresholds (e.g. rainfall below 60% of normal, surface heat above 45 °C, AOD above 0.4) and are educational, not official warnings.</li>
      </ul>
      {report.caveats.length > 0 && (
        <>
          <h4 className="mb-1 mt-4 text-xs font-semibold text-slate-200">Notes for this report</h4>
          <ul className="list-disc space-y-1 pl-5">
            {report.caveats.map((caveat, i) => (
              <li key={i}>{caveat}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          NASA GIBS <ExternalLink className="h-3 w-3" />
        </a>
        <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          NASA POWER <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}
