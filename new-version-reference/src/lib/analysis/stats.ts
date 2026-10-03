// Small, dependency-free statistics used by the analysis engine.

export interface Regression {
  slope: number; // units per x-unit
  intercept: number;
  r2: number;
  n: number;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : NaN;
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

export function linearRegression(xs: number[], ys: number[]): Regression | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

/** Months since year 0 for a "YYYY-MM" key (used as the regression x-axis). */
export function monthIndex(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + (m - 1);
}

export function calendarMonth(month: string): number {
  return Number(month.slice(5, 7)) - 1; // 0..11
}

export interface MonthlyValue {
  month: string; // YYYY-MM
  value: number | null;
}

/** Mean value per calendar month (0..11) computed from the series itself. */
export function seasonalMeans(series: MonthlyValue[]): (number | null)[] {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const point of series) {
    if (point.value !== null && Number.isFinite(point.value)) buckets[calendarMonth(point.month)].push(point.value);
  }
  return buckets.map((bucket) => (bucket.length ? mean(bucket) : null));
}

/**
 * Trend per year after removing the seasonal cycle. Needs at least two years of
 * data with every calendar month seen twice, otherwise seasonality and trend
 * cannot be told apart and null is returned.
 */
export function deseasonalizedTrend(series: MonthlyValue[]): (Regression & { perYear: number }) | null {
  const valid = series.filter((p) => p.value !== null && Number.isFinite(p.value)) as { month: string; value: number }[];
  if (valid.length < 18) return null;
  const groups: { x: number; y: number }[][] = Array.from({ length: 12 }, () => []);
  for (const p of valid) groups[calendarMonth(p.month)].push({ x: monthIndex(p.month) / 12, y: p.value });
  if (groups.filter((g) => g.length >= 2).length < 9) return null;
  // Within-month (fixed-effects) regression: centre x and y on each calendar
  // month's own mean, so the seasonal cycle cannot leak into the slope.
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let n = 0;
  for (const group of groups) {
    if (group.length < 2) continue;
    const mx = mean(group.map((g) => g.x));
    const my = mean(group.map((g) => g.y));
    for (const { x, y } of group) {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
      syy += (y - my) ** 2;
      n += 1;
    }
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: 0, r2, n, perYear: slope };
}

/** Same calendar month one year earlier, if present. */
export function yearOverYear(series: MonthlyValue[]): { month: string; value: number; previous: number; change: number } | null {
  const byMonth = new Map(series.filter((p) => p.value !== null).map((p) => [p.month, p.value as number]));
  const latest = [...series].reverse().find((p) => p.value !== null);
  if (!latest || latest.value === null) return null;
  const [year, m] = latest.month.split("-");
  const previousKey = `${Number(year) - 1}-${m}`;
  const previous = byMonth.get(previousKey);
  if (previous === undefined) return null;
  return { month: latest.month, value: latest.value, previous, change: latest.value - previous };
}

export function extremes(series: MonthlyValue[]): { max: MonthlyValue; min: MonthlyValue } | null {
  const valid = series.filter((p) => p.value !== null && Number.isFinite(p.value));
  if (!valid.length) return null;
  let max = valid[0];
  let min = valid[0];
  for (const p of valid) {
    if ((p.value as number) > (max.value as number)) max = p;
    if ((p.value as number) < (min.value as number)) min = p;
  }
  return { max, min };
}

export function latestValid(series: MonthlyValue[]): MonthlyValue | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i].value !== null) return series[i];
  return null;
}

export function validValues(series: MonthlyValue[]): number[] {
  return series.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function signed(value: number, decimals = 1): string {
  const text = Math.abs(value).toFixed(decimals);
  if (Number(text) === 0) return (0).toFixed(decimals);
  return `${value > 0 ? "+" : "−"}${text}`;
}

export function percent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
