import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Download, ExternalLink, Loader2, Map as MapIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import PlaceCover from "./PlaceCover";
import { describeResultPeriod, type InsightReport, type RecentConditions } from "@/lib/analysis/insights";
import type { AnalysisResult, AnalysisTarget } from "@/lib/analysis/types";
import { buildCsv, downloadText, slugify } from "@/lib/analysis/export";
import { isAiConfigured, requestAiNarrative, type AiNarrative } from "@/lib/analysisClient";
import { formatArea, formatLatLng } from "@/lib/geo/geometry";
import { formatMonth } from "@/lib/gibs/time";

/** The report's cover: the place from space and its name, then what was read and what you can do with it. */
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
    <header>
      <PlaceCover key={`${target.name}-${target.bbox.join(",")}`} target={target}>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">Area report</p>
        <h2 translate="no" className="mt-3 break-words font-editorial text-[clamp(3rem,6.4vw,5.75rem)] leading-[0.98] tracking-[-0.015em] text-white">
          {target.name}
        </h2>
        <p className="mt-3 font-mono text-[11px] tabular-nums text-white/75">{[target.context, formatArea(target.areaKm2), formatLatLng(target.center, 2)].filter(Boolean).join(" · ")}</p>
      </PlaceCover>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 border-b border-border px-6 py-3 md:px-10">
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{result ? describeResultPeriod(result).text : ""}</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!result || running}
            onClick={() => result && downloadText(`terrascope-${slugify(target.name)}-${result.start}-to-${result.end}.csv`, buildCsv(result))}
            className="btn-line px-3 py-1.5"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Download CSV
          </button>
          <button type="button" onClick={copy} className="btn-line px-3 py-1.5">
            {copied ? <Check className="h-3.5 w-3.5 text-tone-good" aria-hidden /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />} {copied ? "Copied" : "Copy link"}
          </button>
          <Link to={mapHref} className="btn-line px-3 py-1.5">
            <MapIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Open in Explore
          </Link>
        </div>
      </div>
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
    <section aria-labelledby="answer-title">
      <h3 id="answer-title" className="eyebrow">
        Is it changing?
      </h3>
      <p aria-live="polite" className="mt-4 max-w-4xl font-editorial text-[clamp(2rem,3.5vw,3.25rem)] leading-[1.06] tracking-[-0.01em] text-foreground">
        {running && <span className="text-muted-foreground">So far: </span>}
        {report.headline}
      </p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{report.summary}</p>

      {aiEnabled && !running && (
        <div className="mt-4">
          {ai.status === "done" && ai.narrative ? (
            <>
              <h4 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> AI briefing (written from the numbers above)
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
            <button type="button" onClick={askAi} disabled={ai.status === "loading"} className="btn-line">
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
      <h3 id="recent-title" className="eyebrow">
        Latest {recent.months} months vs the 2001–2020 normal
      </h3>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        {formatMonth(recent.from)} – {formatMonth(recent.to)}. Not a trend: one stretch of months beside what's usual, so a wet or hot year shows here without meaning the place is changing.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 md:grid-cols-4">
        {recent.figures.map((figure) => (
          <div key={figure.id}>
            <dt className="text-xs text-muted-foreground">{figure.label}</dt>
            <dd className="mt-1.5 font-mono text-[1.35rem] font-medium tabular-nums tracking-tight text-foreground">{figure.value}</dd>
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
      <summary className="flex cursor-pointer items-center text-xs font-medium pointer-coarse:min-h-11">How these numbers are made</summary>
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
          <h4 className="mt-3 font-medium text-foreground">Notes for this report</h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {report.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1 pointer-coarse:min-h-11">
          NASA GIBS <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1 pointer-coarse:min-h-11">
          NASA POWER <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </details>
  );
}
