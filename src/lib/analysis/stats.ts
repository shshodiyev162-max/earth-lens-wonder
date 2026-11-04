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

// ---------------------------------------------------------------------------
// Trend science: Mann–Kendall, Sen's slope, anomalies and lagged correlation.
// Standard non-parametric methods for satellite and climate time series
// (Mann 1945, Kendall 1975, Sen 1968, Hirsch et al. 1982, Gilbert 1987).

/** Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Inverse of the standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Continued fraction for the regularized incomplete beta function (Numerical Recipes). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-12) break;
  }
  return h;
}

function logGamma(x: number): number {
  const coefficients = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of coefficients) series += coefficient / ++y;
  return -tmp + Math.log((2.5066282746310007 * series) / x);
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(a, b, x)) / a : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value of a Student t statistic with `df` degrees of freedom. */
export function studentTTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return NaN;
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

export interface MannKendallResult {
  /** Kendall's S: increasing minus decreasing pairs. */
  s: number;
  /** Variance of S, corrected for tied values. */
  varS: number;
  z: number;
  /** Two-sided p-value. */
  p: number;
  /** Kendall's tau (S over the number of pairs). */
  tau: number;
  n: number;
}

function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** Variance of S for n values, with the tie correction Σ t(t−1)(2t+5). */
function mannKendallVariance(values: number[]): number {
  const n = values.length;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let ties = 0;
  for (const t of counts.values()) if (t > 1) ties += t * (t - 1) * (2 * t + 5);
  return (n * (n - 1) * (2 * n + 5) - ties) / 18;
}

function mannKendallZ(s: number, varS: number): number {
  if (varS <= 0 || s === 0) return 0;
  return (s - sign(s)) / Math.sqrt(varS);
}

function twoSidedP(z: number): number {
  return z === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(z)));
}

/** Mann–Kendall trend test with tie correction. Values are in time order; non-finite values are skipped. */
export function mannKendall(input: number[]): MannKendallResult | null {
  const values = input.filter((v) => Number.isFinite(v));
  const n = values.length;
  if (n < 4) return null;
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += sign(values[j] - values[i]);
  const varS = mannKendallVariance(values);
  const z = mannKendallZ(s, varS);
  return { s, varS, z, p: twoSidedP(z), tau: s / ((n * (n - 1)) / 2), n };
}

/** Values of a monthly series grouped by calendar month, each in time order (x in years). */
function byCalendarMonth(series: MonthlyValue[]): { x: number; y: number }[][] {
  const groups: { x: number; y: number }[][] = Array.from({ length: 12 }, () => []);
  for (const point of series) {
    if (point.value === null || !Number.isFinite(point.value)) continue;
    groups[calendarMonth(point.month)].push({ x: monthIndex(point.month) / 12, y: point.value });
  }
  for (const group of groups) group.sort((a, b) => a.x - b.x);
  return groups;
}

/**
 * Seasonal Mann–Kendall (Hirsch, Slack & Smith 1982): the test runs within each calendar month
 * (Januaries against Januaries…) and the results are summed, so the seasonal cycle can't fake a trend.
 */
export function seasonalMannKendall(series: MonthlyValue[]): MannKendallResult | null {
  let s = 0;
  let varS = 0;
  let n = 0;
  let pairs = 0;
  for (const group of byCalendarMonth(series)) {
    const values = group.map((g) => g.y);
    if (values.length < 2) continue;
    for (let i = 0; i < values.length - 1; i++) for (let j = i + 1; j < values.length; j++) s += sign(values[j] - values[i]);
    varS += mannKendallVariance(values);
    n += values.length;
    pairs += (values.length * (values.length - 1)) / 2;
  }
  if (pairs < 6) return null;
  const z = mannKendallZ(s, varS);
  return { s, varS, z, p: twoSidedP(z), tau: s / pairs, n };
}

export interface SenSlopeResult {
  /** Median of all pairwise slopes, in y-units per x-unit. */
  slope: number;
  /** Conover intercept: median of y − slope·x. */
  intercept: number;
  /** Confidence interval of the slope (Gilbert 1987). */
  lower: number;
  upper: number;
  confidence: number;
  n: number;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (!n) return NaN;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function senInterval(slopes: number[], varS: number, confidence: number): { lower: number; upper: number } {
  const count = slopes.length;
  const c = normalQuantile(1 - (1 - confidence) / 2) * Math.sqrt(Math.max(varS, 0));
  const lowerRank = Math.round((count - c) / 2); // 1-based rank M1
  const upperRank = Math.round((count + c) / 2) + 1; // 1-based rank M2 + 1
  return {
    lower: slopes[Math.min(count - 1, Math.max(0, lowerRank - 1))],
    upper: slopes[Math.min(count - 1, Math.max(0, upperRank - 1))],
  };
}

/** Sen's slope with a confidence interval. Pairs with non-finite values are skipped. */
export function senSlope(xs: number[], ys: number[], confidence = 0.95): SenSlopeResult | null {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) points.push({ x: xs[i], y: ys[i] });
  if (points.length < 3) return null;
  const slopes: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const intercept = median(points.map((p) => p.y - slope * p.x).sort((a, b) => a - b));
  const { lower, upper } = senInterval(slopes, mannKendallVariance(points.map((p) => p.y)), confidence);
  return { slope, intercept, lower, upper, confidence, n: points.length };
}

/** Seasonal Sen's slope: the median of within-calendar-month slopes, per year (x in years). */
export function seasonalSenSlope(series: MonthlyValue[], confidence = 0.95): SenSlopeResult | null {
  const slopes: number[] = [];
  let varS = 0;
  const all: { x: number; y: number }[] = [];
  for (const group of byCalendarMonth(series)) {
    all.push(...group);
    if (group.length < 2) continue;
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const dx = group[j].x - group[i].x;
        if (dx !== 0) slopes.push((group[j].y - group[i].y) / dx);
      }
    }
    varS += mannKendallVariance(group.map((g) => g.y));
  }
  if (slopes.length < 6) return null;
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  // Intercept against the seasonal means, so the line sits in the middle of the cycle.
  const intercept = median(all.map((p) => p.y - slope * p.x).sort((a, b) => a - b));
  const { lower, upper } = senInterval(slopes, varS, confidence);
  return { slope, intercept, lower, upper, confidence, n: all.length };
}

export interface Anomaly {
  month: string;
  value: number | null;
  /** Difference from the baseline mean of the same calendar month. */
  anomaly: number | null;
  /** Anomaly in standard deviations of that calendar month in the baseline (null with fewer than 3 baseline values). */
  z: number | null;
}

/** Anomalies against a baseline period (inclusive YYYY-MM bounds), month by month. */
export function anomalies(series: MonthlyValue[], baseline: { start: string; end: string }): Anomaly[] {
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (const point of series) {
    if (point.value === null || !Number.isFinite(point.value) || point.month < baseline.start || point.month > baseline.end) continue;
    buckets[calendarMonth(point.month)].push(point.value);
  }
  const reference = buckets.map((bucket) => {
    if (!bucket.length) return null;
    const m = mean(bucket);
    const sd = bucket.length >= 3 ? Math.sqrt(bucket.reduce((s, v) => s + (v - m) ** 2, 0) / (bucket.length - 1)) : NaN;
    return { mean: m, sd };
  });
  return series.map((point) => {
    const ref = reference[calendarMonth(point.month)];
    if (point.value === null || !Number.isFinite(point.value) || !ref) return { month: point.month, value: point.value, anomaly: null, z: null };
    const anomaly = point.value - ref.mean;
    return { month: point.month, value: point.value, anomaly, z: Number.isFinite(ref.sd) && ref.sd > 0 ? anomaly / ref.sd : null };
  });
}

/** The series minus its own calendar-month means (removes the seasonal cycle). */
export function deseasonalize(series: MonthlyValue[]): MonthlyValue[] {
  const means = seasonalMeans(series);
  return series.map((point) => {
    const ref = means[calendarMonth(point.month)];
    return { month: point.month, value: point.value === null || ref === null ? null : point.value - ref };
  });
}

export interface LagCorrelation {
  /** Months by which the driver leads the response. */
  lag: number;
  r: number;
  n: number;
  p: number;
}

/** Pearson correlation of two equal-length arrays, skipping pairs with a missing value. */
export function pearson(xs: (number | null)[], ys: (number | null)[]): { r: number; n: number } | null {
  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
  }
  if (pairs.length < 4) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pairs) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0 || syy === 0) return null;
  return { r: sxy / Math.sqrt(sxx * syy), n: pairs.length };
}

/**
 * Correlation of `driver` with `response` when the driver leads by 0…maxLag months.
 * Both series are deseasonalized first, so a shared seasonal cycle doesn't count as a link.
 */
export function laggedCorrelation(driver: MonthlyValue[], response: MonthlyValue[], maxLag = 3): LagCorrelation[] {
  const months = [...new Set([...driver, ...response].map((p) => p.month))].sort();
  if (!months.length) return [];
  // A continuous month axis, so a lag of k always means k calendar months.
  const axis = monthRangeOf(months[0], months[months.length - 1]);
  const index = new Map(axis.map((m, i) => [m, i]));
  const x: (number | null)[] = new Array(axis.length).fill(null);
  const y: (number | null)[] = new Array(axis.length).fill(null);
  for (const p of deseasonalize(driver)) x[index.get(p.month) as number] = p.value;
  for (const p of deseasonalize(response)) y[index.get(p.month) as number] = p.value;
  const out: LagCorrelation[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    const result = pearson(x.slice(0, x.length - lag), y.slice(lag));
    if (!result || result.n < 6) continue;
    const t = result.r * Math.sqrt((result.n - 2) / Math.max(1e-12, 1 - result.r * result.r));
    out.push({ lag, r: result.r, n: result.n, p: studentTTwoSided(t, result.n - 2) });
  }
  return out;
}

function monthRangeOf(start: string, end: string): string[] {
  const out: string[] = [];
  for (let i = monthIndex(start); i <= monthIndex(end); i++) out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  return out;
}

export type TrendDirection = "decline" | "none" | "increase";

export interface TrendVerdict {
  direction: TrendDirection;
  label: "Significant decline" | "No clear trend" | "Significant increase";
  p: number;
  slopePerYear: number;
  lowerPerYear: number;
  upperPerYear: number;
  /** Only for records of 10 years or more, where a per-decade rate is meaningful. */
  slopePerDecade: number | null;
  years: number;
  method: "seasonal Mann–Kendall + seasonal Sen's slope" | "Mann–Kendall + Sen's slope";
}

export const SIGNIFICANCE = 0.05;

function verdictFrom(p: number, slope: SenSlopeResult, years: number, method: TrendVerdict["method"]): TrendVerdict {
  const significant = p < SIGNIFICANCE && slope.slope !== 0;
  const direction: TrendDirection = significant ? (slope.slope < 0 ? "decline" : "increase") : "none";
  return {
    direction,
    label: direction === "decline" ? "Significant decline" : direction === "increase" ? "Significant increase" : "No clear trend",
    p,
    slopePerYear: slope.slope,
    lowerPerYear: slope.lower,
    upperPerYear: slope.upper,
    slopePerDecade: years >= 10 ? slope.slope * 10 : null,
    years,
    method,
  };
}

/** Verdict for a monthly series: seasonal Mann–Kendall significance and seasonal Sen's slope per year. */
export function monthlyTrendVerdict(series: MonthlyValue[]): TrendVerdict | null {
  const valid = series.filter((p) => p.value !== null && Number.isFinite(p.value));
  if (valid.length < 24) return null;
  const mk = seasonalMannKendall(valid);
  const sen = seasonalSenSlope(valid);
  if (!mk || !sen) return null;
  const years = (monthIndex(valid[valid.length - 1].month) - monthIndex(valid[0].month) + 1) / 12;
  return verdictFrom(mk.p, sen, years, "seasonal Mann–Kendall + seasonal Sen's slope");
}

/** Verdict for one value per year (x = year). */
export function annualTrendVerdict(years: number[], values: number[]): TrendVerdict | null {
  const pairs = years.map((year, i) => [year, values[i]] as const).filter(([, v]) => Number.isFinite(v));
  if (pairs.length < 4) return null;
  const mk = mannKendall(pairs.map(([, v]) => v));
  const sen = senSlope(
    pairs.map(([year]) => year),
    pairs.map(([, v]) => v),
  );
  if (!mk || !sen) return null;
  const span = pairs[pairs.length - 1][0] - pairs[0][0] + 1;
  return verdictFrom(mk.p, sen, span, "Mann–Kendall + Sen's slope");
}

/** "p < 0.001", "p = 0.03" */
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return "p unavailable";
  if (p < 0.001) return "p < 0.001";
  // Near the 0.05 cut-off, show enough digits that "significant" and the number never disagree.
  if (Math.abs(p - SIGNIFICANCE) < 0.005) return `p = ${p.toFixed(4)}`;
  return `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`;
}

/**
 * Plain-language explanation of a verdict, e.g. "Plant greenness fell by −0.012 NDVI per year…
 * A run this consistent would appear by chance in fewer than 1 in 100 records without a real trend (p = 0.004)."
 */
export function explainVerdict(verdict: TrendVerdict, subject: string, unit: string, decimals: number): string {
  const fmt = (value: number) => `${signed(value, decimals)}${unit ? ` ${unit}` : ""}`;
  const rate = verdict.slopePerDecade !== null ? `${fmt(verdict.slopePerYear)} per year (${fmt(verdict.slopePerDecade)} per decade)` : `${fmt(verdict.slopePerYear)} per year`;
  const range = `95% range ${fmt(verdict.lowerPerYear)} to ${fmt(verdict.upperPerYear)} per year`;
  if (verdict.direction === "none") {
    // The range and the test agree almost always; only say "includes no change" when it does.
    const spansZero = verdict.lowerPerYear <= 0 && verdict.upperPerYear >= 0;
    return `${subject} went up and down without a consistent direction over ${Math.round(verdict.years)} years (${formatP(verdict.p)}). The middle estimate is ${rate}${
      spansZero ? `, but the ${range} includes no change at all` : ` (${range})`
    }; a pattern this weak can easily come from natural year-to-year variation.`;
  }
  const chance = verdict.p < 0.001 ? "fewer than 1 in 1,000" : verdict.p < 0.01 ? "fewer than 1 in 100" : "fewer than 1 in 20";
  return `${subject} ${verdict.direction === "decline" ? "fell" : "rose"} by ${rate} (${range}). A run this consistent would appear by chance in ${chance} records without a real trend (${formatP(verdict.p)}).`;
}

// ---------------------------------------------------------------------------
// Two periods compared (baseline vs comparison)

export interface TwoSampleTest {
  /** Comparison mean minus baseline mean. */
  difference: number;
  t: number;
  df: number;
  /** Two-sided p-value (Welch's t-test, which doesn't assume equal spread). */
  p: number;
}

export function welchTTest(baseline: number[], comparison: number[]): TwoSampleTest | null {
  const a = baseline.filter(Number.isFinite);
  const b = comparison.filter(Number.isFinite);
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const se2 = va / a.length + vb / b.length;
  const difference = mb - ma;
  if (se2 === 0) return { difference, t: difference === 0 ? 0 : Math.sign(difference) * Infinity, df: a.length + b.length - 2, p: difference === 0 ? 1 : 0 };
  const t = difference / Math.sqrt(se2);
  const df = se2 ** 2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
  return { difference, t, df, p: studentTTwoSided(t, df) };
}
