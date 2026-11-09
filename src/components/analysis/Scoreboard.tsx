import { useEffect, useState } from "react";
import { ChevronRight, History } from "lucide-react";
import YearTrendChart from "@/components/trends/YearTrendChart";
import { RainChart, SingleSeriesChart, SoilChart, TemperatureChart, VegetationChart } from "./Charts";
import { levelNote } from "@/lib/analysis/insights";
import { metricValues, type MetricDef } from "@/lib/analysis/metrics";
import { formatSpan } from "@/lib/analysis/period";
import { DATASET_BY_ID } from "@/lib/analysis/run";
import { explainVerdict, formatP, signed, WEAK_EVIDENCE } from "@/lib/analysis/stats";
import { directionOf, isConcerning, metricNotes, missingDatasets, rankTrends, rateText, type MetricTrend } from "@/lib/analysis/trend";
import type { AnalysisProgress, AnalysisResult } from "@/lib/analysis/types";
import { METRIC_DEFINITIONS } from "@/lib/glossary";
import { cn } from "@/lib/utils";

const COLUMNS = "grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.15fr)_9.5rem_minmax(0,1.3fr)_5rem_7.5rem]";

/** Worrying changes, welcome changes, changes with no good or bad side, and no clear change. */
function toneOf(trend: MetricTrend): string {
  const direction = directionOf(trend);
  if (direction === "none") return "text-muted-foreground";
  if (trend.metric.concern === "none") return "text-accent-cyan";
  return isConcerning(trend.metric, direction) ? "text-tone-warn" : "text-tone-good";
}

function verdictLabel(trend: MetricTrend): string {
  if (trend.verdict) return trend.verdict.label;
  if (trend.comparison) return trend.comparison.label === "Not enough years to test" ? "Not tested" : trend.comparison.label;
  return "Not tested";
}

/** A lean short of the cut-off is weak evidence, shown as such rather than as nothing at all. */
function leanOf(trend: MetricTrend): string | null {
  const { verdict } = trend;
  if (!verdict || verdict.direction !== "none" || verdict.p >= WEAK_EVIDENCE || verdict.slopePerYear === 0) return null;
  return verdict.slopePerYear > 0 ? "leans up" : "leans down";
}

/** The chart of every month: measures with a normal to compare with get their own, the rest one line. */
function MonthlyChart({ metric, result }: { metric: MetricDef; result: AnalysisResult }) {
  const climate = result.climate?.status === "ok" ? result.climate.points : [];
  const vegetation = result.satellite.vegetation;
  if (metric.id === "ndvi" && vegetation) return <VegetationChart series={vegetation} />;
  if (metric.id === "airTemp") return <TemperatureChart climate={climate} />;
  if (metric.id === "rain") return <RainChart climate={climate} />;
  if (metric.id === "soil") return <SoilChart climate={climate} />;
  return (
    <SingleSeriesChart
      points={metricValues(result, metric.id)}
      label={metric.label}
      unit={metric.unit}
      decimals={metric.decimals}
      color={metric.color}
      kind={metric.id === "snow" || metric.id === "snowWater" ? "area" : "line"}
      reference={metric.id === "aod" ? { y: 0.4, label: "hazy" } : undefined}
    />
  );
}

function Details({ trend, result, compare }: { trend: MetricTrend; result: AnalysisResult; compare: ScoreboardProps["compare"] }) {
  const { metric, verdict, comparison, yearly, span, note } = trend;
  const unit = metric.unit ? ` ${metric.unit}` : "";
  const level = levelNote(metric, metricValues(result, metric.id));
  const notes = metricNotes(result, metric);
  return (
    <div className="grid gap-6 pb-6 pl-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
        {verdict && <p className="text-foreground">{explainVerdict(verdict, metric.subject, metric.unit, metric.decimals + 1)}</p>}
        {comparison && comparison.baselineMean !== null && comparison.recentMean !== null && compare && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-foreground">
            <dt className="text-muted-foreground">{formatSpan(compare.baseline)}, yearly average</dt>
            <dd className="text-right font-mono tabular-nums">
              {comparison.baselineMean.toFixed(metric.decimals)}
              {unit} <span className="text-muted-foreground">({comparison.baselineYears} yrs)</span>
            </dd>
            <dt className="text-muted-foreground">{formatSpan(compare.recent)}, yearly average</dt>
            <dd className="text-right font-mono tabular-nums">
              {comparison.recentMean.toFixed(metric.decimals)}
              {unit} <span className="text-muted-foreground">({comparison.recentYears} yrs)</span>
            </dd>
            {comparison.change !== null && (
              <>
                <dt className="text-muted-foreground">Change</dt>
                <dd className="text-right font-mono tabular-nums">
                  {signed(comparison.change, metric.decimals)}
                  {unit}
                  {comparison.percent !== null && <span className="text-muted-foreground"> ({signed(comparison.percent, Math.abs(comparison.percent) < 10 ? 1 : 0)}%)</span>}
                </dd>
              </>
            )}
            {comparison.p !== null && (
              <>
                <dt className="text-muted-foreground">Welch's t-test</dt>
                <dd className="text-right font-mono tabular-nums">{formatP(comparison.p)}</dd>
              </>
            )}
          </dl>
        )}
        {note && <p>{note}</p>}
        <p>{METRIC_DEFINITIONS[metric.id]}</p>
        {level && <p>{level}</p>}
        {notes.map((text) => (
          <p key={text} className="text-tone-warn">
            {text}
          </p>
        ))}
        <p className="text-xs">
          {metric.source}
          {span ? ` · years tested ${formatSpan(span)} (${yearly.filter((y) => y.value !== null).length})` : ""}
        </p>
      </div>
      <div className="min-w-0 space-y-5">
        <figure>
          <figcaption className="mb-1 text-xs text-muted-foreground">{verdict ? "One value per year, with the trend and its 95% range" : "One value per year"}</figcaption>
          <YearTrendChart
            series={yearly}
            baseline={compare?.baseline}
            recent={compare?.recent}
            color={metric.color}
            unit={metric.unit}
            decimals={metric.decimals}
            showRange={Boolean(verdict)}
            variant="page"
            label={`${metric.subject}, one value per year${verdict ? ", with the trend line and its 95% range" : ""}`}
          />
        </figure>
        <figure>
          <figcaption className="mb-1 text-xs text-muted-foreground">Month by month</figcaption>
          <div className="h-48">
            <MonthlyChart metric={metric} result={result} />
          </div>
        </figure>
      </div>
    </div>
  );
}

function Row({ trend, result, compare, startOpen }: { trend: MetricTrend; result: AnalysisResult; compare: ScoreboardProps["compare"]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  // The top row opens once the whole report is in, not while its order can still change.
  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);
  const { metric, verdict, comparison, yearly } = trend;
  const rate = verdict ? rateText(verdict, metric) : null;
  const lean = leanOf(trend);
  const p = verdict?.p ?? comparison?.p ?? null;
  const unit = metric.unit ? ` ${metric.unit}` : "";
  return (
    <li className="border-b border-border">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
        <summary className={cn("grid cursor-pointer list-none items-center gap-x-4 gap-y-1 rounded py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden", COLUMNS)}>
          <span className="flex min-w-0 items-center gap-1">
            <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
            <span className="min-w-0 text-sm font-medium text-foreground">{metric.label}</span>
          </span>
          <span className={cn("justify-self-end text-right text-xs font-semibold xl:justify-self-start xl:text-left", toneOf(trend))}>
            {verdictLabel(trend)}
            {lean && <span className="block font-normal text-muted-foreground">{lean}</span>}
          </span>
          <span className="min-w-0 pl-[18px] font-mono text-xs tabular-nums text-foreground xl:pl-0">
            {rate ? (
              <>
                {rate.rate}
                <span className="block text-[11px] text-muted-foreground">
                  {rate.range}
                  {p !== null && <span className="whitespace-nowrap xl:hidden"> · {formatP(p)}</span>}
                </span>
              </>
            ) : comparison && comparison.baselineMean !== null && comparison.recentMean !== null ? (
              <>
                {comparison.baselineMean.toFixed(metric.decimals)} → {comparison.recentMean.toFixed(metric.decimals)}
                {unit}
                {p !== null && <span className="block text-[11px] text-muted-foreground xl:hidden">{formatP(p)}</span>}
              </>
            ) : (
              <span className="text-muted-foreground">Too few years</span>
            )}
          </span>
          <span className="hidden font-mono text-xs tabular-nums text-muted-foreground xl:block">{p !== null ? formatP(p) : "—"}</span>
          <span className="justify-self-end">
            <YearTrendChart series={yearly} color={metric.color} unit={metric.unit} decimals={metric.decimals} compact variant="page" label={`${metric.label}, one value per year`} />
          </span>
        </summary>
        {open && <Details trend={trend} result={result} compare={compare} />}
      </details>
    </li>
  );
}

interface ScoreboardProps {
  result: AnalysisResult;
  trends: MetricTrend[];
  /** Two periods compared, or null for a trend over the whole period. */
  compare: { baseline: [number, number]; recent: [number, number] } | null;
  running: boolean;
  progress: AnalysisProgress | null;
  /** Reruns with every year NASA has, when a longer record could help. */
  onTryAllYears?: () => void;
}

/** Every measure on one line: its verdict, its rate and range, and its years. Details open in place. */
export default function Scoreboard({ result, trends, compare, running, progress, onTryAllYears }: ScoreboardProps) {
  const ranked = rankTrends(trends);
  const missing = missingDatasets(result);
  const done = new Set<string>([...Object.keys(result.satellite), ...(result.climate ? ["climate"] : [])]);
  const pending = running ? result.datasets.filter((id) => !done.has(id)) : [];
  const hint = !compare && onTryAllYears ? trends.find((t) => t.hint) : undefined;
  const hinted = trends.filter((t) => t.hint).length;

  return (
    <section aria-label="Every measure tested" className="min-w-0">
      <div className={cn("hidden items-end gap-x-4 border-b border-border pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground xl:grid", COLUMNS)}>
        <span className="pl-[18px]">Measure</span>
        <span>{compare ? "Difference" : "Verdict"}</span>
        <span>{compare ? "Then → now" : "Rate of change"}</span>
        <span>{compare ? "t-test" : "Test"}</span>
        <span className="text-right">Each year</span>
      </div>
      <ul className="border-t border-border xl:border-t-0">
        {ranked.map((trend, index) => (
          <Row key={trend.metric.id} trend={trend} result={result} compare={compare} startOpen={index === 0 && !running} />
        ))}
        {pending.map((id) => {
          const own = progress?.datasets?.[id];
          const share = own && own.total ? own.done / own.total : 0;
          return (
            <li key={id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border py-3 pl-[18px]">
              <span className="text-sm text-muted-foreground">{DATASET_BY_ID[id].label}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{own && own.done > 0 ? `Reading ${own.done} of ${own.total}` : "Waiting"}</span>
              <span aria-hidden className="col-span-2 mt-2 block h-px overflow-hidden bg-border">
                <span className="block h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.round(share * 100)}%` }} />
              </span>
            </li>
          );
        })}
        {missing.map(({ dataset, reason }) => (
          <li key={dataset} className="grid gap-1 border-b border-border py-3 pl-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] xl:gap-4">
            <span className="text-sm text-muted-foreground">{DATASET_BY_ID[dataset].label}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{reason}</span>
          </li>
        ))}
      </ul>
      {hint?.hint && !running && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
          <p className="max-w-prose text-[13px] leading-relaxed text-muted-foreground">
            {hint.verdict
              ? `${hinted === 1 ? "One measure shows" : `${hinted} measures show`} no clear trend. A small trend can hide among normal ups and downs in a short record, so a longer one may give a clearer answer.`
              : hint.hint.text}
          </p>
          <button
            type="button"
            onClick={onTryAllYears}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 pointer-coarse:min-h-11"
          >
            <History className="h-3.5 w-3.5" aria-hidden /> Test every year since {hint.hint.startYear}
          </button>
        </div>
      )}
    </section>
  );
}
