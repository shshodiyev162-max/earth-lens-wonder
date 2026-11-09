// Is it changing? For every measure in an analysis: one value per year (for the chosen months),
// a Mann–Kendall trend test with Sen's slope and its 95% range — or, when two periods are
// compared, Welch's t-test on their yearly values. Everything comes from the measured series.

import { formatMonth } from "../gibs/time";
import { comparePeriods, yearlyValues, type PeriodComparison, type YearValue } from "./aggregate";
import { measuredMetrics, METRICS, metricValues, type MetricDef } from "./metrics";
import { EARLIEST_YEAR } from "./period";
import { annualTrendVerdict, monthlyTrendVerdict, signed, type MonthlyValue, type TrendDirection, type TrendVerdict } from "./stats";
import type { AnalysisPeriod, AnalysisResult, DatasetId } from "./types";

/** Years needed for a yearly trend test (Mann–Kendall needs at least four values). */
export const MIN_TREND_YEARS = 4;

/** Readings at the end of NASA's colour scale start to matter at this share. */
export const CAPPED_NOTE_SHARE = 0.05;

export interface LongerPeriodHint {
  text: string;
  /** Start year to try instead. */
  startYear: number;
}

export interface MetricTrend {
  metric: MetricDef;
  /** One value per (season) year. Years cut short by the period have no value. */
  yearly: YearValue[];
  /** Trend test (null in comparisons, or when there are too few years). */
  verdict: TrendVerdict | null;
  /** First and last year with a value. */
  span: [number, number] | null;
  /** Baseline vs comparison (comparisons only). */
  comparison: PeriodComparison | null;
  /** Why there's no test, in plain words. */
  note: string | null;
  hint: LongerPeriodHint | null;
}

/** The year a measure's record starts, for offering a longer test only when there's more record to use. */
function firstYearOf(metric: MetricDef): number {
  if (!metric.first) return EARLIEST_YEAR;
  const year = Number(metric.first.slice(0, 4));
  return metric.first.endsWith("-01") ? year : year + 1;
}

/**
 * When a trend isn't clear (or can't be tested) and the period starts well after the record does,
 * suggest testing the whole record: short records often can't separate a trend from year-to-year noise.
 */
export function longerPeriodHint(verdict: TrendVerdict | null, firstYear: number, earliestYear = EARLIEST_YEAR): LongerPeriodHint | null {
  if (verdict && verdict.direction !== "none") return null;
  if (firstYear - earliestYear < 3) return null;
  const text = verdict
    ? `No clear trend over ${Math.round(verdict.years)} years. A trend this small can hide among normal ups and downs in a short record — testing every year since ${earliestYear} may give a clearer answer.`
    : `Too few years to test for a trend. Testing every year since ${earliestYear} gives the test enough years to work with.`;
  return { text, startYear: earliestYear };
}

/** Trend (or comparison) for one measure's monthly values. */
export function metricTrend(metric: MetricDef, values: MonthlyValue[], period: AnalysisPeriod, earliestYear = firstYearOf(metric)): MetricTrend {
  const yearly = yearlyValues(values, period.calendarMonths, metric.aggregate);
  const measured = yearly.filter((y) => y.value !== null);
  const span: [number, number] | null = measured.length ? [measured[0].year, measured[measured.length - 1].year] : null;
  const base = { metric, yearly, span, verdict: null, comparison: null, note: null, hint: null };

  if (period.compare) {
    const comparison = comparePeriods(yearly, period.compare.baseline, period.compare.recent, { percent: metric.percent });
    const note =
      comparison.label === "Not enough years to test"
        ? `Each period needs at least 2 measured years for a t-test (${comparison.baselineYears} and ${comparison.recentYears} here).`
        : null;
    return { ...base, comparison, note };
  }

  let verdict: TrendVerdict | null = null;
  if (measured.length >= MIN_TREND_YEARS) {
    verdict = annualTrendVerdict(
      measured.map((y) => y.year),
      measured.map((y) => y.value as number),
    );
  } else if (period.calendarMonths.length >= 12) {
    // Fewer than four whole years: every month of at least two years still allows a seasonal test.
    verdict = monthlyTrendVerdict(values);
  }
  const note = verdict
    ? null
    : `Only ${measured.length} year${measured.length === 1 ? "" : "s"} with enough measured months — a trend test needs at least ${MIN_TREND_YEARS}.`;
  const firstYear = span ? span[0] : Number(values[0]?.month.slice(0, 4) ?? earliestYear);
  return { ...base, verdict, note, hint: longerPeriodHint(verdict, firstYear, earliestYear) };
}

/** The months and comparison an analysis was run for (older results read every month). */
export function periodOf(result: AnalysisResult): AnalysisPeriod {
  return result.period ?? { calendarMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], compare: null };
}

/** Trend tests for every measure that has data. */
export function analysisTrends(result: AnalysisResult): MetricTrend[] {
  const period = periodOf(result);
  return measuredMetrics(result).map((metric) => metricTrend(metric, metricValues(result, metric.id), period));
}

/** Whether a measure rose, fell, or showed no clear change. */
export function directionOf(trend: Pick<MetricTrend, "verdict" | "comparison">): TrendDirection {
  if (trend.verdict) return trend.verdict.direction;
  if (trend.comparison?.label === "Significantly lower") return "decline";
  if (trend.comparison?.label === "Significantly higher") return "increase";
  return "none";
}

/** Whether a significant change is the worrying direction for this measure. */
export function isConcerning(metric: MetricDef, direction: TrendDirection): boolean {
  return direction !== "none" && direction === metric.concern;
}

/** Enough decimals for two significant figures, and never fewer than the measure's own. */
function decimalsFor(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value === 0) return decimals;
  return Math.min(5, Math.max(decimals, 1 - Math.floor(Math.log10(Math.abs(value)))));
}

/** "+0.48 °C per decade" and "95% range +0.21 to +0.70"; per year when the record is under ten years. */
export function rateText(verdict: TrendVerdict, metric: Pick<MetricDef, "unit" | "decimals">): { rate: string; range: string } {
  const perDecade = verdict.slopePerDecade !== null;
  const scale = perDecade ? 10 : 1;
  const decimals = decimalsFor(verdict.slopePerYear * scale, metric.decimals);
  return {
    rate: `${signed(verdict.slopePerYear * scale, decimals)}${metric.unit ? ` ${metric.unit}` : ""} per ${perDecade ? "decade" : "year"}`,
    range: `95% range ${signed(verdict.lowerPerYear * scale, decimals)} to ${signed(verdict.upperPerYear * scale, decimals)}`,
  };
}

/** Real changes first (strongest evidence first), then no clear change, then what couldn't be tested. */
export function rankTrends(trends: MetricTrend[]): MetricTrend[] {
  const rank = (trend: MetricTrend) => (directionOf(trend) !== "none" ? 0 : trend.verdict || (trend.comparison && trend.comparison.p !== null) ? 1 : 2);
  const p = (trend: MetricTrend) => trend.verdict?.p ?? trend.comparison?.p ?? 1;
  return trends
    .map((trend, order) => ({ trend, order }))
    .sort((a, b) => rank(a.trend) - rank(b.trend) || (rank(a.trend) === 0 ? p(a.trend) - p(b.trend) : a.order - b.order))
    .map(({ trend }) => trend);
}

/** Share of a measure's readings at the end of NASA's colour scale, averaged over the months read. */
export function cappedShareOf(result: AnalysisResult, dataset: DatasetId): number {
  if (dataset === "climate") return 0;
  const points = result.satellite[dataset]?.points.filter((p) => p.value !== null) ?? [];
  return points.length ? points.reduce((total, p) => total + (p.capped ?? 0), 0) / points.length : 0;
}

/** What a reader should know about this measure's numbers: where the record stops, and limits of the scale. */
export function metricNotes(result: AnalysisResult, metric: MetricDef): string[] {
  const notes: string[] = [];
  const series = metric.dataset === "climate" ? undefined : result.satellite[metric.dataset];
  if (metric.first && metric.first > result.start) notes.push(`NASA's record for this measure starts in ${formatMonth(metric.first, "long")}.`);
  if (metric.last && metric.last < result.end) notes.push(`NASA's record for this measure ends in ${formatMonth(metric.last, "long")}.`);
  else if (series?.latestAvailable && series.latestAvailable < result.end) notes.push(`NASA has published this measure up to ${formatMonth(series.latestAvailable, "long")} so far.`);
  const capped = cappedShareOf(result, metric.dataset);
  if (capped >= CAPPED_NOTE_SHARE) {
    notes.push(`${Math.round(capped * 100)}% of the readings sit at the end of NASA's colour scale, where it stops counting, so real values and changes there may be larger than shown.`);
  }
  const months = series?.points.filter((p) => p.value !== null && p.coverage < 0.5).length ?? 0;
  if (months > 0) notes.push(`${months} month${months === 1 ? "" : "s"} cover less than half of the area (water, snow or persistent cloud).`);
  return notes;
}

/** Datasets asked for that gave no readings, with the reason in plain words. */
export function missingDatasets(result: AnalysisResult): { dataset: DatasetId; reason: string }[] {
  const out: { dataset: DatasetId; reason: string }[] = [];
  for (const series of Object.values(result.satellite)) {
    if (!series || series.status === "ok") continue;
    const seaOnly = series.dataset === "sst" || series.dataset === "salinity";
    out.push({
      dataset: series.dataset,
      reason:
        series.status === "error"
          ? `NASA's map service couldn't be reached (${series.error ?? "network error"}). Try again in a moment.`
          : seaOnly
            ? "This area has no sea, so there's nothing to read. Choose an area that includes coast or open water."
            : "No readings for this area in the chosen period: for example open water, permanent cloud, or a record that doesn't cover these years.",
    });
  }
  if (result.climate?.status === "error") out.push({ dataset: "climate", reason: `NASA POWER didn't respond: ${result.climate.error ?? "network error"}.` });
  // Read fine, but too little to test: no snow to speak of in a desert.
  const measured = new Set(measuredMetrics(result).map((metric) => metric.id));
  for (const metric of METRICS) {
    if (metric.minLevel === undefined || measured.has(metric.id) || metric.dataset === "climate") continue;
    if (result.satellite[metric.dataset]?.status === "ok") out.push({ dataset: metric.dataset, reason: "Almost none in this area in the chosen period, so there's nothing to test." });
  }
  return out;
}
