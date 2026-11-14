import { useEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/async";
import type { MetricTrend } from "@/lib/analysis/trend";
import type { AnalysisResult } from "@/lib/analysis/types";
import { compareWithStations, GROUND_MEASURES, type GroundComparison, type GroundMeasure } from "@/lib/stations/groundCheck";
import { nearbyStationRecords } from "@/lib/stations/ncei";

export type GroundCheckState =
  | { status: "idle" }
  | { status: "loading" }
  /** At least one measure compared; `missing` are the measures no station could check. */
  | { status: "done"; comparisons: GroundComparison[]; missing: GroundMeasure[] }
  /** No station near enough with a long enough record. */
  | { status: "none" }
  | { status: "error" };

/**
 * NASA's air temperature and rainfall trends for the place, checked against the nearest NOAA weather
 * station, once the report has them. Not for a comparison of two periods (there is no trend to check).
 */
export function useGroundCheck(result: AnalysisResult | null, trends: MetricTrend[], enabled: boolean): GroundCheckState {
  const checkable = useMemo(() => trends.filter((trend) => GROUND_MEASURES.includes(trend.metric.id as GroundMeasure) && trend.verdict), [trends]);
  const months = result?.period?.calendarMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const center = result?.target.center;
  const years = useMemo(() => {
    const all = checkable.flatMap((trend) => trend.yearly.filter((year) => year.value !== null).map((year) => year.year));
    return all.length ? ([Math.min(...all), Math.max(...all)] as const) : null;
  }, [checkable]);
  const key = enabled && center && years && !result?.period?.compare ? `${center.join(",")}|${years.join("-")}|${months.join(".")}|${checkable.map((t) => t.metric.id).join(",")}` : null;
  const [state, setState] = useState<{ key: string | null; value: GroundCheckState }>({ key: null, value: { status: "idle" } });

  useEffect(() => {
    if (!key || !center || !years) return;
    const controller = new AbortController();
    setState({ key, value: { status: "loading" } });
    nearbyStationRecords(center, years[0], years[1], controller.signal)
      .then((records) => {
        const comparisons = checkable.map((trend) => compareWithStations(trend, records, months)).filter((c): c is GroundComparison => c !== null);
        const missing = checkable.map((trend) => trend.metric.id as GroundMeasure).filter((id) => !comparisons.some((c) => c.measure === id));
        setState({ key, value: comparisons.length ? { status: "done", comparisons, missing } : { status: "none" } });
      })
      .catch((error) => {
        if (!isAbortError(error)) setState({ key, value: { status: "error" } });
      });
    return () => controller.abort();
    // The key holds everything the check depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key && state.key === key ? state.value : key ? { status: "loading" } : { status: "idle" };
}
