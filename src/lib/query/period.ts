// Turns the chosen period into concrete years: the years to fetch, a baseline period and a
// recent period. Seasons that cross New Year (Dec–Feb, Nov–Apr) belong to the year they end in.

/** The period chosen on the Trends page. */
export type TimeSpec =
  | { kind: "default" }
  | { kind: "since"; start: number }
  | { kind: "range"; start: number; end: number }
  | { kind: "last"; years: number }
  | { kind: "year"; year: number }
  | { kind: "versus"; baseline: number; recent: number };

export interface DataWindow {
  /** First and last month the NASA product has published (YYYY-MM). */
  earliest: string;
  latest: string;
}

export interface PeriodPlan {
  /** "trend": every year between start and end; "comparison": just two seasons (no trend test). */
  kind: "trend" | "comparison";
  startYear: number;
  endYear: number;
  baseline: [number, number];
  recent: [number, number];
  /** Years whose season is fetched, in order. */
  years: number[];
  /** Calendar months (1–12) compared in every year. */
  months: number[];
  notes: string[];
}

export const DEFAULT_YEARS = 10;
/** At most this many monthly maps per scan, to stay polite to NASA's free services. */
export const MAX_GRIDS = 180;

const pad = (m: number) => String(m).padStart(2, "0");

/** Months (YYYY-MM) of the season that ends in `year`. */
export function seasonYearMonths(year: number, months: number[]): string[] {
  const sorted = [...months].sort((a, b) => a - b);
  const wraps = sorted.includes(12) && sorted.includes(1) && sorted.length < 12;
  // For a wrapping season the run starts at the first month whose predecessor isn't in the season.
  const runStart = wraps ? (sorted.find((m) => !sorted.includes(m === 1 ? 12 : m - 1)) ?? sorted[0]) : sorted[0];
  return sorted
    .map((m) => ({ m, y: wraps && m >= runStart ? year - 1 : year }))
    .sort((a, b) => a.y - b.y || a.m - b.m)
    .map(({ m, y }) => `${y}-${pad(m)}`);
}

/** First and last years whose whole season lies inside the product's record. */
export function completeSeasonYears(months: number[], window: DataWindow): { first: number; last: number } | null {
  const firstYear = Number(window.earliest.slice(0, 4));
  const lastYear = Number(window.latest.slice(0, 4));
  let first: number | null = null;
  let last: number | null = null;
  for (let year = firstYear; year <= lastYear + 1; year++) {
    const keys = seasonYearMonths(year, months);
    if (keys[0] >= window.earliest && keys[keys.length - 1] <= window.latest) {
      if (first === null) first = year;
      last = year;
    }
  }
  return first !== null && last !== null ? { first, last } : null;
}

/**
 * The last year a search can reach, before each product's own record is checked: the latest year
 * whose months, for every set given, are all published by `latest`, taking the set that reaches
 * furthest. A summer measure reaches this year once August is out; an all-year one waits for December.
 */
export function lastSeasonYear(monthSets: number[][], latest: string): number {
  const years = monthSets.map((months) => completeSeasonYears(months, { earliest: "2000-01", latest })?.last ?? Number(latest.slice(0, 4)) - 1);
  return years.length ? Math.max(...years) : Number(latest.slice(0, 4)) - 1;
}

function windowLength(years: number): number {
  return Math.max(2, Math.min(5, Math.round(years / 4)));
}

/** The years a time choice covers, before a product's record trims them. */
export function timeSpan(time: TimeSpec, last: number): [number, number] {
  switch (time.kind) {
    case "since":
      return [time.start, last];
    case "range":
      return [time.start, time.end];
    case "last":
      return [last - time.years + 1, last];
    case "year":
      return [time.year, time.year];
    case "versus":
      return [time.baseline, time.recent];
    default:
      return [last - DEFAULT_YEARS + 1, last];
  }
}

/**
 * The years a trend scan compares for its change: the first and last few years of the span, or, for
 * a span of four years or less, those years against the decade before them. null when there is no
 * earlier record to compare a short span with.
 */
export function trendWindows(start: number, end: number, first: number): { baseline: [number, number]; recent: [number, number] } | null {
  const span = end - start + 1;
  if (span <= 4) {
    const baselineEnd = start - 1;
    const baselineStart = Math.max(first, start - 10);
    return baselineEnd < baselineStart ? null : { baseline: [baselineStart, baselineEnd], recent: [start, end] };
  }
  const k = windowLength(span);
  return { baseline: [start, start + k - 1], recent: [end - k + 1, end] };
}

/** Keeps the baseline and recent years and samples the years between to fit the grid budget. */
function thinYears(years: number[], baseline: [number, number], recent: [number, number], monthsPerYear: number, maxGrids: number): number[] {
  if (years.length * monthsPerYear <= maxGrids) return years;
  const keep = new Set(years.filter((y) => (y >= baseline[0] && y <= baseline[1]) || (y >= recent[0] && y <= recent[1])));
  const middle = years.filter((y) => !keep.has(y));
  const room = Math.max(0, Math.floor(maxGrids / monthsPerYear) - keep.size);
  if (room > 0 && middle.length) {
    const step = middle.length / room;
    for (let i = 0; i < Math.min(room, middle.length); i++) keep.add(middle[Math.floor(i * step + step / 2)]);
  }
  return [...keep].sort((a, b) => a - b);
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let y = a; y <= b; y++) out.push(y);
  return out;
}

/**
 * Plans the years for a scan. Returns an error string when the request falls outside the record.
 * Short periods (up to 4 years) are compared with the 10 years before them.
 */
export function planPeriod(time: TimeSpec, months: number[], window: DataWindow, maxGrids = MAX_GRIDS): PeriodPlan | { error: string } {
  const bounds = completeSeasonYears(months, window);
  if (!bounds) return { error: "NASA hasn't published a complete season for this product yet." };
  const { first, last } = bounds;
  const notes: string[] = [];

  if (time.kind === "versus") {
    const [a, b] = [time.baseline, time.recent];
    for (const year of [a, b]) {
      if (year < first || year > last) return { error: `${year} is outside this product's record (complete seasons ${first}–${last}).` };
    }
    if (a === b) return { error: "Pick two different years to compare." };
    return { kind: "comparison", startYear: a, endYear: b, baseline: [a, a], recent: [b, b], years: [a, b], months, notes: ["Two seasons compared directly: there is no trend test with only two values."] };
  }

  let [start, end] = timeSpan(time, last);
  if (start < first) {
    notes.push(`The record starts in ${first}, so the scan starts there.`);
    start = first;
  }
  if (end > last) {
    notes.push(`The latest complete season is ${last}.`);
    end = last;
  }
  if (start > end) return { error: `No complete seasons between those years (this product covers ${first}–${last}).` };

  const span = end - start + 1;
  const windows = trendWindows(start, end, first);
  if (span <= 4) {
    // "drought in 2021–2023": compare those years with the decade before them.
    if (!windows) return { error: `There is no earlier record to compare ${start}${span > 1 ? `–${end}` : ""} with (data start in ${first}).` };
    const [baselineStart, baselineEnd] = windows.baseline;
    notes.push(`${start}${span > 1 ? `–${end}` : ""} compared with ${baselineStart}–${baselineEnd}.`);
    const years = thinYears(range(baselineStart, end), [baselineStart, baselineEnd], [start, end], months.length, maxGrids);
    return { kind: "trend", startYear: baselineStart, endYear: end, baseline: [baselineStart, baselineEnd], recent: [start, end], years, months, notes };
  }

  const { baseline, recent } = windows as NonNullable<typeof windows>;
  const all = range(start, end);
  const years = thinYears(all, baseline, recent, months.length, maxGrids);
  if (years.length < all.length) notes.push(`${years.length} of ${all.length} years are read, to keep the scan quick.`);
  return { kind: "trend", startYear: start, endYear: end, baseline, recent, years, months, notes };
}
