import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Download, ExternalLink, Loader2, Map as MapIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import PlaceThumbnail from "./PlaceThumbnail";
import { describeResultPeriod, type InsightReport, type RecentConditions } from "@/lib/analysis/insights";
import type { AnalysisResult, AnalysisTarget } from "@/lib/analysis/types";
import { buildCsv, downloadText, slugify } from "@/lib/analysis/export";
import { isAiConfigured, requestAiNarrative, type AiNarrative } from "@/lib/analysisClient";
import { formatArea, formatLatLng } from "@/lib/geo/geometry";
import { formatMonth } from "@/lib/gibs/time";

const ACTION = "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60 pointer-coarse:min-h-11";

/** Report header: the place, what was read, and the things you can do with the report. */
export function ResultsHeader({ target, result, running, shareUrl }: { target: AnalysisTarget; result: AnalysisResult | null; running?: boolean; shareUrl: string }) {
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
      toast.error("Couldn't copy the link. Copy it from the address bar instead.");
    }
  };

  return (
    <header className="grid gap-5 sm:grid-cols-[1fr,10rem]">
      <div className="flex min-w-0 flex-col">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Area report</p>
        <h2 translate="no" className="mt-2 break-words font-editorial text-[clamp(2.25rem,3.6vw,3.25rem)] leading-[1.05] tracking-[-0.01em] text-foreground">
          {target.name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{[target.context, formatArea(target.areaKm2), formatLatLng(target.center, 2)].filter(Boolean).join(" · ")}</p>
        {result && <p className="mt-0.5 text-sm text-muted-foreground">{describeResultPeriod(result).text}</p>}
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-auto sm:pt-4">
          <button
            type="button"
            disabled={!result || running}
            onClick={() => result && downloadText(`terrascope-${slugify(target.name)}-${result.start}-to-${result.end}.csv`, buildCsv(result))}
            className={ACTION}
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Download CSV
          </button>
          <button type="button" onClick={copy} className={ACTION}>
            {copied ? <Check className="h-3.5 w-3.5 text-tone-good" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copied" : "Copy link"}
          </button>
          <Link to={mapHref} className={ACTION}>
            <MapIcon className="h-3.5 w-3.5" aria-hidden /> View on map
          </Link>
        </div>
      </div>
      <Link to={mapHref} aria-label={`Open ${target.name} on the map`} className="block rounded-xl sm:order-last">
        <PlaceThumbnail key={`${target.name}-${target.bbox.join(",")}`} target={target} />
      </Link>
    </header>
  );
}

/** The answer in one sentence, written from the trend tests alone. */
export function AnswerPanel({ report, result, running }: { report: InsightReport; result: AnalysisResult; running: boolean }) {
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
    <section aria-labelledby="answer-title" className="border-t border-border pt-6">
      <h3 id="answer-title" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Is it changing?
      </h3>
      <p aria-live="polite" className="mt-3 font-editorial text-[clamp(1.6rem,2.5vw,2.25rem)] leading-[1.15] text-foreground">
        {running && <span className="text-muted-foreground">So far: </span>}
        {report.headline}
      </p>
      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-muted-foreground">{report.summary}</p>

      {aiEnabled && !running && (
        <div className="mt-4">
          {ai.status === "done" && ai.narrative ? (
            <>
              <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> AI briefing (written from the numbers above)
              </h4>
              <p className="text-sm leading-relaxed text-foreground">{ai.narrative.summary}</p>
              {ai.narrative.bullets.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {ai.narrative.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <button type="button" onClick={askAi} disabled={ai.status === "loading"} className={ACTION}>
              {ai.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
              {ai.status === "loading" ? "Writing briefing…" : "Write an AI briefing"}
            </button>
          )}
          {ai.status === "error" && <p className="mt-2 text-xs text-tone-warn">{ai.error}</p>}
        </div>
      )}
    </section>
  );
}

/** How the latest months compare with what's usual for the same months. */
export function RecentPanel({ recent }: { recent: RecentConditions }) {
  return (
    <section aria-labelledby="recent-title">
      <h3 id="recent-title" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Latest {recent.months} months vs the 2001–2020 normal
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatMonth(recent.from)} – {formatMonth(recent.to)}. Not a trend: one stretch of months beside what's usual, so a wet or hot year shows here without meaning the place is changing.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 md:grid-cols-4">
        {recent.figures.map((figure) => (
          <div key={figure.id}>
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className="mt-1 font-mono text-lg font-medium tabular-nums text-foreground">{figure.value}</dd>
            <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{figure.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Methodology({ report, result }: { report: InsightReport; result: AnalysisResult }) {
  return (
    <details className="rounded-lg border border-border p-4 text-xs leading-relaxed text-muted-foreground">
      <summary className="flex cursor-pointer items-center text-xs font-semibold pointer-coarse:min-h-11">How these numbers are made</summary>
      <ul className="mt-3 list-inside list-disc space-y-1.5">
        <li>
          Satellite values come from NASA GIBS monthly products. For every month the app requests an image of the area, rasterises the area outline onto it and converts each pixel back to its physical value using NASA's official
          colour scale. The mean of all valid pixels is shown; the band is the 10th–90th percentile.
        </li>
        <li>“Measured” share = pixels with a valid value ÷ pixels in the area. Water, persistent cloud and snow can lower it for vegetation and surface heat.</li>
        <li>
          Climate comes from the NASA POWER service (MERRA-2 reanalysis and CERES satellite radiation) at{" "}
          {result.climate && result.climate.samplePoints.length > 1 ? `${result.climate.samplePoints.length} points inside the area, averaged` : "the area's centre"}, compared with the 2001–2020 monthly normals.
        </li>
        <li>
          Each year becomes one value (the average of the chosen months; rainfall, evaporation and snowfall are their total). A year needs at least three quarters of its months to count. The Mann–Kendall test then asks whether those values
          rise or fall more consistently than chance would allow, and Sen's slope gives the rate with its 95% range.
        </li>
        <li>This is educational, not an official warning. A change here says what the record shows, not why it happened.</li>
      </ul>
      {report.caveats.length > 0 && (
        <>
          <h4 className="mt-3 font-semibold text-foreground">Notes for this report</h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {report.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          NASA GIBS <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          NASA POWER <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </details>
  );
}
