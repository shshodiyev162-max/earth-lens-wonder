import { describe, expect, it } from "vitest";
import { buildInsights } from "../insights";
import { bboxOf, circlePolygon } from "../../geo/geometry";
import { monthRange } from "../../gibs/time";
import type { AnalysisResult, ClimatePoint, SatelliteSeries } from "../types";
import bukhara from "./fixtures/bukhara-real.json";

const geometry = circlePolygon([39.77, 64.42], 10);
const months = monthRange("2024-09", "2026-08");

function series(dataset: SatelliteSeries["dataset"], values: (m: string, i: number) => number | null): SatelliteSeries {
  return {
    dataset,
    layerId: "x",
    label: dataset,
    unit: "",
    decimals: 2,
    source: "test",
    latestAvailable: "2026-08",
    status: "ok",
    points: months.map((month, i) => ({ month, value: values(month, i), p10: null, p90: null, coverage: 0.9 })),
  };
}

function climate(tempOffset: number, rainFactor: number): ClimatePoint[] {
  return months.map((month) => ({
    month,
    temp: 20 + tempOffset,
    tempMax: 28 + tempOffset,
    tempMin: 12 + tempOffset,
    tempNormal: 20,
    tempAnomaly: tempOffset,
    precip: 30 * rainFactor,
    precipNormal: 30,
    solar: 5.5,
    solarNormal: 5.4,
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
    generatedAt: "2026-10-02T00:00:00Z",
    satellite: {},
    ...overrides,
  };
}

describe("buildInsights", () => {
  it("reports normal conditions as low concern", () => {
    const report = buildInsights(
      result({
        satellite: { vegetation: series("vegetation", (m) => 0.45 + (m.endsWith("06") ? 0.1 : 0)), air: series("air", () => 0.12) },
        climate: { status: "ok", points: climate(0.1, 1), samplePoints: [[39.77, 64.42]] },
      }),
    );
    expect(report.concern.level).toBe("low");
    expect(report.headline).toBe("Testville: conditions close to normal");
    expect(report.kpis.map((k) => k.id)).toEqual(expect.arrayContaining(["kpi-veg", "kpi-temp", "kpi-rain", "kpi-air"]));
    expect(report.summary).toContain("Testville");
  });

  it("flags heat, drought, haze and vegetation loss", () => {
    const report = buildInsights(
      result({
        satellite: {
          vegetation: series("vegetation", (m) => (m.startsWith("2026") ? 0.2 : 0.4)),
          air: series("air", () => 0.65),
          surfaceHeat: series("surfaceHeat", (m) => (m.endsWith("07") ? 52 : 30)),
        },
        climate: { status: "ok", points: climate(2.3, 0.3), samplePoints: [[39.77, 64.42]] },
      }),
    );
    expect(report.concern.level).toBe("high");
    expect(report.concern.reasons.join(" ")).toMatch(/rainfall/);
    expect(report.concern.reasons.join(" ")).toMatch(/above the 2001–2020 normal/);
    expect(report.findings[0].tone).toBe("critical");
    expect(report.headline).toMatch(/warmer than normal/);
    expect(report.headline).toMatch(/drier than normal/);
  });

  it("reads a real NASA response sensibly (Bukhara, Sep 2024 – Aug 2026)", () => {
    // Captured from NASA GIBS + NASA POWER by the app's own analysis engine on 2 Oct 2026.
    const report = buildInsights(bukhara as unknown as AnalysisResult);
    expect(report.headline).toBe("Bukhara: 1.2 °C warmer than normal");
    expect(report.concern.level).toBe("moderate");
    const kpi = Object.fromEntries(report.kpis.map((k) => [k.id, k.value]));
    expect(kpi).toMatchObject({ "kpi-veg": "0.38", "kpi-temp": "+1.2 °C", "kpi-rain": "122%", "kpi-air": "0.27", "kpi-snow": "24%" });
    const text = report.findings.map((f) => `${f.title} ${f.detail}`).join("\n");
    expect(text).toContain("Peak air temperature: 49.1 °C in July 2026");
    expect(text).not.toMatch(/per decade/); // two years of data are not extrapolated to a decade
    expect(report.caveats.join(" ")).toMatch(/Sunshine data runs to May 2026/);
    expect(report.caveats.join(" ")).toMatch(/Aerosols & dust: NASA has published data up to June 2026/);
  });

  it("skips months with too little coverage", () => {
    const veg = series("vegetation", () => 0.5);
    veg.points = veg.points.map((p, i) => (i === veg.points.length - 1 ? { ...p, value: 0.05, coverage: 0.02 } : p));
    const report = buildInsights(result({ satellite: { vegetation: veg } }));
    expect(report.kpis.find((k) => k.id === "kpi-veg")?.value).toBe("0.50");
  });
});
