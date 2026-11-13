import { describe, expect, it, vi } from "vitest";
import { cappedShare, flooredShare, rebuildHotspots, runScan, ScanError, summarizeArea, WrongPlaceError, type ScanLoaders } from "../scan";
import { scanGrid, decodeGrid } from "../grid";
import { AreaError, matchCountry, resolveArea, widen, type ScanArea } from "../place";
import { planPeriod, type PeriodPlan } from "../../query/period";
import { buildCountryIndex, type CountryCollection } from "../../geo/countries";
import { areaKm2, bboxPolygon, polygonsOf, type PolygonGeometry } from "../../geo/geometry";
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
    // Column 0 is a lake: left out for land measures, the only pixels kept for sea measures.
    surfaceMask: async (grid, surface) => {
      const mask = new Uint8Array(grid.width * grid.height).fill(surface === "water" ? 0 : 1);
      if (surface !== "any") for (let r = 0; r < grid.height; r++) mask[r * grid.width] = surface === "water" ? 1 : 0;
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
    expect(result.monthsRead).toHaveLength(66);
  });

  it("reads sea measures on water only and air measures everywhere", async () => {
    const base = { direction: "any" as const, area: AREA, plan: plan(), availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null }, loaders: loaders(), maxSize: 20 };
    const sea = await runScan({ ...base, indicator: "sst" });
    expect(sea.mask[0]).toBe(1);
    expect(sea.mask[5 * 20 + 5]).toBe(0);
    expect(sea.hotspots).toHaveLength(0);
    const air = await runScan({ ...base, indicator: "so2" });
    expect(air.mask[0]).toBe(1);
    expect(air.mask.every((v) => v === 1)).toBe(true);
  });

  it("reads air measures over the water only when the area is a named sea", async () => {
    const base = { direction: "any" as const, plan: plan(), availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null }, loaders: loaders(), maxSize: 20 };
    const sea = await runScan({ ...base, indicator: "airTemp", area: { ...AREA, water: "sea" } });
    expect(sea.surface).toBe("water");
    expect(sea.mask[0]).toBe(1);
    expect(sea.mask[5]).toBe(0);
    expect(sea.notes.join(" ")).toMatch(/read over the water only/);
    const land = await runScan({ ...base, indicator: "airTemp", area: AREA });
    expect(land.surface).toBe("any");
  });

  it("explains a measure that can't be read in the place, before reading any map", async () => {
    const base = { direction: "any" as const, plan: plan(), availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null }, maxSize: 20 };
    const monthGrid = vi.fn(loaders().monthGrid);
    // Vegetation over the open ocean.
    await expect(runScan({ ...base, loaders: { ...loaders(), monthGrid }, indicator: "vegetation", area: { ...AREA, name: "North Atlantic", water: "ocean" } })).rejects.toThrow(
      /measured on land, but the North Atlantic is water/,
    );
    // Sea temperature where there is no water at all.
    const dry: ScanLoaders = { ...loaders(), monthGrid, surfaceMask: async (grid, surface) => new Uint8Array(grid.width * grid.height).fill(surface === "water" ? 0 : 1) };
    await expect(runScan({ ...base, loaders: dry, indicator: "sst", area: AREA })).rejects.toThrow(/no sea or large lake in Test area/);
    await expect(runScan({ ...base, loaders: dry, indicator: "sst", area: AREA })).rejects.toBeInstanceOf(WrongPlaceError);
    expect(monthGrid).not.toHaveBeenCalled();
  });

  it("warns when many readings sit at the top of NASA's colour scale", async () => {
    const result = await runScan({
      indicator: "vegetation",
      direction: "decline",
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      loaders: { ...loaders(), scaleTop: async () => 0.5 },
      maxSize: 20,
    });
    expect(result.notes.join(" ")).toMatch(/\d+% of the readings were at the top of NASA's colour scale \(0\.500 NDVI or more\)/);
    const quiet = await runScan({
      indicator: "vegetation",
      direction: "decline",
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      loaders: { ...loaders(), scaleTop: async () => 0.9 },
      maxSize: 20,
    });
    expect(quiet.notes.join(" ")).not.toMatch(/colour scale/);
  });

  it("warns when many readings sit at the bottom of NASA's colour scale", async () => {
    const result = await runScan({
      indicator: "vegetation",
      direction: "decline",
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      loaders: { ...loaders(), scaleBottom: async () => 0.9 },
      maxSize: 20,
    });
    expect(result.notes.join(" ")).toMatch(/\d+% of the readings were at the bottom of NASA's colour scale \(0\.900 NDVI or less\)/);
  });

  it("counts readings at the bottom of the scale inside the mask only", () => {
    const grid = new Float32Array([-30, -30, 5, -30, NaN]);
    expect(flooredShare([grid], new Uint8Array([1, 1, 1, 0, 1]), -30)).toBeCloseTo(2 / 3, 6);
  });

  it("counts readings at the top of the scale inside the mask only", () => {
    const grid = new Float32Array([1, 2, 5, 5, Number.NaN]);
    expect(cappedShare([grid], new Uint8Array([1, 1, 1, 0, 1]), 5)).toBeCloseTo(1 / 3, 6);
  });

  it("rebuilds hotspots for other filters without reading any map again", async () => {
    const load = loaders();
    const monthGrid = vi.fn(load.monthGrid);
    const result = await runScan({
      indicator: "vegetation",
      filter: { direction: "decline", minFactor: 1, minAreaKm2: 0, strict: false },
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      loaders: { ...load, monthGrid },
      maxSize: 20,
    });
    const reads = monthGrid.mock.calls.length;
    expect(rebuildHotspots(result, result.filter)).toBe(result.hotspots);
    expect(rebuildHotspots(result, { ...result.filter, direction: "increase" })).toHaveLength(0);
    const both = rebuildHotspots(result, { ...result.filter, direction: "any" });
    expect(both.map((h) => h.id)).toEqual(result.hotspots.map((h) => h.id));
    expect(both[0].verdict?.label).toBe("Significant decline");
    expect(rebuildHotspots(result, { ...result.filter, minFactor: 10 })).toHaveLength(0);
    expect(monthGrid.mock.calls.length).toBe(reads);
  });

  it("sums up the whole area: averages, change and the land that fell or rose", async () => {
    const result = await runScan({
      indicator: "vegetation",
      direction: "decline",
      area: AREA,
      plan: plan(),
      availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null },
      loaders: loaders(),
      maxSize: 20,
    });
    const filter = { direction: "decline" as const, minFactor: 1, minAreaKm2: 0, strict: false };
    const summary = summarizeArea(result, filter);
    // 19 of 20 columns are land (one is a lake), all measured.
    expect(summary.measuredKm2).toBeCloseTo(summary.scannedKm2, 6);
    // Only the 25-pixel block fell; nothing rose.
    expect(summary.declinedKm2).toBeCloseTo(result.hotspots[0].areaKm2, 3);
    expect(summary.increasedKm2).toBe(0);
    expect(summary.change as number).toBeLessThan(0);
    expect((summary.baselineMean as number) - (summary.recentMean as number)).toBeCloseTo(-(summary.change as number), 9);
    // A stricter smallest change leaves less land counted.
    expect(summarizeArea(result, { ...filter, minFactor: 10 }).declinedKm2).toBe(0);
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

  it("takes the place named what was typed: the city, not its province", async () => {
    // Nominatim's real answers for "Samarkand" and "Bukhara" (November 2026).
    const boundary = async () => bboxPolygon([66.8, 39.6, 67.1, 39.7]);
    const samarkand = [place({ id: "R15589846", name: "Samarkand City", kind: "city", osm: { type: "R", id: 15589846 } }), place({ id: "R196249", name: "Samarqand Region", kind: "state", osm: { type: "R", id: 196249 } })];
    expect((await resolveArea("Samarkand", { countries, search: async () => samarkand, boundary })).name).toBe("Samarkand City");
    const bukhara = [place({ id: "R1670973", name: "Bukhara Region", kind: "state" }), place({ id: "R13070474", name: "Bukhara", kind: "city", osm: { type: "R", id: 13070474 } })];
    expect((await resolveArea("Bukhara", { countries, search: async () => bukhara, boundary })).name).toBe("Bukhara");
  });

  it("reads a circle around a place known only as a point, not its tiny box", async () => {
    const point = place({ id: "N1", name: "Muynoq", kind: "city", osm: { type: "N", id: 1 }, center: [43.77, 59.02], bbox: [59.0, 43.75, 59.04, 43.79] });
    const found = await resolveArea("Muynoq", { countries, search: async () => [point], boundary: async () => null });
    expect(areaKm2(found.geometry)).toBeGreaterThan(1900);
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

describe("seas and oceans", () => {
  it("know their real extent, since place search returns them as single points", async () => {
    const sea = await resolveArea("the Mediterranean", { countries: null, search: async () => [] });
    expect(sea.name).toBe("Mediterranean Sea");
    // From Gibraltar to the Levant, without the Bay of Biscay or the Black Sea.
    expect(sea.bbox[0]).toBeLessThan(-5);
    expect(sea.bbox[2]).toBeGreaterThan(36);
    expect(sea.bbox[3]).toBeLessThan(46.5);
    expect(sea.water).toBe("sea");
    const black = await resolveArea("Black Sea", { countries: null, search: async () => [] });
    expect(black.bbox).toEqual([27.2, 41.0, 41.9, 47.0]);
  });

  it("come as two halves of the Pacific, which can't be scanned as one area", async () => {
    const west = await resolveArea("the western Pacific", { countries: null, search: async () => [] });
    expect(west).toMatchObject({ name: "Western Pacific", water: "ocean" });
    expect(west.bbox[2]).toBe(180);
    await expect(resolveArea("Pacific Ocean", { countries: null, search: async () => [] })).rejects.toThrow(/180° line/);
  });

  it("are no longer water once widened with 'near'", async () => {
    const around = await resolveArea("Mediterranean", { countries: null, near: true });
    expect(around.name).toBe("Around Mediterranean Sea");
    expect(around.water).toBeUndefined();
  });
});
