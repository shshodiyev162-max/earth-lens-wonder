import { beforeEach, describe, expect, it, vi } from "vitest";
import { climatePointCount, climatePoints, countClimateRequests, countMaps, runAnalysis } from "../run";
import { bboxOf, circlePolygon } from "../../geo/geometry";
import type { AnalysisRequest, AnalysisResult } from "../types";

const sampleArea = vi.fn();

vi.mock("../../gibs/sample", async (original) => ({ ...((await original()) as object), sampleArea: (options: { layer: { id: string }; date: string }) => sampleArea(options) }));
vi.mock("../../cache/store", async (original) => ({ ...((await original()) as object), cachedValue: (_key: string, _ttl: number, load: () => Promise<unknown>) => load() }));
vi.mock("../../gibs/time", async (original) => ({ ...((await original()) as object), fetchTimeDomain: vi.fn().mockResolvedValue(null) }));

let powerGate: Promise<void> = Promise.resolve();
vi.mock("../power", async (original) => ({
  ...((await original()) as object),
  fetchPowerMonthly: async () => {
    await powerGate;
    return { T2M: { "2020-01": 5, "2020-02": 6 }, T2M_MAX: {}, T2M_MIN: {}, PRECTOTCORR: {}, ALLSKY_SFC_SW_DWN: {}, RH2M: { "2020-01": 40 }, WS2M: { "2020-01": 3 }, GWETROOT: {} };
  },
  fetchPowerClimatology: async () => ({ T2M: Array(12).fill(4) }),
}));

const geometry = circlePolygon([40, 60], 10);
const STATS = { mean: 0.4, median: 0.4, min: 0.3, max: 0.5, p10: 0.3, p90: 0.5, std: 0.05, count: 10, total: 10, coverage: 1, capped: 0.2 };

function request(datasets: AnalysisRequest["datasets"], lat = 40): AnalysisRequest {
  // Each test its own place, so the request caches shared across a session don't answer for another test.
  const shape = circlePolygon([lat, 60], 10);
  return {
    target: { name: "Here", geometry: shape, bbox: bboxOf(shape), center: [lat, 60], areaKm2: 314, kind: "point", ref: { type: "point", lat, lon: 60, radiusKm: 10 } },
    start: "2020-01",
    end: "2020-02",
    datasets,
  };
}

describe("reading an analysis", () => {
  beforeEach(() => {
    sampleArea.mockReset();
    sampleArea.mockResolvedValue(STATS);
    powerGate = Promise.resolve();
  });

  it("reads satellite datasets one after another, so finished ones can show first", async () => {
    const seen: string[] = [];
    sampleArea.mockImplementation(async ({ layer }: { layer: { id: string } }) => {
      seen.push(layer.id);
      return STATS;
    });
    const partials: AnalysisResult[] = [];
    await runAnalysis(request(["vegetation", "surfaceHeat"], 41), { onPartial: (partial) => partials.push(partial) });
    expect(seen).toEqual(["MODIS_Terra_L3_NDVI_Monthly", "MODIS_Terra_L3_NDVI_Monthly", "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day", "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day"]);
    expect(partials.map((p) => Object.keys(p.satellite))).toEqual([["vegetation"], ["vegetation", "surfaceHeat"]]);
  });

  it("shows climate as soon as it arrives, without waiting for the maps, and the maps without waiting for climate", async () => {
    let openPower = () => {};
    powerGate = new Promise((resolve) => (openPower = resolve));
    const partials: AnalysisResult[] = [];
    const run = runAnalysis(request(["vegetation", "climate"], 42), { onPartial: (partial) => partials.push(partial) });
    await vi.waitFor(() => expect(partials).toHaveLength(1));
    expect(partials[0].satellite.vegetation).toBeTruthy();
    expect(partials[0].climate).toBeUndefined();
    openPower();
    const result = await run;
    expect(partials[1].climate?.status).toBe("ok");
    expect(result.climate?.points[0].temp).toBe(5);
    expect(result.climate?.points[0].humidity).toBe(40);
    expect(result.satellite.vegetation?.points[0].capped).toBe(0.2);
  });

  it("counts progress per dataset", async () => {
    const progress: Record<string, { done: number; total: number }>[] = [];
    await runAnalysis(request(["vegetation", "surfaceHeat"], 43), { onProgress: (p) => p.datasets && progress.push({ ...p.datasets } as never) });
    expect(progress[0]).toEqual({ vegetation: { done: 0, total: 2 }, surfaceHeat: { done: 0, total: 2 } });
    expect(progress[progress.length - 1]).toEqual({ vegetation: { done: 2, total: 2 }, surfaceHeat: { done: 2, total: 2 } });
    // The maps of the first dataset are all counted before the second starts.
    const firstHeat = progress.findIndex((p) => p.surfaceHeat.done > 0);
    expect(progress[firstHeat].vegetation.done).toBe(2);
  });

  it("treats snow-free ground as no snow, for snow water as for snow cover", async () => {
    sampleArea.mockResolvedValue({ ...STATS, mean: 20, count: 5, total: 10, coverage: 0.5 });
    const result = await runAnalysis(request(["snow", "snowWater", "dust"], 44));
    expect(result.satellite.snowWater?.points[0]).toMatchObject({ value: 10, coverage: 1 });
    expect(result.satellite.snow?.points[0]).toMatchObject({ value: 10, coverage: 1 });
    expect(result.satellite.dust?.points[0]).toMatchObject({ value: 20, coverage: 0.5 });
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    sampleArea.mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(runAnalysis(request(["vegetation", "climate"], 45), { signal: controller.signal })).rejects.toThrow();
  });

  it("sizes a request by its maps", () => {
    expect(countMaps({ start: "2020-01", end: "2020-12", datasets: ["climate", "vegetation", "dust"] })).toBe(24);
    expect(geometry).toBeTruthy();
  });
});

describe("where climate is read for places added together", () => {
  const part = (key: string, lat: number, lon: number, km: number) => {
    const shape = circlePolygon([lat, lon], km);
    return { key, name: key, geometry: shape, areaKm2: Math.PI * km * km };
  };

  it("puts at least one point in every place, and the rest where the land is", () => {
    const big = part("big", 45, 60, 400);
    const small = part("small", 10, 20, 20);
    const shape = { type: "MultiPolygon" as const, coordinates: [big.geometry, small.geometry].map((g) => (g.type === "Polygon" ? g.coordinates : [])) };
    const target = { geometry: shape, areaKm2: big.areaKm2 + small.areaKm2, parts: [big, small] };
    expect(climatePointCount(target)).toBe(5);
    const points = climatePoints(target);
    expect(points).toHaveLength(5);
    expect(points.filter(([lat]) => lat < 20)).toHaveLength(1);
  });

  it("reads one point per place for many small places, up to eight", () => {
    const parts = Array.from({ length: 10 }, (_, i) => part(`p${i}`, 30, i * 5, 5 + i));
    const target = { geometry: parts[0].geometry, areaKm2: parts.reduce((s, p) => s + p.areaKm2, 0), parts };
    expect(climatePointCount(target)).toBe(8);
    // The eight largest places get one each.
    expect(climatePoints(target).map(([, lon]) => Math.round(lon / 5))).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
    expect(countClimateRequests({ datasets: ["climate"], target: { ...target, name: "", bbox: [0, 0, 1, 1], center: [0, 0], kind: "place", ref: { type: "bbox", bbox: [0, 0, 1, 1] } } })).toBe(16);
  });
});
