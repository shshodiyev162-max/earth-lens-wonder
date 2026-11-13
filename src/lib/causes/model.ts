// The statistics behind "possible causes". Everything here is a pure function of measured numbers.
//
// • The weather model (residual trend analysis, "RESTREND"): learn how a measure follows the weather
//   from year to year, test that on years left out, then ask how much of the trend the weather
//   accounts for and whether what's left still has a trend of its own.
// • The shape of the change: one sudden jump (two flat levels that fit far better than a straight
//   line, and differ clearly) or a gradual drift.
// • Simple judgements of fire detections and population counts.

import { annualTrendVerdict, mannKendall, mean, senSlope, SIGNIFICANCE, welchTTest, type TrendVerdict } from "../analysis/stats";

export interface YearPoint {
  year: number;
  value: number | null;
}

/** Rain, air temperature, soil wetness and wind, from NASA POWER. */
export type DriverId = "rain" | "temp" | "soil" | "wind";
/** "season": the months measured; "year": the 12 months up to the season's end (rain soaks in slowly). */
export type DriverWindow = "season" | "year";

export interface DriverInput {
  id: DriverId;
  window: DriverWindow;
  points: YearPoint[];
}

/** Years needed before the weather model is tried (two drivers and an intercept need room to be tested). */
export const MIN_WEATHER_YEARS = 8;
/** The model must predict at least this share of the year-to-year ups and downs in years it didn't see. */
export const MIN_SKILL = 0.2;
/** Years needed to tell a sudden change from a gradual one. */
export const MIN_SHAPE_YEARS = 8;

// ---------------------------------------------------------------------------
// Least squares

/**
 * Solves y ≈ X·b by the normal equations with partial pivoting. X's rows are observations (include a
 * column of ones for an intercept). Null when the columns are (almost) dependent.
 */
export function leastSquares(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  if (!k || n < k) return null;
  // A = XᵀX | Xᵀy
  const A: number[][] = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < k; i++) {
      A[i][k] += X[r][i] * y[r];
      for (let j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j];
    }
  }
  const scale = Math.max(...A.map((row, i) => Math.abs(row[i])), 1e-300);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < scale * 1e-10) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= k; c++) A[r][c] -= factor * A[col][c];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

function standardize(values: number[]): { z: number[]; mean: number; sd: number } | null {
  const m = mean(values);
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, values.length - 1));
  if (!(sd > 0)) return null;
  return { z: values.map((v) => (v - m) / sd), mean: m, sd };
}

export interface LinearFit {
  intercept: number;
  /** Change in the response per unit of each driver. */
  coefficients: number[];
  predicted: number[];
  /** Leave-one-year-out R²: how well years the model never saw are predicted (can be below zero). */
  skill: number;
}

/** Fits response = a + Σ bₖ·driverₖ and scores it on years left out one at a time. */
export function fitLinear(response: number[], drivers: number[][]): LinearFit | null {
  const n = response.length;
  if (!drivers.length || drivers.some((d) => d.length !== n) || n < drivers.length + 3) return null;
  const scaled = drivers.map(standardize);
  if (scaled.some((s) => !s)) return null;
  const columns = scaled as { z: number[]; mean: number; sd: number }[];
  const X = response.map((_, r) => [1, ...columns.map((c) => c.z[r])]);
  const b = leastSquares(X, response);
  if (!b) return null;
  const predicted = X.map((row) => row.reduce((s, v, i) => s + v * b[i], 0));

  const yMean = mean(response);
  const total = response.reduce((s, v) => s + (v - yMean) ** 2, 0);
  let press = 0;
  for (let leave = 0; leave < n; leave++) {
    const rows = X.filter((_, r) => r !== leave);
    const ys = response.filter((_, r) => r !== leave);
    const bLoo = leastSquares(rows, ys);
    if (!bLoo) return null;
    const guess = X[leave].reduce((s, v, i) => s + v * bLoo[i], 0);
    press += (response[leave] - guess) ** 2;
  }
  const coefficients = columns.map((c, i) => b[i + 1] / c.sd);
  const intercept = b[0] - columns.reduce((s, c, i) => s + b[i + 1] * (c.mean / c.sd), 0);
  return { intercept, coefficients, predicted, skill: total > 0 ? 1 - press / total : 0 };
}

// ---------------------------------------------------------------------------
// The weather check

export interface DriverEffect {
  id: DriverId;
  window: DriverWindow;
  /** Change in the measure per unit of this driver, from the model. */
  coefficient: number;
  /** The driver's own trend over the same years. */
  verdict: TrendVerdict | null;
  /** The driver's Sen's slope per year. */
  slopePerYear: number;
  /** The driver's average over these years (for "−12% a decade"). */
  mean: number;
  /** Its share of the measure's trend: (coefficient × the driver's trend) ÷ the measure's trend. */
  share: number;
}

/**
 * - weather: the weather accounts for most of the trend, and nothing is left over
 * - partly: some of the trend is the weather's, some isn't (or it's not clear-cut)
 * - notWeather: the weather follows the ups and downs, but leaves the trend unexplained
 * - noLink: the measure doesn't follow the weather closely here, so the check can't say
 * - tooFewYears: not enough years with both the measure and the weather
 */
export type WeatherOutcome = "weather" | "partly" | "notWeather" | "noLink" | "tooFewYears";

export interface WeatherCheck {
  outcome: WeatherOutcome;
  /** Years with both the measure and every driver. */
  years: number;
  skill: number | null;
  /** Share of the measure's trend the weather accounts for (1 = all of it). */
  explained: number | null;
  /** The measure's own Sen's slope per year over those years. */
  slopePerYear: number | null;
  /** Trend of what's left after taking the weather out. */
  residual: TrendVerdict | null;
  /** What's left still moves the measure's way: a clear trend, and at least a tenth of the measure's own. */
  leftOver: boolean;
  effects: DriverEffect[];
}

/** A left-over trend smaller than this share of the measure's own is too small to matter. */
export const MIN_LEFT_OVER = 0.1;

function aligned(response: YearPoint[], drivers: DriverInput[]): { years: number[]; y: number[]; x: number[][] } {
  const byYear = drivers.map((d) => new Map(d.points.map((p) => [p.year, p.value])));
  const years: number[] = [];
  const y: number[] = [];
  const x: number[][] = drivers.map(() => []);
  for (const point of [...response].sort((a, b) => a.year - b.year)) {
    if (point.value === null || !Number.isFinite(point.value)) continue;
    const values = byYear.map((map) => map.get(point.year));
    if (values.some((v) => v === null || v === undefined || !Number.isFinite(v))) continue;
    years.push(point.year);
    y.push(point.value);
    values.forEach((v, i) => x[i].push(v as number));
  }
  return { years, y, x };
}

/** How much of a measure's trend the weather accounts for, and whether anything is left over. */
export function weatherCheck(response: YearPoint[], drivers: DriverInput[]): WeatherCheck {
  const { years, y, x } = aligned(response, drivers);
  const empty: WeatherCheck = { outcome: "tooFewYears", years: years.length, skill: null, explained: null, slopePerYear: null, residual: null, leftOver: false, effects: [] };
  if (years.length < MIN_WEATHER_YEARS) return empty;
  // A driver that never changes (no snow, so no snowfall) can't explain anything: leave it out.
  const usable = drivers.map((_, i) => i).filter((i) => standardize(x[i]) !== null);
  const fit = usable.length ? fitLinear(y, usable.map((i) => x[i])) : null;
  if (!fit) return { ...empty, outcome: "noLink" };

  const slope = senSlope(years, y)?.slope ?? 0;
  const effects: DriverEffect[] = usable.map((i, k) => {
    const own = senSlope(years, x[i])?.slope ?? 0;
    return {
      id: drivers[i].id,
      window: drivers[i].window,
      coefficient: fit.coefficients[k],
      verdict: annualTrendVerdict(years, x[i]),
      slopePerYear: own,
      mean: mean(x[i]),
      share: slope !== 0 ? (fit.coefficients[k] * own) / slope : 0,
    };
  });
  const predictedSlope = senSlope(years, fit.predicted)?.slope ?? 0;
  const explained = slope !== 0 ? predictedSlope / slope : 0;
  const residual = annualTrendVerdict(
    years,
    y.map((v, i) => v - fit.predicted[i]),
  );
  const direction = slope < 0 ? "decline" : slope > 0 ? "increase" : "none";
  // A perfect fit leaves only rounding noise, which can look like a trend: it must also be big enough to matter.
  const leftOver =
    residual !== null && residual.direction !== "none" && residual.direction === direction && Math.abs(residual.slopePerYear) >= MIN_LEFT_OVER * Math.abs(slope);
  const base = { years: years.length, skill: fit.skill, explained, slopePerYear: slope, residual, leftOver, effects };
  if (fit.skill < MIN_SKILL) return { ...base, outcome: "noLink" };

  let outcome: WeatherOutcome;
  if (explained >= 0.5 && !leftOver) outcome = "weather";
  else if (explained < 0.25 && leftOver) outcome = "notWeather";
  else outcome = "partly";
  return { ...base, outcome };
}

// ---------------------------------------------------------------------------
// Sudden or gradual

export interface ChangeShape {
  kind: "sudden" | "gradual" | "none" | "tooFewYears";
  /** Sudden only: the last year before the jump and the first year after it. */
  before?: number;
  after?: number;
  /** Sudden only: the jump, after minus before. */
  step?: number;
  /** After a sudden jump, values have been moving back. */
  recovering: boolean;
}

const sse = (values: number[], fitted: (i: number) => number) => values.reduce((s, v, i) => s + (v - fitted(i)) ** 2, 0);

/** Sum of squared differences between the values within each side of a split and that side's average. */
function stepError(values: number[], split: number): number {
  const before = values.slice(0, split + 1);
  const after = values.slice(split + 1);
  return sse(before, () => mean(before)) + sse(after, () => mean(after));
}

/**
 * One sudden jump or a gradual drift. Every split with at least two years on each side is tried, and
 * the one where two flat levels fit best is kept. It counts as a jump when those two levels fit at
 * least twice as well as a straight line, and the years before and after differ clearly: Welch's
 * t-test, with the 5% cut-off divided by the number of splits tried (so that trying many years can't
 * manufacture a jump). Unlike rank tests, this still sees a jump in the last two years of a record.
 * `direction` is the measure's trend: a jump the other way doesn't count.
 */
export function changeShape(points: YearPoint[], direction: "decline" | "increase"): ChangeShape {
  const valid = points.filter((p): p is { year: number; value: number } => p.value !== null && Number.isFinite(p.value)).sort((a, b) => a.year - b.year);
  if (valid.length < MIN_SHAPE_YEARS) return { kind: "tooFewYears", recovering: false };
  const years = valid.map((p) => p.year);
  const values = valid.map((p) => p.value);
  const verdict = annualTrendVerdict(years, values);

  const candidates: number[] = [];
  for (let split = 1; split <= values.length - 3; split++) candidates.push(split);
  const split = candidates.reduce((best, candidate) => (stepError(values, candidate) < stepError(values, best) ? candidate : best), candidates[0]);
  const before = values.slice(0, split + 1);
  const after = values.slice(split + 1);
  const step = mean(after) - mean(before);
  const line = senSlope(years, values);
  const lineError = line ? sse(values, (i) => line.intercept + line.slope * years[i]) : Infinity;
  const rightWay = direction === "decline" ? step < 0 : step > 0;
  const clear = (welchTTest(before, after)?.p ?? 1) < SIGNIFICANCE / candidates.length;
  if (rightWay && clear && stepError(values, split) <= 0.5 * lineError) {
    const afterTrend = after.length >= 4 ? mannKendall(after) : null;
    const recovering = afterTrend !== null && afterTrend.p < 0.1 && Math.sign(afterTrend.s) === -Math.sign(step);
    return { kind: "sudden", before: years[split], after: years[split + 1], step, recovering };
  }
  return { kind: verdict && verdict.direction !== "none" ? "gradual" : "none", recovering: false };
}

// ---------------------------------------------------------------------------
// Fires and people

export interface FireDays {
  /** Days asked for that NASA answered. */
  checked: number;
  /** Of those, days with at least one fire detected inside the area. */
  withFire: number;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

export interface FireCheck {
  /** Between the last year before a sudden change and the first year after it. */
  during: FireDays;
  /** The same length of time just before. */
  before: FireDays;
  /**
   * unusual: far more fire than before; usual: fires burn here often, and no more than before;
   * few: a day or two with fire, too few to tell; none: no fire seen.
   */
  outcome: "unusual" | "usual" | "few" | "none";
}

/** Fires are "unusual" when they burned on at least 3 checked days, and three times as often as before. */
export function judgeFire(during: FireDays, before: FireDays): FireCheck["outcome"] {
  if (during.withFire === 0 || during.checked === 0) return "none";
  const rate = during.withFire / during.checked;
  const usual = before.checked ? before.withFire / before.checked : 0;
  if (during.withFire >= 3 && rate >= 3 * usual) return "unusual";
  return before.withFire >= 2 ? "usual" : "few";
}

export interface PeopleCount {
  year: number;
  /** People in the area (a lower bound where the map's top class, "over 1,000 per km²", is reached). */
  people: number;
  /** Area with a population value. */
  km2: number;
  /** Share of that area at the map's top class (over 1,000 people per km²). */
  crowdedShare: number;
}

export interface PeopleCheck {
  first: PeopleCount;
  last: PeopleCount;
  /** (last − first) ÷ first. */
  growth: number;
  /** People per km² in the later year. */
  density: number;
  /** How strongly this supports "more people" as a cause (null: it doesn't). */
  strength: "some" | "weak" | null;
}

export function judgePeople(first: PeopleCount, last: PeopleCount): PeopleCheck {
  const growth = first.people > 0 ? (last.people - first.people) / first.people : 0;
  const density = last.km2 > 0 ? last.people / last.km2 : 0;
  const crowdedGrowth = last.crowdedShare - first.crowdedShare;
  let strength: PeopleCheck["strength"] = null;
  if ((growth >= 0.25 && density >= 50) || crowdedGrowth >= 0.03) strength = "some";
  else if (growth >= 0.1 && density >= 10) strength = "weak";
  return { first, last, growth, density, strength };
}
