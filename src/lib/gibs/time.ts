// Which dates does a GIBS layer actually have? GIBS publishes this through its
// WMTS "DescribeDomains" resources. Requesting a date outside the domain (or in
// a processing gap) returns HTTP 404, so the maps resolve every requested date
// against the real domain before building tile URLs.

import { GIBS_WMTS, isTimeEnabled, type GibsLayer } from "./catalog";

export interface TimeInterval {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  period: string; // ISO-8601 duration, e.g. P1D, P16D, P1M
}

export interface TimeDomain {
  intervals: TimeInterval[];
  earliest: string;
  latest: string;
}

export type DateResolution = "exact" | "snapped" | "latest" | "earliest" | "gap" | "static" | "unchecked";

export interface ResolvedDate {
  requested: string;
  /** Date to put in the tile URL (start of the composite period for multi-day products). */
  date: string;
  resolution: DateResolution;
}

// ---------------------------------------------------------------------------
// Date utilities (UTC, ISO strings)

export function todayUtc(): string {
  return toIsoDate(new Date());
}

/**
 * NASA needs a few hours after a UTC day ends to process its last satellite passes,
 * so "N days ago" for near-real-time imagery is counted with this margin.
 */
export const NRT_PROCESSING_HOURS = 6;

/** UTC date `days` days ago, counting a day as complete only NRT_PROCESSING_HOURS after it ended. */
export function completeDaysAgoUtc(days: number, now: Date = new Date()): string {
  const hours = days > 0 ? days * 24 + NRT_PROCESSING_HOURS : 0;
  return toIsoDate(new Date(now.getTime() - hours * 3_600_000));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseIsoDate(value).getTime());
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function addMonths(value: string, months: number): string {
  const date = parseIsoDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseIsoDate(a).getTime() - parseIsoDate(b).getTime()) / 86_400_000);
}

interface Step {
  days: number;
  months: number;
}

export function parsePeriod(period: string): Step {
  const match = period.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?/);
  if (!match) return { days: 1, months: 0 };
  const years = Number(match[1] ?? 0);
  const months = Number(match[2] ?? 0);
  const days = Number(match[3] ?? 0);
  if (years || months) return { days: 0, months: years * 12 + months };
  return { days: days || 1, months: 0 };
}

function stepDate(value: string, step: Step, count: number): string {
  return step.months ? addMonths(value, step.months * count) : addDays(value, step.days * count);
}

/** Number of whole steps from `start` to `value` (floor). */
function stepsBetween(start: string, value: string, step: Step): number {
  if (step.months) {
    const a = parseIsoDate(start);
    const b = parseIsoDate(value);
    let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (b.getUTCDate() < a.getUTCDate()) months -= 1;
    return Math.floor(months / step.months);
  }
  return Math.floor(diffDays(value, start) / step.days);
}

// ---------------------------------------------------------------------------
// Domain parsing

export function parseDomainXml(xml: string): TimeDomain | null {
  const match = xml.match(/<Domain>([^<]*)<\/Domain>/);
  if (!match) return null;
  const intervals: TimeInterval[] = match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [start, end = start, period = "P1D"] = part.split("/");
      return { start: start.slice(0, 10), end: end.slice(0, 10), period };
    })
    .filter((interval) => isIsoDate(interval.start) && isIsoDate(interval.end))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (intervals.length === 0) return null;
  return {
    intervals,
    earliest: intervals[0].start,
    latest: intervals.reduce((max, interval) => (interval.end > max ? interval.end : max), intervals[0].end),
  };
}

/** Last valid time step of an interval (the end may not sit on the period grid). */
function lastStep(interval: TimeInterval): string {
  const step = parsePeriod(interval.period);
  const n = stepsBetween(interval.start, interval.end, step);
  return stepDate(interval.start, step, Math.max(0, n));
}

/**
 * Resolve a requested date to a date GIBS can serve: inside the domain, aligned
 * to the composite period, or the nearest available step when it falls in a gap.
 */
export function resolveInDomain(domain: TimeDomain, requested: string): ResolvedDate {
  if (requested > domain.latest) {
    const last = domain.intervals.reduce((best, interval) => (interval.end >= best.end ? interval : best));
    return { requested, date: lastStep(last), resolution: "latest" };
  }
  if (requested < domain.earliest) {
    return { requested, date: domain.earliest, resolution: "earliest" };
  }

  let previous: TimeInterval | null = null;
  for (const interval of domain.intervals) {
    if (requested >= interval.start && requested <= interval.end) {
      const step = parsePeriod(interval.period);
      const aligned = stepDate(interval.start, step, Math.max(0, stepsBetween(interval.start, requested, step)));
      return { requested, date: aligned, resolution: aligned === requested ? "exact" : "snapped" };
    }
    if (interval.start > requested) {
      // Requested date sits in a gap between `previous` and `interval`.
      const before = previous ? lastStep(previous) : null;
      const after = interval.start;
      const pickBefore = before !== null && diffDays(requested, before) <= diffDays(after, requested);
      return { requested, date: pickBefore && before ? before : after, resolution: "gap" };
    }
    previous = interval;
  }
  return { requested, date: previous ? lastStep(previous) : domain.latest, resolution: "latest" };
}

// ---------------------------------------------------------------------------
// Fetching (cached per layer)

const domainCache = new Map<string, Promise<TimeDomain | null>>();

export function domainUrl(layer: GibsLayer): string {
  return `${GIBS_WMTS}/1.0.0/${layer.id}/default/${layer.matrixSet}/all/all.xml`;
}

export function fetchTimeDomain(layer: GibsLayer): Promise<TimeDomain | null> {
  if (!isTimeEnabled(layer)) return Promise.resolve(null);
  const cached = domainCache.get(layer.id);
  if (cached) return cached;
  const request = fetch(domainUrl(layer))
    .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`Domain request failed (${response.status})`))))
    .then((xml) => parseDomainXml(xml))
    .catch((error) => {
      domainCache.delete(layer.id); // allow a retry later
      throw error;
    });
  domainCache.set(layer.id, request);
  return request;
}

/** Default date for a layer: its latest step, minus the near-real-time lag for daily imagery. */
export function defaultDateFor(layer: GibsLayer, domain: TimeDomain | null): string {
  const lagged = completeDaysAgoUtc(layer.defaultLagDays ?? 0);
  if (!domain) return lagged;
  const target = layer.defaultLagDays ? (lagged < domain.latest ? lagged : domain.latest) : domain.latest;
  return resolveInDomain(domain, target).date;
}

/** Offline guess used before the domain has loaded (keeps the first paint fast). */
export function provisionalDate(layer: GibsLayer, requested?: string | null): string {
  const lagDays =
    layer.defaultLagDays ??
    (layer.period === "16-day" ? 40 : layer.period === "8-day" ? 20 : layer.period === "monthly" ? 70 : layer.period === "yearly" ? 3000 : 2);
  const latestGuess = completeDaysAgoUtc(lagDays);
  if (!requested || requested > latestGuess) return latestGuess;
  return requested;
}

export function stepForLayer(layer: GibsLayer): Step {
  switch (layer.period) {
    case "8-day":
      return { days: 8, months: 0 };
    case "16-day":
      return { days: 16, months: 0 };
    case "monthly":
      return { days: 0, months: 1 };
    case "yearly":
      return { days: 0, months: 12 };
    default:
      return { days: 1, months: 0 };
  }
}

export function shiftDate(value: string, step: Step, direction: 1 | -1): string {
  return step.months ? addMonths(value, step.months * direction) : addDays(value, step.days * direction);
}

// ---------------------------------------------------------------------------
// Months (analysis)

/** YYYY-MM months from start to end inclusive. */
export function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let [year, month] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  let guard = 0;
  while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 600) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    guard += 1;
  }
  return months;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonthsToMonth(month: string, delta: number): string {
  return monthOf(addMonths(`${month}-01`, delta));
}

/** Monthly steps a layer can serve within [start, end] (YYYY-MM). */
export function availableMonths(domain: TimeDomain | null, start: string, end: string): string[] {
  const months = monthRange(start, end);
  if (!domain) return months;
  return months.filter((month) => {
    const day = `${month}-01`;
    return domain.intervals.some((interval) => day >= interval.start && day <= interval.end);
  });
}

export function formatMonth(month: string, style: "short" | "long" = "short"): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1, 1));
  return date.toLocaleDateString("en-US", { month: style === "long" ? "long" : "short", year: "numeric", timeZone: "UTC" });
}

export function formatDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
