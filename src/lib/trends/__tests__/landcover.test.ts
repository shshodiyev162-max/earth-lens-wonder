import { describe, expect, it } from "vitest";
import {
  classifyPixels,
  COVER_GROUPS,
  describeCover,
  groupOf,
  measuresForEverything,
  parseCoverLegend,
  suggestMeasures,
  summarizeCover,
  correctWater,
  keepsCorrection,
  type CoverGroup,
  type LandCover,
} from "../landcover";
import { CORE_INDICATORS } from "../../query/indicators";
import { scanGrid } from "../grid";

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

  it("describes the place", () => {
    const now = cover({ barren: 0.62, grass: 0.2, cropland: 0.08, urban: 0.02, water: 0.08 });
    expect(describeCover(now)).toBe("Mostly bare ground and desert (62%), with grassland, shrubs and savanna (20%) and cropland (8%).");
  });
});

describe("measures for a place", () => {
  const ids = (shares: Partial<Record<CoverGroup, number>>, lat = 40) => suggestMeasures(cover(shares), lat).map((s) => s.indicator);

  it("suits a desert", () => {
    expect(ids({ barren: 0.6, grass: 0.3, cropland: 0.1 })).toEqual(["dust", "vegetation", "heat", "rainfall", "soil", "fineDust"]);
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
    expect(ids({ snow: 0.98, barren: 0.02 }, -80)).toEqual(["snow", "airTemp", "snowfall", "ozone"]);
  });

  it("gives every suggestion a reason", () => {
    for (const s of suggestMeasures(cover({ forest: 0.5, cropland: 0.3, wetland: 0.1, urban: 0.1 }), 5)) expect(s.reason.length).toBeGreaterThan(10);
  });

  it("falls back to the six main measures when land cover is unknown", () => {
    expect(measuresForEverything(null, 40)).toEqual(CORE_INDICATORS);
    expect(measuresForEverything(cover({ forest: 1 }), 50)[0]).toBe("vegetation");
    expect(measuresForEverything(null, 40, "sea")).toEqual(["sst", "airTemp"]);
  });

  it("suggests sea and air measures for a sea or ocean, never land ones", () => {
    const ocean = suggestMeasures(cover({ water: 0.7, forest: 0.2, barren: 0.1 }), 30, "ocean").map((s) => s.indicator);
    expect(ocean[0]).toBe("sst");
    expect(ocean).not.toContain("vegetation");
    expect(ocean).not.toContain("dust");
    expect(ocean).not.toContain("rainfall");
    // A lake: its open water first, its surface temperature, and never sea salinity, which NASA doesn't measure on lakes.
    const lake = suggestMeasures(cover({ water: 0.6, barren: 0.4 }), 45, "lake").map((s) => s.indicator);
    expect(lake.slice(0, 2)).toEqual(["water", "sst"]);
    expect(lake).not.toContain("salinity");
    // The dried shore around it is land, so land measures come too.
    expect(lake).toContain("dust");
    const sea = suggestMeasures(cover({ water: 1 }), 35, "sea");
    expect(sea.map((s) => s.indicator)).toEqual(["sst", "airTemp", "salinity"]);
    expect(sea[2].reason).toMatch(/salty/);
  });
});

describe("water on the land cover map, checked", () => {
  const W = COVER_GROUPS.indexOf("water");
  const B = COVER_GROUPS.indexOf("barren");
  const G = COVER_GROUPS.indexOf("grass");

  it("counts a dried lake bed as bare ground, and keeps water still seen", () => {
    // Four pixels the map calls water: still wet in July, dry all summer, unread (snow), and one of grassland.
    const classes = Uint8Array.from([W, W, W, G]);
    const june = Float32Array.from([0, 0, NaN, 0]);
    const july = Float32Array.from([100, 0, NaN, 0]);
    const { classes: out, dried } = correctWater(classes, [june, july]);
    expect([...out]).toEqual([W, B, W, G]);
    expect([...dried]).toEqual([0, 1, 0, 0]);
    // Nothing read: the map is taken as it is.
    expect([...correctWater(classes, []).classes]).toEqual([...classes]);
  });

  it("believes it only where a real share of the water dried, not for a few percent of map error", () => {
    const grid = scanGrid([0, 0, 2, 2], 2, 0.5);
    const mask = new Uint8Array([1, 1, 1, 1]);
    const before = summarizeCover(Uint8Array.from([W, W, W, W]), mask, grid, 2024);
    const shrunk = summarizeCover(Uint8Array.from([B, B, B, W]), mask, grid, 2024, Uint8Array.from([1, 1, 1, 0]), "Jun–Aug 2024");
    expect(keepsCorrection(before, shrunk)).toBe(true);
    const steady = { ...shrunk, driedKm2: before.km2.water * 0.06 };
    expect(keepsCorrection(before, steady)).toBe(false);
  });

  it("says how much of the water it moved", () => {
    const grid = scanGrid([0, 0, 2, 2], 2, 0.5);
    const cover = summarizeCover(Uint8Array.from([B, B, W, W]), new Uint8Array([1, 1, 1, 1]), grid, 2024, Uint8Array.from([1, 0, 0, 0]), "Jun–Aug 2024");
    expect(cover.driedKm2).toBeGreaterThan(0);
    expect(cover.driedKm2).toBeLessThan(cover.km2.barren);
    expect(cover.checkedIn).toBe("Jun–Aug 2024");
  });
});
