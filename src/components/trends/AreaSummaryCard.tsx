import { Link } from "react-router-dom";
import { demoAttr } from "@/lib/demo/scripts";
import { BarChart3, Columns2, History, Maximize2 } from "lucide-react";
import { explainVerdict, formatP, signed } from "@/lib/analysis/stats";
import { formatArea } from "@/lib/geo/geometry";
import type { Indicator } from "@/lib/query/indicators";
import type { PeriodPlan } from "@/lib/query/period";
import type { ResultFilter } from "@/lib/trends/query";
import type { AreaSummary, YearValue } from "@/lib/trends/scan";
import type { TrendVerdict } from "@/lib/analysis/stats";
import type { LongerPeriodHint } from "@/lib/analysis/trend";
import { cn } from "@/lib/utils";
import YearTrendChart from "./YearTrendChart";

interface AreaSummaryCardProps {
  /** "Uzbekistan", "Area 1", "The map view" */
  name: string;
  /** "Country", "Outlined on the map"… */
  kind: string;
  summary: AreaSummary;
  verdict: TrendVerdict | null;
  series: YearValue[];
  indicator: Indicator;
  /** What the measure was read on here (air measures over a sea are read on its water). */
  surface?: Indicator["surface"];
  plan: PeriodPlan;
  filter: ResultFilter;
  /** "The Apr–Sep average" */
  seasonSubject: string;
  hotspotCount: number;
  hotspotKm2: number;
  analysisHref: string;
  compareHref: string;
  onZoom: () => void;
  /** "No clear trend" on a short record: offer the whole record. */
  hint?: LongerPeriodHint | null;
  onTryAllYears?: () => void;
}

function share(part: number, whole: number): string {
  if (!whole) return "";
  const pct = (part / whole) * 100;
  return pct > 0 && pct < 0.1 ? " (<0.1%)" : ` (${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%)`;
}

/** The whole scanned area in the same detail as a hotspot: numbers, verdict, chart and links. */
export default function AreaSummaryCard(props: AreaSummaryCardProps) {
  const { name, kind, summary, verdict, series, indicator, plan, filter, seasonSubject, hotspotCount, hotspotKm2, analysisHref, compareHref, onZoom, hint, onTryAllYears } = props;
  const surface = props.surface ?? indicator.surface;
  const value = (v: number) => `${v.toFixed(indicator.decimals)} ${indicator.unit}`;
  const percent = summary.change !== null && summary.baselineMean && indicator.unit !== "°C" && Math.abs(summary.baselineMean) > 1e-6 ? (summary.change / Math.abs(summary.baselineMean)) * 100 : null;
  const threshold = `${(indicator.minChange * filter.minFactor).toFixed(Math.max(indicator.decimals, 2)).replace(/\.?0+$/, "")} ${indicator.unit}`;
  const windows = plan.kind === "comparison" ? [`${plan.baseline[0]}`, `${plan.recent[0]}`] : [`${plan.baseline[0]}–${plan.baseline[1]}`, `${plan.recent[0]}–${plan.recent[1]}`];
  const tone =
    !verdict || verdict.direction === "none" || indicator.concern === "none" ? "text-panel-foreground" : verdict.direction === indicator.concern ? "text-tone-warn" : "text-tone-good";
  // Sea measures are read on water, air measures everywhere (or over the water of a named sea).
  const ground = surface === "water" ? "Sea" : surface === "any" ? "Area" : "Land";
  const groundWord = ground.toLowerCase();

  return (
    <section {...demoAttr("whole-area")} aria-label={`The whole area: ${name}`} className="rounded-2xl border border-cyan-400/30 bg-panel-tint p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-cyan">The whole area</p>
      <h2 translate="no" className="text-base font-semibold leading-snug text-panel-foreground">
        {name}
      </h2>
      <p className="mb-3 text-[11px] text-panel-muted">{kind}</p>

      <dl className="mb-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-panel-muted">{ground} scanned</dt>
        <dd className="text-right font-medium text-panel-foreground">
          {formatArea(summary.scannedKm2)}
          <span className="block text-[10px] font-normal text-panel-muted">{Math.round((summary.measuredKm2 / Math.max(summary.scannedKm2, 1e-9)) * 100)}% with data in both periods</span>
        </dd>
        {summary.baselineMean !== null && summary.recentMean !== null && summary.change !== null && (
          <>
            <dt className="text-panel-muted">Average, {windows[0]}</dt>
            <dd className="text-right font-medium text-panel-foreground">{value(summary.baselineMean)}</dd>
            <dt className="text-panel-muted">Average, {windows[1]}</dt>
            <dd className="text-right font-medium text-panel-foreground">{value(summary.recentMean)}</dd>
            <dt className="text-panel-muted">Change</dt>
            <dd className="text-right font-medium text-panel-foreground">
              {signed(summary.change, indicator.decimals)} {indicator.unit}
              {percent !== null && <span className="text-panel-muted"> ({signed(percent, Math.abs(percent) < 10 ? 1 : 0)}%)</span>}
            </dd>
          </>
        )}
        {verdict && (
          <>
            <dt className="text-panel-muted">Trend (Sen's slope)</dt>
            <dd className="text-right font-medium text-panel-foreground">
              {signed(verdict.slopePerYear, indicator.decimals + 1)} {indicator.unit}/yr
              <span className="block text-[10px] font-normal text-panel-muted">
                {verdict.slopePerDecade !== null ? `${signed(verdict.slopePerDecade, indicator.decimals + 1)} per decade · ` : ""}
                {formatP(verdict.p)}
              </span>
              <span className="block text-[10px] font-normal text-panel-muted">
                95% range {signed(verdict.lowerPerYear, indicator.decimals + 1)} to {signed(verdict.upperPerYear, indicator.decimals + 1)} /yr
              </span>
            </dd>
          </>
        )}
        <dt className="text-panel-muted">
          {ground} that fell by {threshold} or more
        </dt>
        <dd className="text-right font-medium text-panel-foreground">
          {formatArea(summary.declinedKm2)}
          <span className="text-panel-muted">{share(summary.declinedKm2, summary.measuredKm2)}</span>
        </dd>
        <dt className="text-panel-muted">
          {ground} that rose by {threshold} or more
        </dt>
        <dd className="text-right font-medium text-panel-foreground">
          {formatArea(summary.increasedKm2)}
          <span className="text-panel-muted">{share(summary.increasedKm2, summary.measuredKm2)}</span>
        </dd>
        <dt className="text-panel-muted">Hotspots listed below</dt>
        <dd className="text-right font-medium text-panel-foreground">
          {hotspotCount} · {formatArea(hotspotKm2)}
        </dd>
      </dl>

      {verdict ? (
        <p className="mb-2 text-xs leading-relaxed text-panel-soft">
          <span className={cn("font-semibold", tone)}>{verdict.label}</span>. {explainVerdict(verdict, seasonSubject, indicator.unit, indicator.decimals + 1)}
        </p>
      ) : (
        summary.change !== null && (
          <p className="mb-2 text-xs leading-relaxed text-panel-soft">
            {seasonSubject} changed by {signed(summary.change, indicator.decimals)} {indicator.unit} between {windows[0]} and {windows[1]}. Two seasons alone can't show a trend — choose a range of years for a trend test.
          </p>
        )
      )}
      <p className="mb-2 text-[11px] leading-relaxed text-panel-muted">
        {plan.kind === "trend"
          ? `“Fell” and “rose” count ${groundWord} whose own yearly trend agrees${filter.strict ? " clearly (p < 0.05)" : ""}, including small patches too scattered to be listed as hotspots.`
          : `“Fell” and “rose” count ${groundWord} by the change between the two seasons, including small patches too scattered to be listed as hotspots.`}
      </p>

      <YearTrendChart
        series={series}
        baseline={plan.baseline}
        recent={plan.recent}
        color="#22d3ee"
        unit={indicator.unit}
        decimals={indicator.decimals}
        showRange={Boolean(verdict)}
        label={`${indicator.subject} across ${name}, year by year${verdict ? ", with the trend line and its 95% range" : ""}`}
      />
      {hint && onTryAllYears && (
        <div {...demoAttr("hint")} className="mt-3 space-y-2 rounded-lg border border-panel-line bg-panel p-3">
          <p className="text-[11px] leading-relaxed text-panel-soft">{hint.text}</p>
          <button
            type="button"
            onClick={onTryAllYears}
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-line bg-panel-tint px-3 py-1.5 text-xs font-semibold text-panel-foreground hover:border-cyan-400/50 pointer-coarse:min-h-11"
          >
            <History className="h-3.5 w-3.5" aria-hidden /> Scan every year since {hint.startYear}
          </button>
        </div>
      )}

      <div className="mt-3 grid gap-2">
        <Link to={analysisHref} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 pointer-coarse:min-h-11">
          <BarChart3 className="h-3.5 w-3.5" /> Open full analysis
        </Link>
        <Link to={compareHref} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-panel-line bg-panel px-3 py-2 text-xs font-semibold text-panel-foreground hover:border-cyan-400/50 pointer-coarse:min-h-11">
          <Columns2 className="h-3.5 w-3.5" /> Compare then vs now
        </Link>
        <button
          type="button"
          onClick={onZoom}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-panel-line bg-panel px-3 py-2 text-xs font-semibold text-panel-foreground hover:border-cyan-400/50 pointer-coarse:min-h-11"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Show the whole area on the map
        </button>
      </div>
    </section>
  );
}
