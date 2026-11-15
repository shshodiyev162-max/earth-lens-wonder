import { describe, expect, it } from "vitest";
import { AQUA_WATER_LAYER_ID, openWater, openWaterMonth, realSnow, SNOW_LAYER_ID, SURFACE_TEMP_LAYER_ID, unsteadyNote, unsteadyShare, WATER_LAYER_ID, waterInArea, type MonthGridLoader } from "../water";
import { runScan, surfaceFor, type ScanLoaders } from "../scan";
import type { ScanArea } from "../place";
import { planPeriod, type PeriodPlan } from "../../query/period";
import { bboxPolygon } from "../../geo/geometry";
import { INDICATORS, ownMonths, percentChangeMeansSomething, seriesUnit } from "../../query/indicators";
import { explainVerdict, grouped, signed, type TrendVerdict } from "../../analysis/stats";
import { yearlyValues } from "../../analysis/aggregate";
import { METRIC_BY_ID } from "../../analysis/metrics";
import { countMaps } from "../../analysis/run";
import { pixelTrend, seasonAnyGrids, type PixelTrends } from "../pixels";
import { changeImage, changeScale } from "../render";

const f32 = (values: number[]) => Float32Array.from(values);

describe("open water from the vegetation map", () => {
  it("counts a pixel either satellite saw see-through as water, a reading on both as land, and leaves out snow", () => {
    const terra = f32([NaN, 0.3, NaN, NaN, 0.02]);
    // The last pixel: Terra's month kept a hazy, slightly green view of the water; Aqua's saw it clear.
    const aqua = f32([0.01, 0.3, NaN, NaN, NaN]);
    expect([...openWater([terra, aqua], f32([0, 0, 50, 5, 0]))]).toEqual([100, 0, NaN, 100, 100]);
    // Without Aqua's map, Terra's alone; without the snow map, every see-through pixel counts as water.
    expect([...openWater([terra, null], null)]).toEqual([100, 0, 100, 100, 0]);
  });

  it("believes the snow map only where the ground was cold enough for snow", () => {
    // Salt flats and salty shallow water read as snow, even at 30 °C.
    expect([...realSnow(f32([80, 80, 5]), f32([30, -4, 30]))]).toEqual([0, 80, 5]);
    // Without the temperature map, the snow map is taken as it is.
    expect([...realSnow(f32([80]), null)]).toEqual([80]);
  });

  it("counts a pixel as water for a year when any month of its season saw water there", () => {
    const months = new Map([
      ["2020-06", f32([100, 0, NaN, NaN])],
      ["2020-07", f32([0, 0, 100, NaN])],
      ["2020-08", f32([0, 0, NaN, 0])],
    ]);
    // Pixel 2 was read only once of three months: too few to tell.
    expect([...seasonAnyGrids(months, [2020], [6, 7, 8], 4)[0]]).toEqual([100, 0, NaN, NaN]);
  });

  it("measures how much of the water came and went within a season", () => {
    const mask = Uint8Array.from([1, 1, 1, 0]);
    const months = new Map([
      ["2020-06", f32([100, 100, 0, 100])],
      ["2020-07", f32([100, 0, 0, 100])],
      ["2020-08", f32([100, 0, NaN, 100])],
    ]);
    // Pixel 0 is water all season, pixel 1 only in June, pixel 2 never; pixel 3 is outside the area.
    expect(unsteadyShare(months, [["2020-06", "2020-07", "2020-08"]], mask)).toBe(0.5);
    expect(unsteadyNote(0.2)).toBeNull();
    expect(unsteadyNote(0.5)).toMatch(/^50% of the water here was water in only some months.*Treat the water area here as rough/);
  });
});

describe("the open water measure", () => {
  it("is told in km² of water, where every other measure is told in its own unit", () => {
    expect(seriesUnit(INDICATORS.water)).toEqual({ unit: "km²", decimals: 0 });
    expect(seriesUnit(INDICATORS.vegetation)).toEqual({ unit: "NDVI", decimals: 3 });
    // A share's own percent change is meaningless; the km² it adds up to has one.
    expect(percentChangeMeansSomething(INDICATORS.water)).toBe(false);
  });

  it("is read in the clearest months: summer outside the tropics, the dry season inside them", () => {
    expect(ownMonths("water", 45)).toEqual([6, 7, 8]); // the Aral Sea
    expect(ownMonths("water", 13.2)).toEqual([12, 1, 2]); // Lake Chad, after its rains
    expect(ownMonths("water", -6)).toEqual([6, 7, 8]); // Lake Tanganyika, in its dry season
    expect(ownMonths("water", -40)).toEqual([12, 1, 2]); // southern summer
    // Every other measure keeps its own season, flipped south of the equator.
    expect(ownMonths("vegetation", -6)).toEqual([10, 11, 12, 1, 2, 3]);
  });

  it("is read on land and water alike, even for a named sea", () => {
    expect(surfaceFor("water", { water: "sea" })).toBe("any");
    expect(surfaceFor("airTemp", { water: "sea" })).toBe("water");
  });

  it("lets a lake's surface temperature be read where NASA's own map has values (the land/water map has no lakes)", () => {
    expect(surfaceFor("sst", { lake: true })).toBe("any");
    expect(surfaceFor("sst", {})).toBe("water");
    expect(surfaceFor("vegetation", { lake: true })).toBe("land");
  });
});

describe("a shore that dries out", () => {
  it("counts as a change at its pixel, where the carry-over allowance would hide it", () => {
    const years = Float64Array.from({ length: 21 }, (_, i) => 2005 + i);
    // Water every summer until 2014, land from 2015: one step.
    const ys = Float64Array.from(years, (year) => (year < 2015 ? 100 : 0));
    const slopes = new Float64Array(210);
    const sorted = new Float64Array(21);
    expect(pixelTrend(years, ys, 21, slopes, sorted).p).toBeGreaterThan(0.05);
    expect(pixelTrend(years, ys, 21, slopes, sorted, true).p).toBeLessThan(0.001);
  });

  it("is mapped as then vs now, faded where the change isn't clear", () => {
    const trends: PixelTrends = {
      width: 2,
      height: 1,
      baselineMean: f32([100, 100]),
      recentMean: f32([0, 60]),
      change: f32([-100, -40]),
      slope: f32([0, 0]),
      p: f32([0.0001, 0.4]),
      tested: true,
    };
    const scale = changeScale(trends, INDICATORS.water, true);
    expect(scale.mode).toBe("change");
    expect(scale.unit).toBe("% water");
    expect(changeScale(trends, INDICATORS.vegetation, true).mode).toBe("perDecade");
    const image = changeImage(trends, scale);
    // The clear change is drawn strong; the unclear one faded, though it is a change too.
    expect(image[3]).toBe(215);
    expect(image[7]).toBeLessThan(image[3] * 0.45);
  });
});

describe("big numbers", () => {
  it("say a large rate without decimals, and the direction once", () => {
    const verdict: TrendVerdict = { direction: "decline", label: "Significant decline", p: 0.0003, slopePerYear: -647.73, lowerPerYear: -938.5, upperPerYear: -393.6, slopePerDecade: -6477.3, years: 24, method: "Mann–Kendall + Sen's slope", carryOver: null, yearsNeeded: null };
    expect(explainVerdict(verdict, "Open water", "km²", 1)).toMatch(/^Open water fell by 648 km² per year \(6,477 km² per decade\) \(95% range −939 km² to −394 km² per year\)/);
  });

  it("are grouped in thousands, small ones left as they are", () => {
    expect(grouped(22366, 0)).toBe("22,366");
    expect(grouped(-1234.5, 1)).toBe("-1,234.5");
    expect(grouped(999.25, 2)).toBe("999.25");
    expect(signed(-6916.94, 1)).toBe("−6,916.9");
    expect(signed(0.61, 2)).toBe("+0.61");
    expect(signed(0.0004, 2)).toBe("0.00");
  });
});

const AREA: ScanArea = { name: "Test lake", geometry: bboxPolygon([60, 40, 62, 42]), bbox: [60, 40, 62, 42], center: [41, 61], kind: "region" };

function summerPlan(): PeriodPlan {
  const result = planPeriod({ kind: "since", start: 2005 }, [6, 7, 8], { earliest: "2000-03", latest: "2026-08" });
  if ("error" in result) throw new Error(result.error);
  return result;
}

/**
 * A lake that shrinks: in 2005 it fills the western half of the grid, and it loses a column of
 * pixels every two years. Water is see-through on the vegetation maps (NaN); land reads 0.3.
 */
function shrinkingLake(options: { snowFails?: string; flicker?: boolean; aquaFails?: boolean } = {}): ScanLoaders {
  return {
    monthGrid: async (layer, grid, month) => {
      const values = new Float32Array(grid.width * grid.height);
      if (layer.id === SNOW_LAYER_ID) {
        if (month === options.snowFails) throw new Error("NASA GIBS returned 503");
        return values;
      }
      expect([WATER_LAYER_ID, AQUA_WATER_LAYER_ID]).toContain(layer.id);
      if (layer.id === AQUA_WATER_LAYER_ID && options.aquaFails) throw new Error("NASA GIBS returned 503");
      const year = Number(month.slice(0, 4));
      const columns = 10 - Math.floor((year - 2005) / 2);
      // Flickering water: seen only in June, read as land (hazy) in July and August.
      const seen = !options.flicker || month.endsWith("-06");
      for (let i = 0; i < values.length; i++) values[i] = i % grid.width < columns && seen ? NaN : 0.3;
      return values;
    },
    surfaceMask: async (grid) => new Uint8Array(grid.width * grid.height).fill(1),
    // Open water is 0 or 100 by its own rule: the vegetation map's colour scale must not apply.
    scaleTop: async () => 1,
    scaleBottom: async () => 0,
  };
}

describe("an open water scan", () => {
  const base = { indicator: "water" as const, direction: "any" as const, area: AREA, plan: summerPlan(), availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null }, maxSize: 20 };

  it("tells a shrinking lake's area in km², year by year, with a clear decline", async () => {
    const result = await runScan({ ...base, loaders: shrinkingLake() });
    const { series, verdict, scannedKm2 } = result.region;
    expect(result.surface).toBe("any");
    // Half the area was water in 2005, none of it in 2025.
    expect(series[0].value).toBeCloseTo(scannedKm2 / 2, -1);
    expect(series.at(-1)?.value).toBe(0);
    expect(verdict?.direction).toBe("decline");
    expect(verdict?.slopePerYear).toBeLessThan(-100);
    // The patches where water retreated, each with its own water in km².
    expect(result.hotspots.length).toBeGreaterThan(0);
    for (const hotspot of result.hotspots) {
      expect(hotspot.sign).toBe(-1);
      expect(hotspot.series[0].value).toBeGreaterThan(0);
      expect(hotspot.series[0].value).toBeLessThanOrEqual(hotspot.areaKm2 + 1);
    }
    expect(result.notes.join(" ")).not.toMatch(/colour scale/);
    expect(result.notes.join(" ")).not.toMatch(/rough/);
  });

  it("isn't fooled by hazy months: one clear month a season finds the whole lake", async () => {
    const steady = await runScan({ ...base, loaders: shrinkingLake() });
    const flickering = await runScan({ ...base, loaders: shrinkingLake({ flicker: true }) });
    expect(flickering.region.series).toEqual(steady.region.series);
    // But it says the water came and went within each season.
    expect(flickering.notes.join(" ")).toMatch(/water in only some months of each season/);
  });

  it("says when the snow map couldn't be read, and still reads a month without Aqua's map", async () => {
    const snowless = await runScan({ ...base, loaders: shrinkingLake({ snowFails: "2010-07" }) });
    expect(snowless.notes).toContain("NASA's snow map couldn't be read for 1 month(s), so snow and ice there may count as water.");
    const terraOnly = await runScan({ ...base, loaders: shrinkingLake({ aquaFails: true }) });
    expect(terraOnly.region.verdict?.direction).toBe("decline");
  });
});

describe("a month of open water", () => {
  const grid = { bbox: [60, 40, 62, 42] as [number, number, number, number], width: 4, height: 1 };
  const loader = (aqua: "blank" | "lake") => {
    const asked: string[] = [];
    const load: MonthGridLoader = async (layer, g, month) => {
      asked.push(`${layer.id}|${month}`);
      if (layer.id === SNOW_LAYER_ID) return new Float32Array(g.width * g.height);
      if (layer.id === AQUA_WATER_LAYER_ID) return aqua === "blank" ? new Float32Array(g.width * g.height).fill(NaN) : f32([NaN, NaN, 0.3, 0.3]);
      return f32([NaN, 0.3, 0.3, 0.3]);
    };
    return { load, asked };
  };

  it("doesn't read Aqua's map before its record starts", async () => {
    const { load, asked } = loader("lake");
    const month = await openWaterMonth(load, grid, "2001-07");
    expect(asked.some((key) => key.startsWith(AQUA_WATER_LAYER_ID))).toBe(false);
    expect([...month.grid]).toEqual([100, 0, 0, 0]);
  });

  it("treats a map with no readings anywhere as missing, not as all water", async () => {
    const blank = await openWaterMonth(loader("blank").load, grid, "2020-07");
    expect([...blank.grid]).toEqual([100, 0, 0, 0]);
    expect(blank.bothRead).toBe(false);
    const both = await openWaterMonth(loader("lake").load, grid, "2020-07");
    expect([...both.grid]).toEqual([100, 100, 0, 0]);
  });
});

describe("open water on the Analysis page", () => {
  /**
   * The western half of every map is see-through (water). The snow map says it's all snow in January,
   * when the ground is at −10 °C, and in August too, when the ground is at 30 °C (a salty lake).
   */
  const load: MonthGridLoader = async (layer, grid, month) => {
    const values = new Float32Array(grid.width * grid.height);
    if (layer.id === SNOW_LAYER_ID) return values.fill(month.endsWith("-01") || month.endsWith("-08") ? 80 : 0);
    if (layer.id === SURFACE_TEMP_LAYER_ID) return values.fill(month.endsWith("-01") ? -10 : 30);
    for (let i = 0; i < values.length; i++) values[i] = i % grid.width < grid.width / 2 ? NaN : 0.4;
    return values;
  };

  it("is worked out pixel by pixel, in km² of the area", async () => {
    const water = await waterInArea(load, AREA.geometry, AREA.bbox, "2020-07");
    // Half of a 2° × 2° box at 41°N, about 18,700 km².
    expect(water).toBeGreaterThan(18_000);
    expect(water).toBeLessThan(19_500);
  });

  it("leaves out a month when snow hides the water, but not for snow the snow map mistook", async () => {
    expect(await waterInArea(load, AREA.geometry, AREA.bbox, "2020-01")).toBeNull();
    expect(await waterInArea(load, AREA.geometry, AREA.bbox, "2020-08")).toBeGreaterThan(18_000);
  });

  it("counts the three maps it reads each month in the estimate", () => {
    const request = { start: "2020-06", end: "2020-08", datasets: ["water", "vegetation", "climate"] as const };
    expect(countMaps({ ...request, datasets: [...request.datasets] })).toBe(3 * (3 + 1));
  });

  it("gives each year its clearest month", () => {
    expect(METRIC_BY_ID.water.aggregate).toBe("max");
    const values = [
      { month: "2020-06", value: 900 },
      { month: "2020-07", value: 1200 },
      { month: "2020-08", value: 1000 },
    ];
    expect(yearlyValues(values, [6, 7, 8], "max")[0].value).toBe(1200);
    // A whole year with its snowy winter left out still counts: the summer months are there.
    const year = Array.from({ length: 12 }, (_, k) => ({ month: `2020-${String(k + 1).padStart(2, "0")}`, value: k >= 4 && k <= 8 ? 1000 + k : null }));
    expect(yearlyValues(year, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "max")[0].value).toBe(1008);
  });
});

describe("lakes the land/water map misses", () => {
  const plan = summerPlan();
  const base = { direction: "any" as const, area: AREA, plan, availability: { window: { earliest: "2000-03", latest: "2026-08" }, available: null }, maxSize: 20 };
  const landEverywhere: ScanLoaders = {
    monthGrid: async (_layer, grid) => new Float32Array(grid.width * grid.height).fill(0.4),
    surfaceMask: async (grid) => new Uint8Array(grid.width * grid.height).fill(1),
  };
  // The western quarter is a lake on NASA's land cover map.
  const lake = async (grid: { width: number; height: number }) => Uint8Array.from({ length: grid.width * grid.height }, (_, i) => (i % grid.width < grid.width / 4 ? 1 : 0));

  it("are left out of land measures, not of open water or the air", async () => {
    const land = await runScan({ ...base, indicator: "vegetation", loaders: { ...landEverywhere, inlandWater: lake } });
    const kept = land.mask.reduce((sum, v) => sum + v, 0);
    expect(kept).toBe(land.mask.length * 0.75);
    const air = await runScan({ ...base, indicator: "airTemp", loaders: { ...landEverywhere, inlandWater: lake } });
    expect(air.mask.reduce((sum, v) => sum + v, 0)).toBe(air.mask.length);
  });

  it("are read as land, and said so, when the land cover map can't be read", async () => {
    const failing = async () => {
      throw new Error("NASA GIBS returned 503");
    };
    const result = await runScan({ ...base, indicator: "vegetation", loaders: { ...landEverywhere, inlandWater: failing } });
    expect(result.mask.every((v) => v === 1)).toBe(true);
    expect(result.notes.join(" ")).toMatch(/lakes the land\/water map doesn't mark may be read as land/);
  });
});
