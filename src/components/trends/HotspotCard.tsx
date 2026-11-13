import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { TONE_COLOUR, toneOf } from "@/components/analysis/tone";
import { demoAttr } from "@/lib/demo/scripts";
import { answerInWords, explainVerdict, formatP, signed } from "@/lib/analysis/stats";
import { rateText } from "@/lib/analysis/trend";
import { formatArea } from "@/lib/geo/geometry";
import type { Indicator } from "@/lib/query/indicators";
import type { PeriodPlan } from "@/lib/query/period";
import type { HotspotDetail } from "@/lib/trends/scan";
import { cn } from "@/lib/utils";
import PossibleCauses from "@/components/causes/PossibleCauses";
import type { CauseSetup } from "@/lib/causes/requests";
import YearTrendChart from "./YearTrendChart";

interface HotspotCardProps {
  hotspot: HotspotDetail;
  title: string;
  indicator: Indicator;
  plan: PeriodPlan;
  analysisHref: string;
  compareHref: string;
  /** Scan inside this hotspot for every chosen measure. */
  onScanHere?: () => void;
  /** What may be behind the change (null: not for this measure). */
  causes?: CauseSetup | null;
  onClose: () => void;
  className?: string;
}

/** Details of one hotspot, with links to the full analysis and the then-vs-now swipe. */
export default function HotspotCard({ hotspot, title, indicator, plan, analysisHref, compareHref, onScanHere, causes, onClose, className }: HotspotCardProps) {
  const verdict = hotspot.verdict;
  const rate = verdict ? rateText(verdict, { unit: indicator.unit, decimals: indicator.decimals }) : null;
  const compared = plan.kind === "comparison" ? `${plan.baseline[0]} → ${plan.recent[0]}` : `${plan.baseline[0]}–${plan.baseline[1]} → ${plan.recent[0]}–${plan.recent[1]}`;
  return (
    <section {...demoAttr("hotspot-card")} aria-label={`Hotspot ${hotspot.rank}: ${title}`} className={cn("float-surface w-full max-w-sm bg-panel/90 p-5 text-panel-foreground", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-panel-muted">Hotspot {String(hotspot.rank).padStart(2, "0")}</p>
        <button type="button" onClick={onClose} className="-m-1.5 rounded-full p-1.5 text-panel-muted hover:text-panel-foreground pointer-coarse:p-2.5" aria-label="Close hotspot details">
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <h2 translate="no" className="mt-2 font-editorial text-[1.75rem] leading-[1.08] text-panel-foreground">
        {title}
      </h2>
      {verdict && <p className="mt-1 font-editorial text-[1.2rem] leading-tight text-panel-muted">{answerInWords(verdict)}</p>}

      <div className="mt-3 border-t border-panel-line pt-2.5">
        <p className="font-mono text-base font-medium tabular-nums tracking-tight">{rate ? rate.rate : `${signed(hotspot.meanChange, indicator.decimals)} ${indicator.unit}`}</p>
        <p className="mt-0.5 font-mono text-[10.5px] tabular-nums text-panel-muted">{rate && verdict ? `${rate.range} · ${formatP(verdict.p)}` : compared}</p>
      </div>

      <div className="mt-3">
        <YearTrendChart
          series={hotspot.series}
          baseline={plan.baseline}
          recent={plan.recent}
          color={TONE_COLOUR[toneOf(verdict?.direction ?? "none", indicator.concern)]}
          unit={indicator.unit}
          decimals={indicator.decimals}
          showRange={Boolean(verdict)}
          label={`${indicator.subject} in ${title}, year by year${verdict ? ", with the trend line and its 95% range" : ""}`}
        />
      </div>

      {verdict && <p className="mt-3 text-xs leading-relaxed text-panel-soft">{explainVerdict(verdict, `${indicator.subject} here`, indicator.unit, indicator.decimals + 1)}</p>}

      <dl className="mt-3 font-mono text-[10.5px] tabular-nums">
        <div className="flex justify-between gap-3 border-t border-panel-line py-1.5">
          <dt className="text-panel-muted">Area</dt>
          <dd>{formatArea(hotspot.areaKm2)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-panel-line py-1.5">
          <dt className="text-panel-muted">Change, {compared}</dt>
          <dd className="whitespace-nowrap">
            {signed(hotspot.meanChange, indicator.decimals)} {indicator.unit}
          </dd>
        </div>
        {plan.kind === "trend" && (
          <div className="flex justify-between gap-3 border-t border-panel-line py-1.5">
            <dt className="text-panel-muted">Pixels with a significant trend</dt>
            <dd>{Math.round(hotspot.significantShare * 100)}%</dd>
          </div>
        )}
      </dl>

      {causes && <PossibleCauses setup={causes} className="mt-3 border-t border-panel-line pt-3" />}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={analysisHref} className="btn-solid group w-full">
          Open full analysis
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
        <Link to={compareHref} className="btn-line flex-1">
          Then vs now
        </Link>
        {onScanHere && (
          <button type="button" onClick={onScanHere} className="btn-line flex-1">
            Scan inside
          </button>
        )}
      </div>
    </section>
  );
}
