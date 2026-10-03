import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Check, CircleAlert, Copy, Download, ExternalLink, Info, Loader2, Map as MapIcon, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Sparkline } from "./Charts";
import PlaceThumbnail from "./PlaceThumbnail";
import type { Finding, InsightReport, Kpi, Tone } from "@/lib/analysis/insights";
import type { AnalysisResult, AnalysisTarget, DatasetId } from "@/lib/analysis/types";
import { DATASET_BY_ID } from "@/lib/analysis/run";
import { buildCsv, downloadText, slugify } from "@/lib/analysis/export";
import { isAiConfigured, requestAiNarrative, type AiNarrative } from "@/lib/analysisClient";
import { formatMonth } from "@/lib/gibs/time";
import { formatArea, formatLatLng } from "@/lib/geo/geometry";
import { cn } from "@/lib/utils";

const TONE_STYLE: Record<Tone, { icon: typeof Info; className: string }> = {
  critical: { icon: AlertTriangle, className: "text-tone-bad" },
  warning: { icon: CircleAlert, className: "text-tone-warn" },
  positive: { icon: BadgeCheck, className: "text-tone-good" },
  neutral: { icon: Info, className: "text-accent-cyan" },
};

const CONCERN_STYLE: Record<InsightReport["concern"]["level"], string> = {
  low: "bg-green-500/10 text-tone-good border-green-500/30",
  moderate: "bg-cyan-500/10 text-accent-cyan border-cyan-500/30",
  elevated: "bg-yellow-500/10 text-tone-warn border-yellow-500/30",
  high: "bg-red-500/10 text-tone-bad border-red-500/30",
};

const CONCERN_LABEL: Record<InsightReport["concern"]["level"], string> = {
  low: "Low concern",
  moderate: "Moderate concern",
  elevated: "Elevated concern",
  high: "High concern",
};

export function ConcernBadge({ level }: { level: InsightReport["concern"]["level"] }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", CONCERN_STYLE[level])}>{CONCERN_LABEL[level]}</span>;
}

/** Report header: satellite thumbnail of the place, its name, the concern level and the actions. */
export function ResultsHeader({
  target,
  result,
  report,
  running,
  shareUrl,
}: {
  target: AnalysisTarget;
  result: AnalysisResult | null;
  report?: InsightReport | null;
  running?: boolean;
  shareUrl: string;
}) {
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
    <div className="glass rounded-2xl p-6">
      <div className="grid gap-5 sm:grid-cols-[12rem,1fr]">
        <Link to={mapHref} aria-label={`Open ${target.name} on the map`} className="block rounded-xl">
          <PlaceThumbnail key={`${target.name}-${target.bbox.join(",")}`} target={target} />
        </Link>
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Area report</span>
            {report ? <ConcernBadge level={report.concern.level} /> : running ? <span className="skeleton h-5 w-28 rounded-full" role="status" aria-label="Working out the concern level" /> : null}
          </div>
          <h2 translate="no" className="mt-1 break-words text-2xl font-display font-bold text-foreground">
            {target.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{[target.context, formatArea(target.areaKm2), formatLatLng(target.center, 2)].filter(Boolean).join(" · ")}</p>
          {result && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatMonth(result.start, "long")} – {formatMonth(result.end, "long")} · NASA GIBS (MODIS, MERRA-2) · NASA POWER
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2 sm:mt-auto sm:pt-4">
            <button
              type="button"
              disabled={!result}
              onClick={() => result && downloadText(`terravision-${slugify(target.name)}-${result.start}-to-${result.end}.csv`, buildCsv(result))}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
            <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium glass text-foreground hover:bg-card/80 transition-colors">
              {copied ? <Check className="h-4 w-4 text-tone-good" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
            </button>
            <Link to={mapHref} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium glass text-foreground hover:bg-card/80 transition-colors">
              <MapIcon className="h-4 w-4" /> View on map
            </Link>
          </div>
        </div>
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
    <div className="glass rounded-2xl p-6 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Summary</h2>
      <p className="text-base font-medium text-foreground">{report.headline}</p>
      <p className="text-sm text-foreground leading-relaxed">{report.summary}</p>
      <p className="text-xs text-muted-foreground">
        Overall concern level: <span className="font-medium text-foreground">{report.concern.level}</span>. Computed from the measurements below — the thresholds are listed in each
        finding. Educational, not an official warning.
      </p>

      {aiEnabled && (
        <div className="pt-2">
          {ai.status === "done" && ai.narrative ? (
            <>
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> AI briefing (written from the numbers above)
              </h3>
              <p className="text-sm text-foreground leading-relaxed">{ai.narrative.summary}</p>
              {ai.narrative.bullets.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
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
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {ai.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {ai.status === "loading" ? "Writing briefing…" : "Write an AI briefing"}
            </button>
          )}
          {ai.status === "error" && <p className="mt-2 text-xs text-tone-warn">{ai.error}</p>}
        </div>
      )}
    </div>
  );
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Key numbers</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="bg-tile rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-1">{kpi.label}</div>
            <div
              className={cn(
                "text-2xl font-bold",
                kpi.tone === "critical" ? "text-tone-bad" : kpi.tone === "warning" ? "text-tone-warn" : kpi.tone === "positive" ? "text-tone-good" : "text-accent-cyan",
              )}
            >
              {kpi.value}
            </div>
            <div className="truncate text-xs text-muted-foreground" title={kpi.sub}>
              {kpi.sub}
            </div>
            <Sparkline values={kpi.spark} color={DATASET_BY_ID[kpi.dataset as DatasetId]?.color} className="mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <div className="glass rounded-2xl p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <TrendingUp className="h-4 w-4 text-primary" /> What the data shows
      </h3>
      <ul className="space-y-2">
        {findings.map((finding) => {
          const style = TONE_STYLE[finding.tone];
          const Icon = style.icon;
          return (
            <li key={finding.id} className="flex gap-3 rounded-lg bg-tile p-3">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.className)} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{finding.title}</p>
                {finding.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{finding.detail}</p>}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{DATASET_BY_ID[finding.dataset]?.source}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Methodology({ report, result }: { report: InsightReport; result: AnalysisResult }) {
  return (
    <div className="glass rounded-2xl p-6 space-y-3 text-xs leading-relaxed text-muted-foreground">
      <h3 className="text-sm font-semibold text-muted-foreground">How these numbers are made</h3>
      <ul className="list-disc list-inside space-y-1.5">
        <li>
          Satellite values come from NASA GIBS monthly products. For every month the app requests an image of the area, rasterises the area outline onto it and converts each
          pixel back to its physical value using NASA's official colormap. The mean of all valid pixels is shown; the band is the 10th–90th percentile.
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
          <h4 className="pt-1 text-xs font-semibold text-foreground">Notes for this report</h4>
          <ul className="list-disc list-inside space-y-1">
            {report.caveats.map((caveat, i) => (
              <li key={i}>{caveat}</li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-3 pt-1">
        <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          NASA GIBS <ExternalLink className="h-3 w-3" />
        </a>
        <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          NASA POWER <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
