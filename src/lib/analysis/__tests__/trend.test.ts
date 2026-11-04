import { describe, expect, it } from "vitest";
import { METRIC_BY_ID } from "../metrics";
import { analysisTrends, longerPeriodHint, metricTrend } from "../trend";
import { annualTrendVerdict, type MonthlyValue } from "../stats";
import { trendLines } from "../export";
import type { AnalysisPeriod, AnalysisResult } from "../types";

const ALL: AnalysisPeriod = { calendarMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], compare: null };

function noise(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
}

/** Monthly NDVI-like values: a seasonal cycle, a yearly change and some noise. */
function monthly(startYear: number, endYear: number, perYear: number, wobble = 0.01, seed = 7): MonthlyValue[] {
  const rand = noise(seed);
  const out: MonthlyValue[] = [];
  for (let year = startYear; year <= endYear; year++) {
    for (let m = 1; m <= 12; m++) {
      const season = 0.15 * Math.sin(((m - 4) / 12) * 2 * Math.PI);
      out.push({ month: `${year}-${String(m).padStart(2, "0")}`, value: 0.4 + season + perYear * (year - startYear) + wobble * rand() });
    }
  }
  return out;
}

describe("trend tests for an analysis", () => {
  it("finds a real decline and needs no hint", () => {
    const trend = metricTrend(METRIC_BY_ID.ndvi, monthly(2001, 2020, -0.006), ALL);
    expect(trend.verdict?.direction).toBe("decline");
    expect(trend.verdict?.slopePerYear).toBeCloseTo(-0.006, 3);
    expect(trend.verdict?.lowerPerYear).toBeLessThanOrEqual(trend.verdict?.slopePerYear as number);
    expect(trend.verdict?.upperPerYear).toBeGreaterThanOrEqual(trend.verdict?.slopePerYear as number);
    expect(trend.span).toEqual([2001, 2020]);
    expect(trend.yearly).toHaveLength(20);
    expect(trend.hint).toBeNull();
  });

  it("reports no clear trend in a short noisy record and suggests the whole record", () => {
    const trend = metricTrend(METRIC_BY_ID.ndvi, monthly(2016, 2025, 0, 0.08, 3), ALL);
    expect(trend.verdict?.direction).toBe("none");
    expect(trend.hint?.startYear).toBe(2000);
    expect(trend.hint?.text).toMatch(/every year since 2000/);
  });

  it("explains when there are too few years to test", () => {
    const values = monthly(2023, 2025, 0).filter((v) => ["06", "07", "08"].includes(v.month.slice(5)));
    const trend = metricTrend(METRIC_BY_ID.ndvi, values, { calendarMonths: [6, 7, 8], compare: null });
    expect(trend.verdict).toBeNull();
    expect(trend.note).toMatch(/Only 3 years/);
    expect(trend.hint?.text).toMatch(/Too few years/);
  });

  it("compares two periods with Welch's t-test on yearly values", () => {
    const early = monthly(2001, 2008, 0, 0.02, 11);
    const late = monthly(2016, 2023, 0, 0.02, 12).map((v) => ({ ...v, value: (v.value as number) - 0.05 }));
    const trend = metricTrend(METRIC_BY_ID.ndvi, [...early, ...late], { ...ALL, compare: { baseline: [2001, 2008], recent: [2016, 2023] } });
    expect(trend.verdict).toBeNull();
    expect(trend.comparison?.label).toBe("Significantly lower");
    expect(trend.comparison?.change).toBeCloseTo(-0.05, 2);
    expect(trend.comparison?.baselineYears).toBe(8);
    expect(trend.comparison?.p).toBeLessThan(0.05);
  });

  it("only hints when the record could be longer", () => {
    const none = annualTrendVerdict([2001, 2002, 2003, 2004, 2005], [1, 3, 2, 3, 1]);
    expect(none?.direction).toBe("none");
    expect(longerPeriodHint(none, 2001)).toBeNull();
    expect(longerPeriodHint(none, 2010)?.startYear).toBe(2000);
    const rising = annualTrendVerdict([2010, 2011, 2012, 2013, 2014, 2015, 2016], [1, 2, 3, 4, 5, 6, 7]);
    expect(longerPeriodHint(rising, 2010)).toBeNull();
  });

  it("tests every measured series of a result and writes the outcome into the CSV", () => {
    const values = monthly(2001, 2020, -0.006);
    const result: AnalysisResult = {
      target: { name: "Test", geometry: { type: "Polygon", coordinates: [] }, bbox: [0, 0, 1, 1], center: [0.5, 0.5], areaKm2: 100, kind: "drawn", ref: { type: "bbox", bbox: [0, 0, 1, 1] } },
      start: "2001-01",
      end: "2020-12",
      datasets: ["vegetation"],
      generatedAt: "",
      period: ALL,
      satellite: {
        vegetation: {
          dataset: "vegetation",
          layerId: "x",
          label: "Vegetation",
          unit: "NDVI",
          decimals: 2,
          source: "test",
          latestAvailable: null,
          status: "ok",
          points: values.map((v) => ({ month: v.month, value: v.value, p10: null, p90: null, coverage: 1 })),
        },
      },
    };
    const trends = analysisTrends(result);
    expect(trends.map((t) => t.metric.id)).toEqual(["ndvi"]);
    expect(trends[0].verdict?.label).toBe("Significant decline");
    expect(trendLines(result)[0]).toMatch(/^# Trend, Vegetation \(NDVI\): Significant decline, -0\.00\d+ per year \(95% range .+\), Mann-Kendall p < 0\.001, years 2001–2020$/);
  });
});
