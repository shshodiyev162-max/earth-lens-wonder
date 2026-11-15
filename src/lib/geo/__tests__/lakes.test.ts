import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { areaKm2, bboxOf, type PolygonGeometry } from "../geometry";
import { findLake, lakeAt, LAKES, lakeShape } from "../lakes";
import { findNamedRegion, regionBBox, regionGeometry, regionNote, regionPlace } from "../regions";
import { buildCountryIndex, countryAt, type CountryCollection } from "../countries";

const collection = JSON.parse(readFileSync(resolve(__dirname, "../../../../public/data/lakes.json"), "utf8")) as { features: { properties: { label: string }; geometry: PolygonGeometry }[] };
const OUTLINES = new Map(collection.features.map((feature) => [feature.properties.label, feature.geometry]));

/** Sizes in km² of each lake at its largest since 2000, from published records, for a sanity check. */
const KNOWN_KM2: Record<string, number> = {
  "Lake Baikal": 31_500,
  "Lake Victoria": 68_800,
  "Lake Tanganyika": 32_900,
  "Lake Malawi": 29_600,
  "Lake Superior": 82_100,
  "Lake Ladoga": 17_700,
  "Issyk-Kul": 6_240,
  "Lake Titicaca": 8_370,
};

describe("the lakes", () => {
  it("each have an outline traced from NASA's maps, inside the box they were looked for in", () => {
    expect(OUTLINES.size).toBe(LAKES.length);
    for (const lake of LAKES) {
      const outline = OUTLINES.get(lake.label);
      expect(outline, lake.label).toBeDefined();
      const [w, s, e, n] = bboxOf(outline as PolygonGeometry);
      expect(w, lake.label).toBeGreaterThanOrEqual(lake.bbox[0] - 0.01);
      expect(s, lake.label).toBeGreaterThanOrEqual(lake.bbox[1] - 0.01);
      expect(e, lake.label).toBeLessThanOrEqual(lake.bbox[2] + 0.01);
      expect(n, lake.label).toBeLessThanOrEqual(lake.bbox[3] + 0.01);
    }
  });

  it("are about the size the records give (a little over, for the 2 km margin)", () => {
    for (const [label, km2] of Object.entries(KNOWN_KM2)) {
      const traced = areaKm2(OUTLINES.get(label) as PolygonGeometry);
      expect(traced / km2, label).toBeGreaterThan(0.9);
      expect(traced / km2, label).toBeLessThan(1.25);
    }
    // The Aral Sea as it was in 2001, North and South together: far bigger than today's.
    expect(areaKm2(OUTLINES.get("Aral Sea") as PolygonGeometry)).toBeGreaterThan(20_000);
  });

  it("are found by name, as lakes", () => {
    for (const [typed, label] of [
      ["the aral sea", "Aral Sea"],
      ["Urmia", "Lake Urmia"],
      ["Lake Poopo", "Lake Poopó"],
      ["issyk kul", "Issyk-Kul"],
      ["Great Salt Lake", "Great Salt Lake"],
    ]) {
      const region = findNamedRegion(typed);
      expect(region?.label, typed).toBe(label);
      expect(region?.lake, typed).toBe(true);
      expect(region?.water, typed).toBeUndefined();
    }
    expect(regionNote(findNamedRegion("Lake Urmia")!)).toMatch(/largest area NASA's maps show it under water since 2000/);
  });

  it("are picked on the map before the country around them", () => {
    const countries = buildCountryIndex(JSON.parse(readFileSync("public/data/countries-50m.json", "utf8")) as CountryCollection);
    // The middle of Lake Urmia is inside Iran's outline too.
    const urmia: [number, number] = [37.7, 45.4];
    expect(countryAt(countries, urmia)?.name).toBe("Iran");
    expect(lakeAt(urmia, OUTLINES)?.label).toBe("Lake Urmia");
    // The middle of the old Aral Sea, dry since about 2014, is still part of it.
    expect(lakeAt([45.0, 59.6], OUTLINES)?.label).toBe("Aral Sea");
    expect(lakeAt([41.3, 69.25], OUTLINES)).toBeNull(); // Tashkent
    // Before the outlines are loaded, nothing is picked as a lake.
    expect(lakeAt(urmia, null)).toBeNull();
  });
});

describe("a lake as an area", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(collection), { status: 200 })));
  afterAll(() => vi.unstubAllGlobals());

  it("is its outline, scanned over its box, and searched as water", async () => {
    const region = findNamedRegion("Aral Sea")!;
    const geometry = await regionGeometry(region, null);
    expect(geometry).toEqual(OUTLINES.get("Aral Sea"));
    expect(regionBBox(region, null)).toEqual(findLake("Aral Sea")?.bbox);
    expect((await regionPlace(region))?.kind).toBe("water");
    expect(await lakeShape(findLake("Lake Mead")!)).toEqual(OUTLINES.get("Lake Mead"));
  });
});
