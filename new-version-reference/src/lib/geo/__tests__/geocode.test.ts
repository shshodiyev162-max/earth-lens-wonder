import { describe, expect, it } from "vitest";
import { defaultRadiusKm, hasBoundary, normalizePhotonFeature, parseCoordinates, rankResults, zoomForKind, type PlaceResult } from "../geocode";

describe("parseCoordinates", () => {
  it.each([
    ["39.77, 64.42", 39.77, 64.42],
    ["39.77 64.42", 39.77, 64.42],
    ["-33.86,151.21", -33.86, 151.21],
    ["39.77N 64.42E", 39.77, 64.42],
    ["64.42E 39.77N", 39.77, 64.42],
    ["33.9S 18.4E", -33.9, 18.4],
    ["lat: 40.7 lon: -74.0", 40.7, -74.0],
  ])("parses %s", (input, lat, lon) => {
    const result = parseCoordinates(input);
    expect(result?.center[0]).toBeCloseTo(lat, 5);
    expect(result?.center[1]).toBeCloseTo(lon, 5);
    expect(result?.kind).toBe("coordinates");
  });

  it.each(["Bukhara", "95, 10", "10, 190", "Route 66", "", "39.77"])("rejects %s", (input) => {
    expect(parseCoordinates(input)).toBeNull();
  });
});

describe("Photon results", () => {
  it("normalises extent into a west/south/east/north bbox", () => {
    const result = normalizePhotonFeature({
      geometry: { coordinates: [64.4074, 39.7754] },
      properties: { osm_type: "R", osm_id: 13070474, osm_key: "place", type: "city", name: "Bukhara", state: "Bukhara Region", country: "Uzbekistan", extent: [64.37, 39.85, 64.52, 39.71] },
    });
    expect(result).toMatchObject({ name: "Bukhara", kind: "city", context: "Bukhara Region, Uzbekistan", osm: { type: "R", id: 13070474 } });
    expect(result?.bbox).toEqual([64.37, 39.71, 64.52, 39.85]);
    expect(hasBoundary(result as PlaceResult)).toBe(true);
  });

  it("ranks cities and regions above shops", () => {
    const shop = { id: "1", name: "Shop", context: "", kind: "poi", center: [0, 0], source: "photon" } as PlaceResult;
    const city = { id: "2", name: "City", context: "", kind: "city", center: [0, 0], source: "photon" } as PlaceResult;
    expect(rankResults([shop, city]).map((r) => r.name)).toEqual(["City", "Shop"]);
  });

  it("treats deserts and mountain ranges as wide regions", () => {
    // Real Photon answers for "Sahara" and "Himalayas" (October 2026).
    const sahara = normalizePhotonFeature({
      geometry: { coordinates: [5.53, 23.42] },
      properties: { osm_type: "N", osm_id: 9412354612, osm_key: "place", osm_value: "region", type: "other", name: "Sahara", country: "Algeria" },
    });
    const range = normalizePhotonFeature({
      geometry: { coordinates: [84.1, 28.6] },
      properties: { osm_type: "N", osm_id: 3791305957, osm_key: "natural", osm_value: "mountain_range", type: "other", name: "Himalayas" },
    });
    expect(sahara?.kind).toBe("region");
    expect(range?.kind).toBe("region");
    // A point-only region gets a wide view and a wide analysis radius.
    expect(zoomForKind("region")).toBeLessThanOrEqual(5);
    expect(defaultRadiusKm("region")).toBe(50);
    expect(hasBoundary(sahara as PlaceResult)).toBe(false);
  });
});
