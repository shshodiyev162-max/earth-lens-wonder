// Monthly values turned into one value per year (or per season), an "average year" for a
// period, and a baseline-vs-comparison test. Seasons that cross New Year (Dec–Feb, Nov–Apr)
// belong to the year they end in.

import { SIGNIFICANCE, mean, welchTTest, type MonthlyValue } from "./stats";

export type YearSpan = [number, number];

export interface YearValue {
  year: number;
  /** Null when too few months were measured (or, for totals, any month is missing). */
  value: number | null;
  /** Months with a measurement. */
  count: number;
  /** Months in the season. */
  expected: number;
  /** False when the period cuts this year's season short (e.g. a range that starts in September). */
  complete: boolean;
}

const calendar = (month: string) => Number(month.slice(5, 7));

/** First month of the run that crosses New Year (e.g. 12 for Dec–Feb, 11 for Nov–Apr), or null. */
export function wrapStart(months: number[]): number | null {
  const set = new Set(months);
  if (set.size >= 12 || !set.has(12) || !set.has(1)) return null;
  let start = 12;
  while (set.has(start === 1 ? 12 : start - 1)) start = start === 1 ? 12 : start - 1;
  return start;
}

/** The (season) year a month counts toward. */
export function seasonYearOf(month: string, months: number[]): number {
  const year = Number(month.slice(0, 4));
  const start = wrapStart(months);
  return start !== null && calendar(month) >= start ? year + 1 : year;
}

/** Months (YYYY-MM) of the season that ends in `year`, oldest first. */
export function monthsOfSeasonYear(year: number, months: number[]): string[] {
  const start = wrapStart(months);
  return [...new Set(months)].map((m) => `${start !== null && m >= start ? year - 1 : year}-${String(m).padStart(2, "0")}`).sort();
}

/** Calendar months in the order they happen within a season (Dec, Jan, Feb). */
export function seasonOrder(months: number[]): number[] {
  const start = wrapStart(months);
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  return start === null ? sorted : [...sorted.filter((m) => m >= start), ...sorted.filter((m) => m < start)];
}

/** Share of a season's months that must be measured for a yearly average. */
export const MIN_YEAR_SHARE = 0.75;

/**
 * One value per (season) year. Averages use each month's departure from its own long-run mean,
 * so one missing winter month can't make a year look greener; totals need every month.
 */
export function yearlyValues(values: MonthlyValue[], months: number[], mode: "mean" | "sum" = "mean"): YearValue[] {
  const wanted = new Set(months);
  const expected = wanted.size;
  const inSeason = values.filter((v) => wanted.has(calendar(v.month)));
  const byCalendar = new Map<number, number[]>();
  for (const v of inSeason) {
    if (v.value === null || !Number.isFinite(v.value)) continue;
    const m = calendar(v.month);
    byCalendar.set(m, [...(byCalendar.get(m) ?? []), v.value]);
  }
  const normal = new Map([...byCalendar].map(([m, list]) => [m, mean(list)]));
  const normalMean = normal.size === expected ? mean([...normal.values()]) : null;

  const years = new Map<number, MonthlyValue[]>();
  for (const v of inSeason) {
    const year = seasonYearOf(v.month, months);
    years.set(year, [...(years.get(year) ?? []), v]);
  }
  return [...years]
    .sort(([a], [b]) => a - b)
    .map(([year, list]) => {
      const valid = list.filter((v): v is { month: string; value: number } => v.value !== null && Number.isFinite(v.value));
      const complete = list.length === expected;
      let value: number | null = null;
      if (complete && mode === "sum") {
        value = valid.length === expected ? valid.reduce((s, v) => s + v.value, 0) : null;
      } else if (complete && valid.length >= Math.ceil(MIN_YEAR_SHARE * expected)) {
        value =
          valid.length === expected || normalMean === null
            ? mean(valid.map((v) => v.value))
            : normalMean + mean(valid.map((v) => v.value - (normal.get(calendar(v.month)) as number)));
      }
      return { year, value, count: valid.length, expected, complete };
    });
}

export interface CycleValue {
  /** Calendar month 1–12. */
  month: number;
  value: number | null;
  /** Years that measured this month. */
  count: number;
}

/** The average of each calendar month over a span of (season) years — "a typical year". */
export function averageYear(values: MonthlyValue[], span: YearSpan, months: number[]): CycleValue[] {
  return seasonOrder(months).map((month) => {
    const list = values
      .filter((v) => calendar(v.month) === month && v.value !== null && Number.isFinite(v.value))
      .filter((v) => {
        const year = seasonYearOf(v.month, months);
        return year >= span[0] && year <= span[1];
      })
      .map((v) => v.value as number);
    return { month, value: list.length ? mean(list) : null, count: list.length };
  });
}

export type ComparisonLabel = "Significantly lower" | "No clear difference" | "Significantly higher" | "Not enough years to test";

export interface PeriodComparison {
  baselineMean: number | null;
  recentMean: number | null;
  /** Comparison minus baseline. */
  change: number | null;
  /** Change as a share of the baseline (null when asked not to, or the baseline is zero). */
  percent: number | null;
  p: number | null;
  baselineYears: number;
  recentYears: number;
  label: ComparisonLabel;
}

/** Compares the yearly values of two periods with Welch's t-test. */
export function comparePeriods(yearly: YearValue[], baseline: YearSpan, recent: YearSpan, options: { percent?: boolean } = {}): PeriodComparison {
  const pick = (span: YearSpan) => yearly.filter((y) => y.year >= span[0] && y.year <= span[1] && y.value !== null).map((y) => y.value as number);
  const a = pick(baseline);
  const b = pick(recent);
  const baselineMean = a.length ? mean(a) : null;
  const recentMean = b.length ? mean(b) : null;
  const change = baselineMean !== null && recentMean !== null ? recentMean - baselineMean : null;
  const percent = options.percent !== false && change !== null && baselineMean !== null && Math.abs(baselineMean) > 1e-6 ? (change / Math.abs(baselineMean)) * 100 : null;
  const test = welchTTest(a, b);
  let label: ComparisonLabel = "Not enough years to test";
  if (test && Number.isFinite(test.p)) {
    label = test.p < SIGNIFICANCE && test.difference !== 0 ? (test.difference < 0 ? "Significantly lower" : "Significantly higher") : "No clear difference";
  }
  return { baselineMean, recentMean, change, percent, p: test ? test.p : null, baselineYears: a.length, recentYears: b.length, label };
}
