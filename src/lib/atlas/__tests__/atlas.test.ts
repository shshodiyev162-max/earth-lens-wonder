import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pointInGeometry } from "../../geo/geometry";
import { decodeGeometry } from "../../geo/polyline";
import { INDICATORS } from "../../query/indicators";
import { queryFromParams } from "../../trends/query";
import { atlasMeasure, atlasScale, atlasTrendsHref, hotspotName, WORLD_ATLAS, type AtlasHotspot } from "../atlas";

/** A PNG's width and height, from its header. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the world change atlas data", () => {
  it("has six measures, each with its change map in public/data/atlas at the size of its grid", () => {
    expect(WORLD_ATLAS.measures.map((m) => m.id)).toEqual(["vegetation", "heat", "airTemp", "rainfall", "snow", "sst"]);
    for (const measure of WORLD_ATLAS.measures) {
      const file = resolve(__dirname, "../../../../public/data/atlas", measure.file);
      expect(existsSync(file), measure.file).toBe(true);
      expect(pngSize(file)).toEqual({ width: measure.grid.width, height: measure.grid.height });
    }
  });

  it("covers the years it says it read, every month of each", () => {
    for (const measure of WORLD_ATLAS.measures) {
      expect(measure.endYear - measure.startYear + 1).toBe(measure.yearsRead);
      expect(measure.startYear).toBeGreaterThanOrEqual(2003);
      // Every month of each year, less any NASA hasn't published.
      expect(measure.mapsRead).toBeGreaterThan(measure.yearsRead * 12 * 0.9);
      expect(measure.mapsRead).toBeLessThanOrEqual(measure.yearsRead * 12);
    }
  });

  it("ranks the biggest changes, each with a readable outline, its label inside it and a chance check", () => {
    for (const measure of WORLD_ATLAS.measures) {
      expect(measure.chanceRuns).toBe(19);
      expect(measure.chanceRunsWithPatches).toBeGreaterThanOrEqual(0);
      expect(measure.chanceRunsWithPatches).toBeLessThanOrEqual(measure.chanceRuns);
      expect(measure.hotspots.map((h) => h.rank)).toEqual(measure.hotspots.map((_, i) => i + 1));
      for (const hotspot of measure.hotspots) {
        const outline = decodeGeometry(hotspot.outline);
        expect(outline).not.toBeNull();
        expect(hotspot.areaKm2).toBeGreaterThan(0);
        // Named and labelled at a point inside the patch.
        expect(pointInGeometry([hotspot.center[1], hotspot.center[0]], outline!)).toBe(true);
        expect(hotspot.chance).toBeGreaterThanOrEqual(0);
        expect(hotspot.chance).toBeLessThanOrEqual(measure.chanceRuns);
        if (hotspot.verdict) {
          expect(hotspot.verdict.p).toBeGreaterThanOrEqual(0);
          expect(hotspot.verdict.p).toBeLessThanOrEqual(1);
          expect(hotspot.verdict.lowerPerYear).toBeLessThanOrEqual(hotspot.verdict.upperPerYear);
        }
      }
    }
  });
});

describe("atlas helpers", () => {
  const hotspot: AtlasHotspot = {
    rank: 3,
    name: "Aral Sea",
    sign: -1,
    center: [45, 60],
    bbox: [58, 43, 62, 47],
    outline: WORLD_ATLAS.measures[0].hotspots[0].outline,
    areaKm2: 20000,
    meanChange: -0.01,
    significantShare: 0.8,
    verdict: null,
    chance: 0,
  };

  it("falls back to the first measure for an unknown one", () => {
    expect(atlasMeasure("sst").id).toBe("sst");
    expect(atlasMeasure("nonsense").id).toBe("vegetation");
    expect(atlasMeasure(null).id).toBe("vegetation");
  });

  it("draws the legend in the measure's own colours", () => {
    const measure = atlasMeasure("heat");
    const scale = atlasScale(measure);
    expect(scale.mode).toBe("perDecade");
    expect(scale.max).toBe(measure.scale.max);
    expect(scale.unit).toBe(measure.scale.unit);
    expect(scale.decline).not.toEqual(scale.increase);
    expect(INDICATORS.heat.colors.increase).toMatch(/^#/);
  });

  it("names a change by its place, or by its rank where it has none", () => {
    expect(hotspotName(hotspot)).toBe("Aral Sea");
    expect(hotspotName({ ...hotspot, name: null })).toBe("Change 3");
  });

  it("names a change bigger than most provinces by its country, numbered when a bigger one has the name", () => {
    const poland = { ...hotspot, rank: 4, name: "Silesian Voivodeship, Poland", areaKm2: 194_000 };
    expect(hotspotName(poland)).toBe("Poland");
    // Under 100,000 km², the province is the right size of name.
    expect(hotspotName({ ...poland, areaKm2: 90_000 })).toBe("Silesian Voivodeship, Poland");
    const india = { ...hotspot, rank: 2, name: "India", areaKm2: 1_349_000 };
    const madhya = { ...hotspot, rank: 9, name: "Madhya Pradesh, India", areaKm2: 120_000 };
    expect(hotspotName(madhya, [india, madhya])).toBe("India (2)");
    expect(hotspotName(india, [india, madhya])).toBe("India");
  });

  it("opens the Trends page on the change's outline, measure, direction and years", () => {
    const measure = atlasMeasure("vegetation");
    const href = atlasTrendsHref(measure, hotspot);
    expect(href.startsWith("/trends?")).toBe(true);
    const query = queryFromParams(new URLSearchParams(href.split("?")[1]));
    expect(query.indicators).toEqual(["vegetation"]);
    expect(query.filters.vegetation?.direction).toBe("decline");
    expect(query.area).toEqual({ country: undefined, osm: undefined, poly: hotspot.outline, name: "Aral Sea" });
    expect(query.time).toEqual({ kind: "since", start: measure.startYear });
    expect(query.season).toBe("all");
    expect(queryFromParams(new URLSearchParams(atlasTrendsHref(measure, { ...hotspot, sign: 1 }).split("?")[1])).filters.vegetation?.direction).toBe("increase");
  });
});
