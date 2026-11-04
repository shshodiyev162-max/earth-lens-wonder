// Is it changing? For every measure in an analysis: one value per year (for the chosen months),
// a Mann–Kendall trend test with Sen's slope and its 95% range — or, when two periods are
// compared, Welch's t-test on their yearly values. Everything comes from the measured series.

import { comparePeriods, yearlyValues, type PeriodComparison, type YearValue } from "./aggregate";
import { measuredMetrics, metricValues, type MetricDef } from "./metrics";
import { EARLIEST_YEAR } from "./period";
import { annualTrendVerdict, monthlyTrendVerdict, type MonthlyValue, type TrendVerdict } from "./stats";
import type { AnalysisPeriod, AnalysisResult } from "./types";

/** Years needed for a yearly trend test (Mann–Kendall needs at least four values). */
export const MIN_TREND_YEARS = 4;

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
export function metricTrend(metric: MetricDef, values: MonthlyValue[], period: AnalysisPeriod, earliestYear = EARLIEST_YEAR): MetricTrend {
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

/** Whether a significant change is the worrying direction for this measure. */
export function isConcerning(metric: MetricDef, direction: "decline" | "increase" | "none"): boolean {
  return direction !== "none" && direction === metric.concern;
}
