import { describe, expect, it } from "vitest";
import { buildCountryIndex, type CountryCollection } from "@/lib/geo/countries";
import { WATERS } from "@/lib/geo/waters";
import { countryNames, formatDegree, gridStep, gridValues, placeNames, pxPerDegree, WATER_NAMES, type MapName } from "../details";

const flat = (zoom: number, width = 1000, height = 600) => ({
  zoom,
  width,
  height,
  // A flat map centred on 0°, 0°: enough to test the choices made here.
  project: ([lat, lon]: [number, number]) => ({ x: width / 2 + lon * pxPerDegree(zoom), y: height / 2 - lat * pxPerDegree(zoom) }),
});

const country = (text: string, at: [number, number], spanDeg: number): MapName => ({ key: text, text, kind: "country", at, spanDeg });

describe("the latitude and longitude grid", () => {
  it("keeps lines apart at every zoom, and gets finer closer in", () => {
    const steps = [2, 3, 5, 7, 9, 12].map((zoom) => gridStep(pxPerDegree(zoom)));
    expect(steps).toEqual([...steps].sort((a, b) => b - a));
    expect(steps[0]).toBeGreaterThan(steps[5]);
    for (const zoom of [3, 5, 7, 9]) expect(gridStep(pxPerDegree(zoom)) * pxPerDegree(zoom)).toBeGreaterThanOrEqual(110);
  });

  it("gives round values only, with no rounding noise", () => {
    expect(gridValues(-31, 31, 15)).toEqual([-30, -15, 0, 15, 30]);
    expect(gridValues(0.05, 0.55, 0.1)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("writes degrees the way a map does", () => {
    expect(formatDegree(30, "lat")).toBe("30°N");
    expect(formatDegree(-15, "lat")).toBe("15°S");
    expect(formatDegree(-0.25, "lon")).toBe("0.25°W");
    expect(formatDegree(60, "lon")).toBe("60°E");
    expect(formatDegree(0, "lat")).toBe("0°");
    expect(formatDegree(180, "lon")).toBe("180°");
  });
});

describe("names on the map", () => {
  it("only names seas that can also be searched for", () => {
    const searchable = new Set(WATERS.map((water) => water.label));
    for (const name of WATER_NAMES.filter((n) => n.kind === "sea")) expect(searchable, name.text).toContain(name.text);
  });

  it("names a country on its mainland, not on a far-off island", () => {
    const collection: CountryCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "TST", name: "Testland" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [[[100, -40], [101, -40], [101, -39], [100, -39], [100, -40]]],
              [[[10, 40], [30, 40], [30, 50], [10, 50], [10, 40]]],
            ],
          },
        },
      ],
    };
    const [name] = countryNames(buildCountryIndex(collection));
    expect(name.spanDeg).toBe(20);
    expect(name.at[0]).toBeGreaterThan(40);
    expect(name.at[1]).toBeLessThan(30);
  });

  it("shows a country's name only once it fits", () => {
    const small = country("Belgium", [0, 0], 4);
    expect(placeNames([small], flat(3))).toHaveLength(0);
    expect(placeNames([small], flat(5))).toHaveLength(1);
  });

  it("holds a small sea's name back until it is close enough", () => {
    const sea = WATER_NAMES.find((name) => name.text === "Persian Gulf") as MapName;
    const view = (zoom: number) => ({ ...flat(zoom), project: () => ({ x: 500, y: 300 }) });
    expect(placeNames([sea], view(3))).toHaveLength(0);
    expect(placeNames([sea], view(5))).toHaveLength(1);
  });

  it("never stacks names: the larger country keeps its place", () => {
    const names = [country("Smallland", [0, 0.5], 40), country("Greatland", [0, 0], 60)];
    expect(placeNames(names, flat(3)).map((name) => name.text)).toEqual(["Greatland"]);
  });

  it("gives way to an ocean or sea name", () => {
    const ocean: MapName = { key: "o", text: "Indian Ocean", kind: "ocean", at: [0, 0] };
    expect(placeNames([country("Greatland", [0, 0], 60), ocean], flat(3)).map((name) => name.text)).toEqual(["Indian Ocean"]);
  });

  it("leaves out what is off the map, or would be cut off by its edge", () => {
    expect(placeNames([country("Farland", [0, 170], 60)], flat(3, 400, 300))).toHaveLength(0);
    // 300 px from the centre of a 700 px map: a long name would run over the edge, a short one fits.
    const at: [number, number] = [0, 300 / pxPerDegree(3)];
    expect(placeNames([country("A very long country name", at, 60)], flat(3, 700, 300))).toHaveLength(0);
    expect(placeNames([country("Short", at, 60)], flat(3, 700, 300))).toHaveLength(1);
  });

  it("uses the shorter name people say", () => {
    const collection: CountryCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { id: "USA", name: "United States of America" }, geometry: { type: "Polygon", coordinates: [[[-120, 30], [-70, 30], [-70, 48], [-120, 48], [-120, 30]]] } }],
    };
    expect(countryNames(buildCountryIndex(collection))[0].text).toBe("United States");
  });
});
