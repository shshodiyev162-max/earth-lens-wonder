import { describe, expect, it } from "vitest";
import { buildInsights, levelNote, recentConditions } from "../insights";
import { METRIC_BY_ID } from "../metrics";
import { bboxOf, circlePolygon } from "../../geo/geometry";
import { monthRange } from "../../gibs/time";
import type { AnalysisResult, ClimatePoint, SatelliteSeries } from "../types";
import bukhara from "./fixtures/bukhara-real.json";

const geometry = circlePolygon([39.77, 64.42], 10);
const months = monthRange("2005-01", "2024-12");

function series(dataset: SatelliteSeries["dataset"], values: (m: string, i: number) => number | null, list = months): SatelliteSeries {
  return {
    dataset,
    layerId: "x",
    label: dataset,
    unit: "",
    decimals: 2,
    source: "test",
    latestAvailable: list[list.length - 1],
    status: "ok",
    points: list.map((month, i) => ({ month, value: values(month, i), p10: null, p90: null, coverage: 0.9 })),
  };
}

/** Wobbles from year to year with no direction. */
const steady = (m: string) => 0.4 + (Number(m.slice(0, 4)) % 3) * 0.01;

function climate(tempOffset: number, rainFactor: number, list = months): ClimatePoint[] {
  return list.map((month) => ({
    month,
    temp: 20 + tempOffset,
    tempMax: 28 + tempOffset,
    tempMin: 12 + tempOffset,
    tempNormal: 20,
    tempAnomaly: tempOffset,
    precip: 30 * rainFactor,
    precipNormal: 30,
    solar: 5.5,
    solarNormal: 5.5,
    humidity: 40,
    wind: 3,
    soil: 40,
    soilNormal: 42,
  }));
}

function result(overrides: Partial<AnalysisResult>): AnalysisResult {
  return {
    target: { name: "Testville", geometry, bbox: bboxOf(geometry), center: [39.77, 64.42], areaKm2: 314, kind: "point", ref: { type: "point", lat: 39.77, lon: 64.42, radiusKm: 10 } },
    start: months[0],
    end: months[months.length - 1],
    datasets: ["vegetation", "climate", "air"],
    months,
    generatedAt: "2026-10-02T00:00:00Z",
    satellite: {},
    ...overrides,
  };
}

const year = (m: string) => Number(m.slice(0, 4));

describe("the answer comes from the trend tests alone", () => {
  it("says so when no measure shows a trend", () => {
    const report = buildInsights(result({ satellite: { vegetation: series("vegetation", steady), air: series("air", steady) } }));
    expect(report.headline).toBe("No clear trend in any of the 2 measures tested.");
    expect(report.counts).toMatchObject({ rising: 0, falling: 0, steady: 2 });
    expect(report.summary).toMatch(/Mann–Kendall/);
    expect(report.summary).toMatch(/doesn't prove nothing changed/);
    expect(report.findings).toEqual([]);
  });

  it("names what rose and what fell, and how many measures didn't change", () => {
    const report = buildInsights(
      result({
        satellite: {
          vegetation: series("vegetation", (m) => 0.6 - (year(m) - 2005) * 0.01),
          surfaceHeat: series("surfaceHeat", (m) => 30 + (year(m) - 2005) * 0.1),
          air: series("air", steady),
        },
      }),
    );
    expect(report.headline).toBe("Daytime ground heat is rising, and plant greenness is falling. The other measure shows no clear trend.");
    expect(report.counts).toMatchObject({ rising: 1, falling: 1, steady: 1 });
    expect(report.findings.map((f) => f.id)).toEqual(expect.arrayContaining(["trend-ndvi", "trend-lst"]));
    expect(report.findings.find((f) => f.id === "trend-ndvi")?.tone).toBe("warning");
    expect(report.findings.find((f) => f.id === "trend-lst")?.tone).toBe("warning");
  });

  it("isn't moved by a hot summer, a dry spell or one bad month", () => {
    // Extreme levels with no change from year to year: the old report called this "extreme surface heat".
    const report = buildInsights(
      result({
        satellite: {
          surfaceHeat: series("surfaceHeat", (m) => (m.endsWith("-07") ? 52 : 30) + (year(m) % 3) * 0.1),
          vegetation: series("vegetation", (m) => (m === "2024-12" ? 0.05 : steady(m))),
        },
        climate: { status: "ok", points: climate(2.5, 0.3), samplePoints: [[39.77, 64.42]] },
      }),
    );
    expect(report.headline).not.toMatch(/extreme|drier|warmer|greener/i);
    expect(report.headline).toMatch(/No clear trend/);
    // The same dry, warm months are still reported, for what they are.
    expect(report.recent?.figures.find((f) => f.id === "temp")?.value).toBe("+2.5 °C");
    expect(report.recent?.figures.find((f) => f.id === "rain")?.value).toBe("30%");
  });

  it("says when there are too few years to test", () => {
    const short = monthRange("2024-01", "2024-12");
    const report = buildInsights(result({ start: short[0], end: short[11], months: short, satellite: { vegetation: series("vegetation", () => 0.4, short) } }));
    expect(report.headline).toBe("Too few years to test for a trend.");
    expect(report.counts.untested).toBe(1);
  });

  it("speaks of a difference when two periods are compared", () => {
    const report = buildInsights(
      result({
        period: { calendarMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], compare: { baseline: [2005, 2010], recent: [2019, 2024] } },
        satellite: { vegetation: series("vegetation", (m) => 0.6 - (year(m) - 2005) * 0.01), air: series("air", steady) },
      }),
    );
    expect(report.headline).toBe("Plant greenness is lower. The other measure shows no clear difference.");
    expect(report.summary).toMatch(/t-test/);
    expect(report.findings[0].id).toBe("compare-ndvi");
    expect(report.findings[0].detail).toMatch(/Welch's t-test/);
  });

  it("warns about testing many measures at once when a result is borderline", () => {
    // A rise that just passes the test, among five measures.
    const noisy = [1.2, 1, 4, 1.5, 5, 9, 2, 6, 5.5, 3.5, 8, 9.5, 7, 9.3, 7.1, 8.4, 6.2, 4.3, 3.2, 8.3];
    const report = buildInsights(
      result({
        satellite: {
          vegetation: series("vegetation", (m) => 0.3 + noisy[year(m) - 2005] * 0.01),
          air: series("air", steady),
          so2: series("so2", steady),
          co: series("co", steady),
          upperAir: series("upperAir", steady),
          ozone: series("ozone", steady),
        },
      }),
    );
    expect(report.counts.rising).toBe(1);
    expect(report.summary).toMatch(/about 1 test in 20 can look real by chance/);
  });
});

describe("reading a real NASA response", () => {
  it("is sensible for two years of Bukhara", () => {
    // Captured from NASA GIBS + NASA POWER by the app's own analysis engine on 2 Oct 2026.
    const report = buildInsights(bukhara as unknown as AnalysisResult);
    const text = report.findings.map((f) => `${f.title} ${f.detail}`).join("\n");
    expect(text).not.toMatch(/per decade/); // two years of data are not extrapolated to a decade
    expect(report.caveats.join(" ")).toMatch(/Sunshine data runs to May 2026/);
    expect(report.caveats.join(" ")).toMatch(/NASA has published data up to June 2026/);
    expect(report.recent?.months).toBe(12);
    expect(report.recent?.to).toBe("2026-08");
  });
});

describe("recent conditions", () => {
  it("compares the latest twelve months with the normal for those months, not a whole period's total", () => {
    const list = monthRange("2015-01", "2024-12");
    const recent = recentConditions(climate(1.2, 0.5, list));
    expect(recent).toMatchObject({ from: "2024-01", to: "2024-12", months: 12 });
    expect(recent?.figures.find((f) => f.id === "rain")).toMatchObject({ value: "50%", note: "of normal (180 mm vs 360 mm)" });
    expect(recent?.figures.find((f) => f.id === "temp")).toMatchObject({ value: "+1.2 °C", note: "warmer than normal" });
    expect(recent?.figures.find((f) => f.id === "soil")).toMatchObject({ value: "−2 points", note: "drier than normal" });
    expect(recent?.figures.find((f) => f.id === "solar")).toMatchObject({ value: "100%", note: "of normal" });
  });

  it("leaves out what has no normal, and returns nothing without readings", () => {
    const points = climate(0, 1, monthRange("2024-01", "2024-06")).map((p) => ({ ...p, solar: null, solarNormal: null }));
    expect(recentConditions(points)?.figures.map((f) => f.id)).toEqual(["temp", "rain", "soil"]);
    expect(recentConditions(points)?.months).toBe(6);
    expect(recentConditions([])).toBeNull();
  });
});

describe("level notes", () => {
  it("gives a typical value and the months of the extremes", () => {
    const values = [
      { month: "2024-01", value: 0.1 },
      { month: "2024-07", value: 0.3 },
      { month: "2024-08", value: null },
    ];
    expect(levelNote(METRIC_BY_ID.ndvi, values)).toBe("Typical month: 0.20 (moderate vegetation such as grassland, shrubs or crops). Highest 0.30 in July 2024, lowest 0.10 in January 2024.");
    expect(levelNote(METRIC_BY_ID.lst, values)).toBe("Typical month: 0.2 °C. Highest 0.3 °C in July 2024, lowest 0.1 °C in January 2024.");
    expect(levelNote(METRIC_BY_ID.ndvi, [{ month: "2024-01", value: null }])).toBeNull();
  });
});
