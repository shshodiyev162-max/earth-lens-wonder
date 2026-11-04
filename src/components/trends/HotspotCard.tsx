import { Link } from "react-router-dom";
import { BarChart3, Columns2, ScanSearch, X } from "lucide-react";
import { explainVerdict, signed } from "@/lib/analysis/stats";
import { formatArea } from "@/lib/geo/geometry";
import type { Indicator } from "@/lib/query/indicators";
import type { PeriodPlan } from "@/lib/query/period";
import type { HotspotDetail } from "@/lib/trends/scan";
import { cn } from "@/lib/utils";
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
  onClose: () => void;
  className?: string;
}

/** Details of one hotspot, with links to the full analysis and the then-vs-now swipe. */
export default function HotspotCard({ hotspot, title, indicator, plan, analysisHref, compareHref, onScanHere, onClose, className }: HotspotCardProps) {
  const color = hotspot.sign < 0 ? indicator.colors.decline : indicator.colors.increase;
  const verdict = hotspot.verdict;
  return (
    <section aria-label={`Hotspot ${hotspot.rank}: ${title}`} className={cn("w-full max-w-sm rounded-2xl border border-panel-line bg-panel/95 p-4 text-panel-foreground shadow-2xl backdrop-blur-xl", className)}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-cyan">Hotspot {hotspot.rank}</p>
          <h2 translate="no" className="text-base font-semibold leading-snug">
            {title}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-panel-muted hover:bg-panel-tint-strong hover:text-panel-foreground" aria-label="Close hotspot details">
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-panel-muted">Area</dt>
        <dd className="text-right font-medium">{formatArea(hotspot.areaKm2)}</dd>
        <dt className="text-panel-muted">Change</dt>
        <dd className="text-right font-medium">
          {signed(hotspot.meanChange, indicator.decimals)} {indicator.unit}
        </dd>
        <dt className="text-panel-muted">Compared</dt>
        <dd className="text-right font-medium">
          {plan.kind === "comparison" ? `${plan.baseline[0]} → ${plan.recent[0]}` : `${plan.baseline[0]}–${plan.baseline[1]} → ${plan.recent[0]}–${plan.recent[1]}`}
        </dd>
        {plan.kind === "trend" && (
          <>
            <dt className="text-panel-muted">Pixels with a significant trend</dt>
            <dd className="text-right font-medium">{Math.round(hotspot.significantShare * 100)}%</dd>
          </>
        )}
      </dl>
      {verdict && (
        <p className="mb-2 text-xs leading-relaxed text-panel-soft">
          <span className={cn("font-semibold", verdict.direction === "none" ? "text-panel-foreground" : verdict.direction === indicator.concern ? "text-tone-warn" : "text-tone-good")}>
            {verdict.label}
          </span>
          . {explainVerdict(verdict, `${indicator.subject} here`, indicator.unit, indicator.decimals)}
        </p>
      )}
      <YearTrendChart series={hotspot.series} baseline={plan.baseline} recent={plan.recent} color={color} unit={indicator.unit} decimals={indicator.decimals} label={`${indicator.subject} in ${title}, year by year`} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link to={analysisHref} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300">
          <BarChart3 className="h-3.5 w-3.5" /> Open full analysis
        </Link>
        <Link to={compareHref} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-panel-line bg-panel-tint px-3 py-2 text-xs font-semibold text-panel-foreground hover:border-cyan-400/50">
          <Columns2 className="h-3.5 w-3.5" /> Compare then vs now
        </Link>
        {onScanHere && (
          <button
            type="button"
            onClick={onScanHere}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-panel-line bg-panel-tint px-3 py-2 text-xs font-semibold text-panel-foreground hover:border-cyan-400/50 sm:col-span-2"
          >
            <ScanSearch className="h-3.5 w-3.5" /> Scan inside this area
          </button>
        )}
      </div>
    </section>
  );
}
