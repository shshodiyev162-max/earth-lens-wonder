import { describe, expect, it, vi } from "vitest";
import { runScan, ScanError, type ScanLoaders } from "../scan";
import { scanGrid, decodeGrid } from "../grid";
import { AreaError, matchCountry, resolveArea, widen, type ScanArea } from "../place";
import { planPeriod, type PeriodPlan } from "../../query/period";
import { buildCountryIndex, type CountryCollection } from "../../geo/countries";
import { bboxPolygon, polygonsOf, type PolygonGeometry } from "../../geo/geometry";
import { decodeGeometry, encodeGeometry } from "../../geo/polyline";
import type { PlaceResult } from "../../geo/geocode";
import type { GibsLayer } from "../../gibs/catalog";
import type { ParsedColorMap } from "../../gibs/colormap";

const GROWING = [4, 5, 6, 7, 8, 9];

function plan(): PeriodPlan {
  const result = planPeriod({ kind: "since", start: 2015 }, GROWING, { earliest: "2000-03", latest: "2026-08" });
  if ("error" in result) throw new Error(result.error);
  return result;
}

const AREA: ScanArea = { name: "Test area", geometry: bboxPolygon([60, 40, 62, 42]), bbox: [60, 40, 62, 42], center: [41, 61], kind: "place" };

/** 20×20 grid: NDVI 0.5 with a little wobble; a 5×5 block loses 0.02 per year; column 0 is a lake. */
function loaders(fail?: (month: string) => boolean): ScanLoaders {
  return {
    monthGrid: async (_layer, grid, month) => {
      if (fail?.(month)) throw new Error("NASA GIBS returned 503");
      const year = Number(month.slice(0, 4));
      const values = new Float32Array(grid.width * grid.height);
      for (let i = 0; i < values.length; i++) {
        const row = Math.floor(i / grid.width);
        const col = i % grid.width;
        values[i] = row >= 5 && row <= 9 && col >= 5 && col <= 9 ? 0.6 - 0.02 * (year - 2015) : 0.5 + ((i + year) % 3) * 0.002;
      }
      return values;
    },
    landMask: async (grid) => {
      const mask = new Uint8Array(grid.width * grid.height).fill(1);
      for (let r = 0; r < grid.height; r++) mask[r * grid.width] = 0;
      return mask;
    },
  };
}

describe("runScan", () => {
  it("finds the declining block, measures it and tests its trend", async () => {
    const progress = vi.fn();
    const result = await runScan({
      indicator: "vegetation",
      direction: "decline",
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      loaders: loaders(),
      maxSize: 20,
      onProgress: progress,
    });
    expect(result.grid).toMatchObject({ width: 20, height: 20 });
    expect(result.hotspots).toHaveLength(1);
    const [top] = result.hotspots;
    expect(top.pixels).toHaveLength(25);
    expect(top.meanChange).toBeCloseTo(-0.16, 4);
    expect(top.verdict?.label).toBe("Significant decline");
    expect(top.verdict?.slopePerYear).toBeCloseTo(-0.02, 6);
    expect(top.series).toHaveLength(11);
    expect(top.areaKm2).toBeGreaterThan(0);
    // The lake column is left out of the scan.
    expect(result.mask[0]).toBe(0);
    expect(Number.isNaN(result.trends.change[0])).toBe(true);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: "done" }));
    expect(result.yearGrids).toHaveLength(11);
    expect(result.monthGrids.size).toBe(66);
  });

  it("skips a few failed months but gives up when NASA mostly fails", async () => {
    const base = {
      indicator: "vegetation" as const,
      direction: "decline" as const,
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      maxSize: 20,
    };
    const some = await runScan({ ...base, loaders: loaders((m) => m.endsWith("-04")) });
    expect(some.failedMonths).toHaveLength(11);
    expect(some.hotspots).toHaveLength(1);
    await expect(runScan({ ...base, loaders: loaders((m) => !m.endsWith("-09")) })).rejects.toBeInstanceOf(ScanError);
  });

  it("reports months missing from NASA's record", async () => {
    const available = new Set(["2015-04", "2015-05"]);
    const result = runScan({
      indicator: "vegetation",
      direction: "decline",
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available },
      loaders: loaders(),
      maxSize: 20,
    });
    await expect(result).rejects.toThrow(ScanError);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const slow: ScanLoaders = {
      ...loaders(),
      monthGrid: (_layer: GibsLayer, _grid, _month, signal) => (signal?.aborted ? Promise.reject(new DOMException("Aborted", "AbortError")) : loaders().monthGrid(_layer, _grid, _month, signal)),
    };
    await expect(
      runScan({ indicator: "vegetation", direction: "decline", area: AREA, plan: plan(), availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null }, loaders: slow, maxSize: 20, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("scanGrid and decoding", () => {
  it("never scans finer than the product or larger than the cap", () => {
    expect(scanGrid([56, 37, 73, 46], 200, 0.01)).toMatchObject({ width: 200, height: 106 });
    expect(scanGrid([56, 37, 73, 46], 200, 0.5)).toMatchObject({ width: 34, height: 18 });
  });

  it("reads snow-free (transparent) pixels as 0 % snow", () => {
    const colormap = { lookup: new Map(), dataEntries: [] } as unknown as ParsedColorMap;
    const rgba = new Uint8ClampedArray([0, 0, 0, 0]);
    const snow = { id: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct" } as GibsLayer;
    const ndvi = { id: "MODIS_Terra_L3_NDVI_Monthly" } as GibsLayer;
    expect(decodeGrid(rgba, colormap, snow, 1)[0]).toBe(0);
    expect(decodeGrid(rgba, colormap, ndvi, 1)[0]).toBeNaN();
  });
});

describe("share-link polygons", () => {
  it("round-trip polygons with holes and multipolygons", () => {
    const geometry: PolygonGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [60, 40],
            [61, 40],
            [61, 41],
            [60, 41],
            [60, 40],
          ],
          [
            [60.2, 40.2],
            [60.2, 40.8],
            [60.8, 40.8],
            [60.2, 40.2],
          ],
        ],
        [
          [
            [-70.1234, -12.5],
            [-70, -12.5],
            [-70, -12.4],
            [-70.1234, -12.5],
          ],
        ],
      ],
    };
    const text = encodeGeometry(geometry);
    expect(text).not.toMatch(/[^\x3f-\x7e,;]/);
    expect(decodeGeometry(text)).toEqual(geometry);
  });

  it("rejects text that isn't a polygon", () => {
    expect(decodeGeometry("not a polygon!")).toBeNull();
    expect(decodeGeometry("")).toBeNull();
  });
});

describe("resolveArea", () => {
  const square = (w: number, s: number, e: number, n: number) => [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
  const collection: CountryCollection = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { id: "UZB", name: "Uzbekistan" }, geometry: { type: "Polygon", coordinates: [square(56, 37, 73, 46)] } },
      { type: "Feature", properties: { id: "KAZ", name: "Kazakhstan" }, geometry: { type: "Polygon", coordinates: [square(46, 40, 87, 55)] } },
      { type: "Feature", properties: { id: "USA", name: "United States of America" }, geometry: { type: "Polygon", coordinates: [square(-125, 25, -67, 49)] } },
    ],
  };
  const countries = buildCountryIndex(collection);
  const place = (overrides: Partial<PlaceResult>): PlaceResult => ({ id: "R1", name: "Bukhara Region", context: "Uzbekistan", kind: "state", center: [40, 63], osm: { type: "R", id: 1 }, source: "nominatim", ...overrides });

  it("uses the bundled outline for countries, by name, alias or code", async () => {
    expect((await resolveArea("Uzbekistan", { countries })).kind).toBe("country");
    expect(matchCountry(countries, "USA")?.id).toBe("USA");
    expect(matchCountry(countries, "the United States")?.id).toBe("USA");
    expect(matchCountry(countries, "uzb")?.name).toBe("Uzbekistan");
  });

  it("knows named regions", async () => {
    const central = await resolveArea("Central Asia", { countries });
    expect(central).toMatchObject({ name: "Central Asia", kind: "region" });
    expect(polygonsOf(central.geometry)).toHaveLength(2);
    expect((await resolveArea("the Pamirs", { countries })).bbox).toEqual([70.5, 36.6, 75.4, 39.7]);
  });

  it("geocodes other places and uses their boundary", async () => {
    const boundary = vi.fn(async () => bboxPolygon([62, 39, 65, 41]));
    const found = await resolveArea("Bukhara region", { countries, search: async () => [place({})], boundary });
    expect(found).toMatchObject({ name: "Bukhara Region", kind: "place", bbox: [62, 39, 65, 41] });
    expect(boundary).toHaveBeenCalled();
  });

  it("prefers administrative areas over buildings and small places", async () => {
    const results = [
      place({ id: "W1", name: "Bukhara-Ural Gas Compressor Station", kind: "locality", osm: { type: "W", id: 1 } }),
      place({ id: "N2", name: "Regional Oncology Center", kind: "poi", osm: { type: "N", id: 2 } }),
      place({ id: "R3", name: "Buxoro Viloyati", kind: "state", osm: { type: "R", id: 3 } }),
    ];
    const found = await resolveArea("Bukhara region", { countries, search: async () => results, boundary: async () => bboxPolygon([62, 39, 65, 41]) });
    expect(found.name).toBe("Buxoro Viloyati");
  });

  it("widens the area for 'near'", async () => {
    const aral = await resolveArea("Aral Sea", { countries, near: true });
    expect(aral.name).toBe("Around Aral Sea");
    expect(aral.bbox[0]).toBeLessThan(57.8);
    expect(widen(aral).bbox[0]).toBeLessThan(aral.bbox[0]);
  });

  it("falls back to the map view, and explains when nothing is found", async () => {
    expect(await resolveArea(null, { view: [60, 40, 62, 42] })).toMatchObject({ kind: "view", name: "Map view" });
    await expect(resolveArea("Nowhereland", { countries, search: async () => [] })).rejects.toBeInstanceOf(AreaError);
  });
});
