// What each page asks the cause finder: the measure year by year, the place, and where to read its
// weather. A measure the site can't look for causes of gets nothing (no section at all); one with too
// few years gets a plain reason instead of the button.

import { climatePoints } from "../analysis/run";
import { directionOf, periodOf, type MetricTrend } from "../analysis/trend";
import type { AnalysisResult } from "../analysis/types";
import type { BBox, PolygonGeometry } from "../geo/geometry";
import type { IndicatorId } from "../query/indicators";
import type { CauseRequest } from "./gather";
import { MIN_WEATHER_YEARS, type YearPoint } from "./model";
import { familyOfIndicator, familyOfMetric, type Family } from "./rules";

export interface CauseSetup {
  /** Null when the checks can't run here; `unavailable` says why. */
  request: CauseRequest | null;
  unavailable: string | null;
}

function setup(series: YearPoint[], base: Omit<CauseRequest, "series">): CauseSetup {
  const measured = series.filter((p) => p.value !== null && Number.isFinite(p.value)).length;
  if (measured < MIN_WEATHER_YEARS) {
    return {
      request: null,
      unavailable: `Looking for causes needs at least ${MIN_WEATHER_YEARS} years with data, and this has ${measured}. Choose a longer period to look.`,
    };
  }
  return { request: { ...base, series: series.map((p) => ({ year: p.year, value: p.value })) }, unavailable: null };
}

/** For one measure of an Analysis report: only when it changed, and only for measures with causes to test. */
export function analysisCauses(trend: MetricTrend, result: AnalysisResult): CauseSetup | null {
  const family = familyOfMetric(trend.metric.id);
  const direction = directionOf(trend);
  if (!family || direction === "none") return null;
  const points = result.climate?.samplePoints?.length ? result.climate.samplePoints : climatePoints(result.target);
  return setup(trend.yearly, {
    family,
    direction,
    noun: trend.metric.noun,
    months: periodOf(result).calendarMonths,
    geometry: result.target.geometry,
    bbox: result.target.bbox,
    points,
  });
}

/** For the whole area or one hotspot on the Trends page. */
export function trendCauses(input: {
  indicator: IndicatorId;
  noun: string;
  series: YearPoint[];
  direction: "decline" | "increase" | "none";
  months: number[];
  geometry: PolygonGeometry;
  bbox: BBox;
  areaKm2: number;
}): CauseSetup | null {
  const family: Family | null = familyOfIndicator(input.indicator);
  if (!family || input.direction === "none") return null;
  return setup(input.series, {
    family,
    direction: input.direction,
    noun: input.noun,
    months: input.months,
    geometry: input.geometry,
    bbox: input.bbox,
    points: climatePoints({ geometry: input.geometry, areaKm2: input.areaKm2 }),
  });
}
