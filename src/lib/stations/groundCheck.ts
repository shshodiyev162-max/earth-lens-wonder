// NASA's climate record for a place, checked against the nearest weather station: the station's
// own trend, tested the same way, whether the two rates agree within their 95% ranges, and how
// closely their years rise and fall together.

import { seasonYearOf, type YearValue } from "../analysis/aggregate";
import { annualTrendVerdict, formatP, mean, pearson, signed, type MonthlyValue, type TrendVerdict } from "../analysis/stats";
import type { MetricTrend } from "../analysis/trend";
import type { Station, StationRecord } from "./ncei";

/** The NASA measures a weather station also measures. */
export type GroundMeasure = "airTemp" | "rain";
export const GROUND_MEASURES: GroundMeasure[] = ["airTemp", "rain"];

/** Years a station and NASA must both have for their trends to be compared. */
const MIN_YEARS = 10;
/** A station covering this share of NASA's years is preferred to a nearer one covering fewer. */
const GOOD_SHARE = 0.7;

export interface GroundComparison {
  measure: GroundMeasure;
  station: Station;
  /** The station's value each year, for the same months as NASA's. */
  stationYearly: YearValue[];
  nasaYearly: YearValue[];
  stationTrend: TrendVerdict;
  nasaTrend: TrendVerdict;
  /** The two 95% ranges overlap: the ground and NASA give rates that can both be right. */
  agree: boolean;
  /** How closely the years rise and fall together (Pearson's r on the years both have). */
  correlation: number | null;
  sharedYears: number;
  /** First and last of those years: both trends are tested over them, so they compare like with like. */
  span: [number, number];
  /** The station covers every year NASA's trend was tested on. */
  whole: boolean;
}

/**
 * A weather station's value each year for the season. Station records have gaps (Tashkent's has 135
 * of 240 months), so each month is taken as its departure from the station's own average for that
 * calendar month, and a year is the station's usual season plus the average departure of the months
 * it measured, when it measured at least half of them; for rainfall the departures are scaled up to
 * a season total. A year measured only in summer then can't pass for a warmer year.
 */
export function stationYearly(monthly: MonthlyValue[], months: number[], aggregate: "mean" | "sum", first: number, last: number): YearValue[] {
  const wanted = new Set(months);
  const calendar = (month: string) => Number(month.slice(5, 7));
  const measured = monthly.filter((m): m is { month: string; value: number } => m.value !== null && Number.isFinite(m.value) && wanted.has(calendar(m.month)));
  const inRange = measured.filter((m) => {
    const year = seasonYearOf(m.month, months);
    return year >= first && year <= last;
  });
  const byCalendar = new Map<number, number[]>();
  for (const m of inRange) byCalendar.set(calendar(m.month), [...(byCalendar.get(calendar(m.month)) ?? []), m.value]);
  const normals = months.map((month) => byCalendar.get(month) ?? []);
  const empty = (year: number): YearValue => ({ year, value: null, count: 0, expected: months.length, complete: true });
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  // Every month of the season needs a usual value of its own (three years or more) to measure departures from.
  if (normals.some((list) => list.length < 3)) return years.map(empty);
  const normal = new Map(months.map((month, i) => [month, mean(normals[i])]));
  const usual = aggregate === "sum" ? [...normal.values()].reduce((total, v) => total + v, 0) : mean([...normal.values()]);
  const departures = new Map<number, number[]>();
  for (const m of inRange) {
    const year = seasonYearOf(m.month, months);
    departures.set(year, [...(departures.get(year) ?? []), m.value - (normal.get(calendar(m.month)) as number)]);
  }
  return years.map((year) => {
    const list = departures.get(year) ?? [];
    if (list.length < Math.ceil(months.length / 2)) return { ...empty(year), count: list.length };
    const departure = mean(list) * (aggregate === "sum" ? months.length : 1);
    return { year, value: usual + departure, count: list.length, expected: months.length, complete: true };
  });
}

/**
 * The comparison with the best nearby station, or null: the nearest one that covers most of NASA's
 * years, else the one sharing the most years with it. Both trends are tested over the years both
 * have (a station whose record stops in 2017 is compared with NASA's 2006–2017, not 2006–2025).
 * `months` are the calendar months of the analysis, so a summer trend is checked against summers.
 */
export function compareWithStations(nasa: MetricTrend, records: StationRecord[], months: number[]): GroundComparison | null {
  const measure = nasa.metric.id as GroundMeasure;
  if (!GROUND_MEASURES.includes(measure) || !nasa.verdict) return null;
  const nasaYears = nasa.yearly.filter((year): year is YearValue & { value: number } => year.value !== null);
  if (!nasaYears.length) return null;
  const first = nasaYears[0].year;
  const last = nasaYears[nasaYears.length - 1].year;
  const candidates: GroundComparison[] = [];
  for (const record of records) {
    const monthly = measure === "airTemp" ? record.temperature : record.rainfall;
    const stationYearlyValues = stationYearly(monthly, months, nasa.metric.aggregate, first, last);
    const byYear = new Map(stationYearlyValues.filter((year) => year.value !== null).map((year) => [year.year, year.value as number]));
    const shared = nasaYears.filter((year) => byYear.has(year.year));
    if (shared.length < MIN_YEARS) continue;
    const years = shared.map((year) => year.year);
    const stationTrend = annualTrendVerdict(years, years.map((year) => byYear.get(year) as number));
    const nasaTrend = annualTrendVerdict(years, shared.map((year) => year.value));
    if (!stationTrend || !nasaTrend) continue;
    const r = pearson(shared.map((year) => year.value), years.map((year) => byYear.get(year) ?? null));
    candidates.push({
      measure,
      station: record.station,
      stationYearly: stationYearlyValues,
      nasaYearly: nasa.yearly,
      stationTrend,
      nasaTrend,
      agree: stationTrend.lowerPerYear <= nasaTrend.upperPerYear && nasaTrend.lowerPerYear <= stationTrend.upperPerYear,
      correlation: r ? r.r : null,
      sharedYears: shared.length,
      span: [years[0], years[years.length - 1]],
      whole: shared.length === nasaYears.length,
    });
  }
  // Records come nearest first.
  return candidates.find((c) => c.sharedYears >= GOOD_SHARE * nasaYears.length) ?? [...candidates].sort((a, b) => b.sharedYears - a.sharedYears)[0] ?? null;
}

/** The comparison in plain words. */
export function groundCheckText(comparison: GroundComparison, unit: string, decimals: number): string {
  const perDecade = (verdict: TrendVerdict) => `${signed(verdict.slopePerYear * 10, decimals)}${unit ? ` ${unit}` : ""} per decade`;
  const range = (verdict: TrendVerdict) => `95% range ${signed(verdict.lowerPerYear * 10, decimals)} to ${signed(verdict.upperPerYear * 10, decimals)}`;
  const { stationTrend: station, nasaTrend: nasa } = comparison;
  const where = `${comparison.station.name} weather station, ${Math.round(comparison.station.distanceKm)} km away,`;
  const [from, to] = comparison.span;
  const over = comparison.whole ? `Over ${from}–${to}, the` : `Over ${from}–${to}, the years its record covers, the`;
  const measured = `${over} ${where} measured ${perDecade(station)} (${range(station)}, ${formatP(station.p)}); NASA's record here gives ${perDecade(nasa)} over the same years (${range(nasa)}).`;
  const verdict = comparison.agree
    ? "Their ranges overlap: the ground agrees with NASA's rate."
    : "Their ranges don't overlap: the station and NASA's record disagree here. A station measures one spot, which a growing town, a valley or a moved instrument can change on its own; NASA's record is an average over about 50 km.";
  const together =
    comparison.correlation === null
      ? ""
      : comparison.correlation >= 0.7
        ? ` Year by year they rise and fall together (r = ${comparison.correlation.toFixed(2)} over ${comparison.sharedYears} years).`
        : comparison.correlation >= 0.4
          ? ` Year by year they partly follow each other (r = ${comparison.correlation.toFixed(2)} over ${comparison.sharedYears} years).`
          : ` Year by year they follow each other only loosely (r = ${comparison.correlation.toFixed(2)} over ${comparison.sharedYears} years).`;
  return `${measured} ${verdict}${together}`;
}
