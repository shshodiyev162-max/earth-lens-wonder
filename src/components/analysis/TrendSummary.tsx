import { History, LineChart } from "lucide-react";
import YearTrendChart from "@/components/trends/YearTrendChart";
import { formatSpan } from "@/lib/analysis/period";
import { explainVerdict, formatP, signed } from "@/lib/analysis/stats";
import { isConcerning, type MetricTrend } from "@/lib/analysis/trend";
import { METRIC_DEFINITIONS } from "@/lib/glossary";
import { cn } from "@/lib/utils";

const TONE = {
  bad: "border-yellow-500/40 bg-yellow-500/10 text-tone-warn",
  good: "border-green-500/40 bg-green-500/10 text-tone-good",
  none: "border-border bg-muted/40 text-muted-foreground",
};

function toneOf(trend: MetricTrend): keyof typeof TONE {
  const direction = trend.verdict?.direction ?? (trend.comparison?.label === "Significantly lower" ? "decline" : trend.comparison?.label === "Significantly higher" ? "increase" : "none");
  if (direction === "none" || trend.metric.concern === "none") return "none";
  return isConcerning(trend.metric, direction) ? "bad" : "good";
}

function TrendCard({ trend, spans, onTryAllYears }: { trend: MetricTrend; spans: TrendSummaryProps["compare"]; onTryAllYears?: () => void }) {
  const { metric, verdict, comparison, yearly, span, note, hint } = trend;
  const unit = metric.unit ? ` ${metric.unit}` : "";
  const value = (v: number, d = metric.decimals) => `${v.toFixed(d)}${unit}`;
  const rate = (v: number) => `${signed(v, metric.decimals + 1)}${unit}`;
  const badge = verdict ? verdict.label : comparison ? comparison.label : "Not tested";
  const tone = toneOf(trend);

  return (
    <li className="bg-tile rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground">{metric.label}</h4>
          <p className="text-[11px] text-muted-foreground">{metric.source}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{METRIC_DEFINITIONS[metric.id]}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", TONE[tone])}>{badge}</span>
      </div>

      {verdict && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Rate (Sen's slope)</dt>
          <dd className="text-right font-medium text-foreground">
            {rate(verdict.slopePerYear)} per year
            {verdict.slopePerDecade !== null && <span className="text-muted-foreground"> · {rate(verdict.slopePerDecade)} per decade</span>}
          </dd>
          <dt className="text-muted-foreground">95% range</dt>
          <dd className="text-right font-medium text-foreground">
            {rate(verdict.lowerPerYear)} to {rate(verdict.upperPerYear)} per year
          </dd>
          <dt className="text-muted-foreground">Mann–Kendall test</dt>
          <dd className="text-right font-medium text-foreground">{formatP(verdict.p)}</dd>
          {span && (
            <>
              <dt className="text-muted-foreground">Years tested</dt>
              <dd className="text-right font-medium text-foreground">
                {formatSpan(span)} ({yearly.filter((y) => y.value !== null).length})
              </dd>
            </>
          )}
        </dl>
      )}

      {comparison && comparison.baselineMean !== null && comparison.recentMean !== null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Then, yearly average</dt>
          <dd className="text-right font-medium text-foreground">
            {value(comparison.baselineMean)} <span className="text-muted-foreground">({comparison.baselineYears} yrs)</span>
          </dd>
          <dt className="text-muted-foreground">Now, yearly average</dt>
          <dd className="text-right font-medium text-foreground">
            {value(comparison.recentMean)} <span className="text-muted-foreground">({comparison.recentYears} yrs)</span>
          </dd>
          {comparison.change !== null && (
            <>
              <dt className="text-muted-foreground">Change</dt>
              <dd className="text-right font-medium text-foreground">
                {signed(comparison.change, metric.decimals)}
                {unit}
                {comparison.percent !== null && <span className="text-muted-foreground"> ({signed(comparison.percent, Math.abs(comparison.percent) < 10 ? 1 : 0)}%)</span>}
              </dd>
            </>
          )}
          {comparison.p !== null && (
            <>
              <dt className="text-muted-foreground">Welch's t-test</dt>
              <dd className="text-right font-medium text-foreground">{formatP(comparison.p)}</dd>
            </>
          )}
        </dl>
      )}

      <YearTrendChart
        series={yearly}
        baseline={spans?.baseline}
        recent={spans?.recent}
        color={metric.color}
        unit={metric.unit}
        decimals={metric.decimals}
        showRange={Boolean(verdict)}
        variant="page"
        label={`${metric.subject}, one value per year${verdict ? ", with the trend line and its 95% range" : ""}`}
      />

      {verdict && <p className="text-xs leading-relaxed text-muted-foreground">{explainVerdict(verdict, metric.subject, metric.unit, metric.decimals + 1)}</p>}
      {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
      {hint && onTryAllYears && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{hint.text}</p>
          <button
            type="button"
            onClick={onTryAllYears}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium glass text-foreground hover:bg-card/80 transition-colors pointer-coarse:min-h-11"
          >
            <History className="h-3.5 w-3.5" aria-hidden /> Test every year since {hint.startYear}
          </button>
        </div>
      )}
    </li>
  );
}

interface TrendSummaryProps {
  trends: MetricTrend[];
  /** Two periods compared, or null for a trend over the whole period. */
  compare: { baseline: [number, number]; recent: [number, number] } | null;
  onTryAllYears?: () => void;
}

/** "Is it changing?": a trend test (or a two-period comparison) for every measure. */
export default function TrendSummary({ trends, compare, onTryAllYears }: TrendSummaryProps) {
  if (!trends.length) return null;
  return (
    <section aria-labelledby="trend-summary-title" className="glass rounded-2xl p-6 space-y-4">
      <div className="space-y-1">
        <h3 id="trend-summary-title" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <LineChart className="h-4 w-4 text-primary" aria-hidden /> {compare ? `Then (${formatSpan(compare.baseline)}) vs now (${formatSpan(compare.recent)})` : "Is it changing? Trend tests"}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {compare
            ? "Each year becomes one value (the average of the chosen months; rainfall is their total). Welch's t-test then asks whether the two periods differ by more than normal year-to-year ups and downs."
            : "Each year becomes one value (the average of the chosen months; rainfall is their total). The Mann–Kendall test asks whether those values rise or fall more consistently than chance would allow (significant when p < 0.05), and Sen's slope gives the rate with its 95% range."}
        </p>
      </div>
      <ul className="grid gap-4 xl:grid-cols-2">
        {trends.map((trend) => (
          <TrendCard key={trend.metric.id} trend={trend} spans={compare} onTryAllYears={onTryAllYears} />
        ))}
      </ul>
    </section>
  );
}
