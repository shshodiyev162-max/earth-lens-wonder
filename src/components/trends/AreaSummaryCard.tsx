import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { TONE_COLOUR, toneOf } from "@/components/analysis/tone";
import { demoAttr } from "@/lib/demo/scripts";
import { answerInWords, explainVerdict, formatP, signed, type TrendVerdict } from "@/lib/analysis/stats";
import { rateText, type LongerPeriodHint } from "@/lib/analysis/trend";
import { formatArea } from "@/lib/geo/geometry";
import { percentChangeMeansSomething, type Indicator } from "@/lib/query/indicators";
import type { PeriodPlan } from "@/lib/query/period";
import type { ResultFilter } from "@/lib/trends/query";
import type { AreaSummary, YearValue } from "@/lib/trends/scan";
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-t border-panel-line py-2">
      <dt className="text-xs text-panel-muted">{label}</dt>
      <dd className="text-right font-mono text-xs tabular-nums text-panel-foreground">{children}</dd>
    </div>
  );
}

/** The answer for the whole area first, told the way the home page tells a finding, then the numbers behind it. */
export default function AreaSummaryCard(props: AreaSummaryCardProps) {
  const { name, kind, summary, verdict, series, indicator, plan, filter, seasonSubject, hotspotCount, hotspotKm2, analysisHref, compareHref, onZoom, hint, onTryAllYears } = props;
  const surface = props.surface ?? indicator.surface;
  const value = (v: number) => `${v.toFixed(indicator.decimals)} ${indicator.unit}`;
  const percent = summary.change !== null && summary.baselineMean && percentChangeMeansSomething(indicator) && Math.abs(summary.baselineMean) > 1e-6 ? (summary.change / Math.abs(summary.baselineMean)) * 100 : null;
  const threshold = `${(indicator.minChange * filter.minFactor).toFixed(Math.max(indicator.decimals, 2)).replace(/\.?0+$/, "")} ${indicator.unit}`;
  const windows = plan.kind === "comparison" ? [`${plan.baseline[0]}`, `${plan.recent[0]}`] : [`${plan.baseline[0]}–${plan.baseline[1]}`, `${plan.recent[0]}–${plan.recent[1]}`];
  const years = plan.kind === "comparison" ? `${plan.baseline[0]} vs ${plan.recent[0]}` : `${plan.startYear}–${plan.endYear}`;
  // Sea measures are read on water, air measures everywhere (or over the water of a named sea).
  const ground = surface === "water" ? "Sea" : surface === "any" ? "Area" : "Land";
  const groundWord = ground.toLowerCase();
  const rate = verdict ? rateText(verdict, { unit: indicator.unit, decimals: indicator.decimals }) : null;
  const trendColour = TONE_COLOUR[toneOf(verdict?.direction ?? "none", indicator.concern)];

  return (
    <section {...demoAttr("whole-area")} aria-label={`The whole area: ${name}`}>
      <p className="eyebrow text-panel-muted">
        <span translate="no">{name}</span> · {years}
      </p>
      <p className="mt-4 font-editorial text-[1.35rem] leading-tight text-panel-muted">Is {indicator.noun} changing?</p>
      <h2 className="mt-0.5 font-editorial text-[2.5rem] leading-[1.04] tracking-[-0.01em] text-panel-foreground">
        {verdict ? answerInWords(verdict) : plan.kind === "comparison" ? "Two seasons can't show a trend." : "Too few years to test."}
      </h2>

      {rate && (
        <div className="mt-4 border-t border-panel-line pt-3">
          <p className="font-mono text-[1.15rem] font-medium tabular-nums tracking-tight text-panel-foreground">{rate.rate}</p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-panel-muted">
            {rate.range} · {verdict && formatP(verdict.p)}
          </p>
        </div>
      )}

      <div className="mt-4 text-panel-foreground">
        <YearTrendChart
          series={series}
          baseline={plan.baseline}
          recent={plan.recent}
          color={trendColour}
          unit={indicator.unit}
          decimals={indicator.decimals}
          showRange={Boolean(verdict)}
          label={`${indicator.subject} across ${name}, year by year${verdict ? ", with the trend line and its 95% range" : ""}`}
        />
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-panel-soft">
        {verdict
          ? explainVerdict(verdict, seasonSubject, indicator.unit, indicator.decimals + 1)
          : summary.change !== null
            ? `${seasonSubject} changed by ${signed(summary.change, indicator.decimals)} ${indicator.unit} between ${windows[0]} and ${windows[1]}. Choose a range of years for a trend test.`
            : ""}
      </p>

      {hint && onTryAllYears && (
        <div {...demoAttr("hint")} className="mt-4 space-y-2.5 rounded-lg border border-panel-line p-3">
          <p className="text-xs leading-relaxed text-panel-soft">{hint.text}</p>
          <button type="button" onClick={onTryAllYears} className="btn-line">
            Scan every year since {hint.startYear}
          </button>
        </div>
      )}

      <dl className="mt-4">
        <Row label={`${ground} scanned`}>
          {formatArea(summary.scannedKm2)}
          <span className="block text-[10px] text-panel-muted">{Math.round((summary.measuredKm2 / Math.max(summary.scannedKm2, 1e-9)) * 100)}% with data in both periods</span>
        </Row>
        {summary.baselineMean !== null && summary.recentMean !== null && summary.change !== null && (
          <>
            <Row label={`Average, ${windows[0]}`}>{value(summary.baselineMean)}</Row>
            <Row label={`Average, ${windows[1]}`}>{value(summary.recentMean)}</Row>
            <Row label="Change">
              {signed(summary.change, indicator.decimals)} {indicator.unit}
              {percent !== null && <span className="text-panel-muted"> ({signed(percent, Math.abs(percent) < 10 ? 1 : 0)}%)</span>}
            </Row>
          </>
        )}
        <Row label={`${ground} that fell by ${threshold} or more`}>
          {formatArea(summary.declinedKm2)}
          <span className="text-panel-muted">{share(summary.declinedKm2, summary.measuredKm2)}</span>
        </Row>
        <Row label={`${ground} that rose by ${threshold} or more`}>
          {formatArea(summary.increasedKm2)}
          <span className="text-panel-muted">{share(summary.increasedKm2, summary.measuredKm2)}</span>
        </Row>
        <Row label="Hotspots listed below">
          {hotspotCount} · {formatArea(hotspotKm2)}
        </Row>
      </dl>
      <p className="mt-2 border-t border-panel-line pt-2 text-[11px] leading-relaxed text-panel-muted">
        {plan.kind === "trend"
          ? `“Fell” and “rose” count ${groundWord} whose own yearly trend agrees${filter.strict ? " clearly (p < 0.05)" : ""}, including small patches too scattered to be listed as hotspots.`
          : `“Fell” and “rose” count ${groundWord} by the change between the two seasons, including small patches too scattered to be listed as hotspots.`}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link to={analysisHref} className="btn-solid group w-full">
          Open full analysis
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
        <Link to={compareHref} className="btn-line flex-1">
          Compare then vs now
        </Link>
        <button type="button" onClick={onZoom} className="btn-line flex-1">
          Whole area on the map
        </button>
      </div>
      <p className="sr-only">{kind}</p>
    </section>
  );
}
