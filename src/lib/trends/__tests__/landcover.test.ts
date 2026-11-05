import { describe, expect, it } from "vitest";
import {
  classifyPixels,
  COVER_GROUPS,
  coverChanges,
  describeCover,
  groupOf,
  measuresForEverything,
  parseCoverLegend,
  suggestMeasures,
  summarizeCover,
  type CoverGroup,
  type LandCover,
} from "../landcover";
import { CORE_INDICATORS } from "../../query/indicators";

/** NASA's legend file, cut down to four classes. */
const LEGEND_XML = `<?xml version="1.0"?><ColorMaps><ColorMap title="Classifications"><Legend type="classification">
<LegendEntry rgb="49,204,49" tooltip="Evergreen Broadleaf Forests" id="1"/>
<LegendEntry rgb="255,0,0" tooltip="Urban and Built-up Lands" id="12"/>
<LegendEntry rgb="191,191,189" tooltip="Barren" id="15"/>
<LegendEntry rgb="134,202,227" tooltip="Water Bodies" id="16"/>
<LegendEntry rgb="100,100,100" tooltip="Unclassified" id="17"/>
</Legend></ColorMap></ColorMaps>`;

function cover(shares: Partial<Record<CoverGroup, number>>, year = 2024): LandCover {
  const full = Object.fromEntries(COVER_GROUPS.map((g) => [g, shares[g] ?? 0])) as Record<CoverGroup, number>;
  return { year, shares: full, km2: Object.fromEntries(COVER_GROUPS.map((g) => [g, full[g] * 1000])) as Record<CoverGroup, number>, totalKm2: 1000 };
}

describe("NASA land cover", () => {
  it("groups NASA's 17 classes by name", () => {
    expect(groupOf("Evergreen Needleleaf Forests")).toBe("forest");
    expect(groupOf("Cropland/Natural Vegetation Mosaics")).toBe("cropland");
    expect(groupOf("Woody Savannas")).toBe("grass");
    expect(groupOf("Open Shrublands")).toBe("grass");
    expect(groupOf("Urban and Built-up Lands")).toBe("urban");
    expect(groupOf("Permanent Snow and Ice")).toBe("snow");
    expect(groupOf("Barren")).toBe("barren");
    expect(groupOf("Permanent Wetlands")).toBe("wetland");
    expect(groupOf("Water Bodies")).toBe("water");
    expect(groupOf("Unclassified")).toBeNull();
  });

  it("reads pixels by their legend colour and adds up the area inside the outline", () => {
    const legend = parseCoverLegend(LEGEND_XML);
    // 2×2 pixels: forest, city, desert, unclassified.
    const rgba = new Uint8ClampedArray([49, 204, 49, 255, 255, 0, 0, 255, 191, 191, 189, 255, 100, 100, 100, 255]);
    const classes = classifyPixels(rgba, legend);
    expect(classes[3]).toBe(255);
    const grid = { bbox: [0, -1, 2, 1] as [number, number, number, number], width: 2, height: 2 };
    const all = summarizeCover(classes, new Uint8Array([1, 1, 1, 1]), grid, 2024);
    expect(all.shares.forest).toBeCloseTo(1 / 3, 6);
    expect(all.shares.urban).toBeCloseTo(1 / 3, 6);
    // Only the pixels inside the outline count.
    const part = summarizeCover(classes, new Uint8Array([1, 0, 0, 0]), grid, 2024);
    expect(part.shares.forest).toBe(1);
    // A slightly blended edge colour still counts as its class.
    expect(classifyPixels(new Uint8ClampedArray([190, 192, 188, 255]), legend)[0]).toBe(COVER_GROUPS.indexOf("barren"));
  });

  it("describes the place and how it changed", () => {
    const now = cover({ barren: 0.62, grass: 0.2, cropland: 0.08, urban: 0.02, water: 0.08 });
    expect(describeCover(now)).toBe("Mostly bare ground and desert (62%), with grassland, shrubs and savanna (20%) and cropland (8%).");
    const then = cover({ barren: 0.6, grass: 0.24, cropland: 0.08, urban: 0.005, water: 0.075 }, 2001);
    expect(coverChanges(then, now).map((c) => c.group)).toEqual(["grass", "barren", "urban"]);
  });
});

describe("measures for a place", () => {
  const ids = (shares: Partial<Record<CoverGroup, number>>, lat = 40) => suggestMeasures(cover(shares), lat).map((s) => s.indicator);

  it("suits a desert", () => {
    expect(ids({ barren: 0.6, grass: 0.3, cropland: 0.1 })).toEqual(["dust", "vegetation", "heat", "rainfall", "soil"]);
  });

  it("suits a city with farmland around it", () => {
    const list = ids({ cropland: 0.55, urban: 0.3, grass: 0.15 });
    expect(list.slice(0, 2)).toEqual(["vegetation", "heat"]);
    expect(list).toContain("so2");
    expect(list.length).toBeLessThanOrEqual(6);
  });

  it("suits the sea", () => {
    expect(ids({ water: 0.85, cropland: 0.15 })[0]).toBe("sst");
  });

  it("suits Antarctica, including the ozone layer", () => {
    expect(ids({ snow: 0.98, barren: 0.02 }, -80)).toEqual(["snow", "airTemp", "ozone"]);
  });

  it("gives every suggestion a reason", () => {
    for (const s of suggestMeasures(cover({ forest: 0.5, cropland: 0.3, wetland: 0.1, urban: 0.1 }), 5)) expect(s.reason.length).toBeGreaterThan(10);
  });

  it("falls back to the six main measures when land cover is unknown", () => {
    expect(measuresForEverything(null, 40)).toEqual(CORE_INDICATORS);
    expect(measuresForEverything(cover({ forest: 1 }), 50)[0]).toBe("vegetation");
    expect(measuresForEverything(null, 40, "sea")).toEqual(["sst", "airTemp"]);
  });

  it("suggests no land measures for an ocean, whose outline takes in some coast", () => {
    const ocean = suggestMeasures(cover({ water: 0.7, forest: 0.2, barren: 0.1 }), 30, "ocean").map((s) => s.indicator);
    expect(ocean[0]).toBe("sst");
    expect(ocean).not.toContain("vegetation");
    expect(ocean).not.toContain("dust");
    // A sea keeps its coasts.
    expect(suggestMeasures(cover({ water: 0.7, forest: 0.3 }), 30, "sea").map((s) => s.indicator)).toContain("vegetation");
  });
});
