import { describe, expect, it } from "vitest";
import { METRIC_BY_ID } from "../metrics";
import { analysisTrends, cappedShareOf, directionOf, longerPeriodHint, metricNotes, metricTrend, missingDatasets, rankTrends, rateText } from "../trend";
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

function resultWith(overrides: Partial<AnalysisResult>): AnalysisResult {
  return {
    target: { name: "Here" } as AnalysisResult["target"],
    start: "2006-09",
    end: "2026-08",
    datasets: [],
    generatedAt: "2026-11-09T00:00:00Z",
    satellite: {},
    ...overrides,
  };
}

function seriesOf(dataset: "waterStorage" | "vegetation" | "salinity" | "snow" | "snowfall", points: { month: string; value: number | null; capped?: number; coverage?: number }[], status: "ok" | "empty" | "error" = "ok") {
  return { dataset, layerId: "x", label: dataset, unit: "", decimals: 1, source: "test", latestAvailable: null, status, points: points.map((p) => ({ p10: null, p90: null, coverage: 0.9, ...p })) };
}

describe("rates", () => {
  const verdict = (slope: number, lower: number, upper: number, years = 20) => annualTrendVerdict(Array.from({ length: years }, (_, i) => 2000 + i), Array.from({ length: years }, (_, i) => i * slope))!;

  it("reads per decade on a long record, with enough digits to be useful", () => {
    const v = { ...verdict(0.05, 0, 0), slopePerYear: 0.0614, lowerPerYear: 0.043, upperPerYear: 0.093, slopePerDecade: 0.614 };
    expect(rateText(v, { unit: "°C", decimals: 1 })).toEqual({ rate: "+0.61 °C per decade", range: "95% range +0.43 to +0.93" });
    const small = { ...v, slopePerYear: -0.00123, lowerPerYear: -0.002, upperPerYear: -0.0005, slopePerDecade: -0.0123 };
    expect(rateText(small, { unit: "", decimals: 3 })).toEqual({ rate: "−0.012 per decade", range: "95% range −0.020 to −0.005" });
  });

  it("takes its digits from the range when the trend itself is almost nothing", () => {
    // Real wind near the Aral Sea: the middle estimate is close to zero, the range is not.
    const v = { ...verdict(0.05, 0, 0), slopePerYear: 0.000093, lowerPerYear: -0.011667, upperPerYear: 0.009083, slopePerDecade: 0.00093 };
    expect(rateText(v, { unit: "m/s", decimals: 1 })).toEqual({ rate: "0.00 m/s per decade", range: "95% range −0.12 to +0.09" });
  });

  it("reads per year on a record under ten years", () => {
    const v = { ...verdict(1, 0, 0, 6), slopePerYear: 12.4, lowerPerYear: 5, upperPerYear: 20, slopePerDecade: null };
    expect(rateText(v, { unit: "ppb", decimals: 0 })).toEqual({ rate: "+12 ppb per year", range: "95% range +5 to +20" });
  });
});

describe("the order of the scoreboard", () => {
  it("puts real changes first, strongest first, then no clear trend, then what couldn't be tested", () => {
    const strong = metricTrend(METRIC_BY_ID.rain, monthly(2001, 2020, 0.02), ALL);
    const weak = metricTrend(METRIC_BY_ID.ndvi, monthly(2001, 2020, -0.0006, 0.04), ALL);
    const none = metricTrend(METRIC_BY_ID.airTemp, monthly(2001, 2020, 0, 0.4), ALL);
    const untested = metricTrend(METRIC_BY_ID.soil, monthly(2024, 2024, 0), { ...ALL, calendarMonths: [6] });
    expect(directionOf(strong)).toBe("increase");
    expect(directionOf(none)).toBe("none");
    const order = rankTrends([untested, none, weak, strong]).map((t) => t.metric.id);
    expect(order[order.length - 1]).toBe("soil");
    expect(order[0]).toBe("rain");
  });

  it("reads a comparison's direction from its label", () => {
    const compare = { calendarMonths: ALL.calendarMonths, compare: { baseline: [2001, 2005] as [number, number], recent: [2016, 2020] as [number, number] } };
    expect(directionOf(metricTrend(METRIC_BY_ID.ndvi, monthly(2001, 2020, -0.01), compare))).toBe("decline");
    expect(directionOf(metricTrend(METRIC_BY_ID.ndvi, monthly(2001, 2020, 0.01), compare))).toBe("increase");
  });
});

describe("what a reader should know about a measure", () => {
  const points = (capped: number) => [{ month: "2010-01", value: 1, capped }, { month: "2010-02", value: 1, capped }, { month: "2010-03", value: null, capped: 1 }];

  it("says where the record starts and stops", () => {
    const notes = metricNotes(resultWith({ satellite: { waterStorage: seriesOf("waterStorage", points(0)) } }), METRIC_BY_ID.waterStorage);
    expect(notes.join(" ")).toContain("ends in July 2022");
    expect(metricNotes(resultWith({ start: "2000-03" }), METRIC_BY_ID.waterStorage).join(" ")).toContain("starts in April 2002");
    expect(metricNotes(resultWith({ start: "2005-01", end: "2010-12" }), METRIC_BY_ID.waterStorage).join(" ")).not.toMatch(/ends in|starts in/);
  });

  it("warns when readings sit at the end of NASA's colour scale", () => {
    const result = resultWith({ satellite: { waterStorage: seriesOf("waterStorage", points(0.4)) } });
    // Months with no reading don't count towards the share.
    expect(cappedShareOf(result, "waterStorage")).toBeCloseTo(0.4, 6);
    expect(metricNotes(result, METRIC_BY_ID.waterStorage).join(" ")).toMatch(/40% of the readings sit at the end of NASA's colour scale/);
    expect(metricNotes(resultWith({ satellite: { waterStorage: seriesOf("waterStorage", points(0.01)) } }), METRIC_BY_ID.waterStorage).join(" ")).not.toMatch(/colour scale/);
    expect(cappedShareOf(result, "climate")).toBe(0);
  });

  it("counts months covering under half the area", () => {
    const result = resultWith({ satellite: { vegetation: seriesOf("vegetation", [{ month: "2010-01", value: 0.3, coverage: 0.2 }, { month: "2010-02", value: 0.3 }]) } });
    expect(metricNotes(result, METRIC_BY_ID.ndvi).join(" ")).toContain("1 month cover less than half") ;
  });
});

describe("measures that gave no readings", () => {
  it("explains a sea measure over land, a failed request, and no snow to test", () => {
    const missing = missingDatasets(
      resultWith({
        satellite: {
          salinity: seriesOf("salinity", [{ month: "2020-01", value: null }], "empty"),
          vegetation: { ...seriesOf("vegetation", [], "error"), error: "timeout" },
          snowfall: seriesOf("snowfall", [{ month: "2020-01", value: 0 }]),
        },
        climate: { status: "error", error: "busy", points: [], samplePoints: [] },
      }),
    );
    const reason = (id: string) => missing.find((m) => m.dataset === id)?.reason;
    expect(reason("salinity")).toMatch(/no sea/);
    expect(reason("vegetation")).toMatch(/timeout/);
    expect(reason("snowfall")).toMatch(/Almost none/);
    expect(reason("climate")).toMatch(/busy/);
  });

  it("stays quiet when readings arrived", () => {
    expect(missingDatasets(resultWith({ satellite: { vegetation: seriesOf("vegetation", [{ month: "2020-01", value: 0.3 }]) } }))).toEqual([]);
  });
});

describe("records that start late", () => {
  it("doesn't offer a longer test when the period already covers the whole record", () => {
    const trend = metricTrend(METRIC_BY_ID.salinity, monthly(2016, 2025, 0, 0.5), ALL);
    expect(trend.verdict?.direction).toBe("none");
    expect(trend.hint).toBeNull();
  });
});
