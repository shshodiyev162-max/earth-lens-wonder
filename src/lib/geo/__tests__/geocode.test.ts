import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultRadiusKm,
  hasBoundary,
  mergePlaceResults,
  normalizePhotonFeature,
  parseCoordinates,
  placeTypeLabel,
  rankResults,
  searchPlaces,
  zoomForKind,
  type PlaceResult,
} from "../geocode";

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

  it.each([
    [`39°46'30"N 64°25'12"E`, 39.775, 64.42],
    [`39°46'N, 64°25'E`, 39 + 46 / 60, 64 + 25 / 60],
    [`39° 46′ N 64° 25′ E`, 39 + 46 / 60, 64 + 25 / 60],
    [`N39°46.5' E64°25'`, 39.775, 64 + 25 / 60],
    [`64°25'E 39°46'N`, 39 + 46 / 60, 64 + 25 / 60],
    [`33°55'S 18°25'E`, -(33 + 55 / 60), 18 + 25 / 60],
    [`-33°55', 18°25'`, -(33 + 55 / 60), 18 + 25 / 60],
    [`39.77° N, 64.42° E`, 39.77, 64.42],
  ])("parses degrees and minutes: %s", (input, lat, lon) => {
    const result = parseCoordinates(input);
    expect(result?.center[0]).toBeCloseTo(lat, 5);
    expect(result?.center[1]).toBeCloseTo(lon, 5);
  });

  it.each([`39°75'N 64°25'E`, `39°46'N 40°10'N`, `95°N 10°E`])("rejects impossible degrees: %s", (input) => {
    expect(parseCoordinates(input)).toBeNull();
  });
});

describe("what a found place is", () => {
  const feature = (osm_key: string, osm_value: string, type: string, name = "Samarkand") =>
    normalizePhotonFeature({ geometry: { coordinates: [66.9, 39.6] }, properties: { osm_type: "N", osm_id: 1, osm_key, osm_value, type, name } });

  it("tells villages from towns and cities, which Photon files together", () => {
    expect(feature("place", "village", "city")).toMatchObject({ kind: "locality", typeLabel: "Village" });
    expect(feature("place", "hamlet", "district")).toMatchObject({ kind: "locality", typeLabel: "Hamlet" });
    expect(feature("place", "town", "city")).toMatchObject({ kind: "city", typeLabel: "Town" });
    expect(feature("place", "city", "city")?.kind).toBe("city");
    expect(placeTypeLabel(feature("place", "city", "city") as PlaceResult)).toBe("City");
  });

  it("names lakes, rivers, deserts and airports", () => {
    expect(placeTypeLabel(feature("water", "lake", "other", "Dead Sea") as PlaceResult)).toBe("Lake");
    expect(placeTypeLabel(feature("waterway", "river", "other", "Nile") as PlaceResult)).toBe("River");
    expect(placeTypeLabel(feature("natural", "desert", "other", "Sahara") as PlaceResult)).toBe("Desert");
    expect(feature("aeroway", "aerodrome", "house", "Bukhara International Airport")).toMatchObject({ kind: "poi", typeLabel: "Airport" });
  });

  it("keeps the kind's own word for administrative areas", () => {
    const state = feature("boundary", "administrative", "state", "Bukhara Region");
    expect(state?.typeLabel).toBeUndefined();
    expect(placeTypeLabel(state as PlaceResult)).toBe("State / province");
  });
});

describe("merging TerraScope's regions with OpenStreetMap's places", () => {
  const place = (name: string, kind: PlaceResult["kind"], extra: Partial<PlaceResult> = {}): PlaceResult => ({ id: `${name}-${kind}-${extra.context ?? ""}`, name, context: extra.context ?? "", kind, center: [0, 0], source: "photon", ...extra });
  const region = (name: string, context = "Region") => place(name, "region", { id: `region:${name}`, region: name, context, source: "terrascope" });

  it("leaves out OpenStreetMap's copy of a region it knows, but not a town of that name", () => {
    const merged = mergePlaceResults("aral sea", [region("Aral Sea")], [place("Aral Sea", "locality", { context: "Kazakhstan", osm: { type: "W", id: 1 } }), place("North Aral Sea", "water")]);
    expect(merged.map((p) => p.name)).toEqual(["Aral Sea", "North Aral Sea"]);
    const europe = mergePlaceResults("europe", [region("Europe")], [place("Europe", "district", { context: "Reims", osm: { type: "R", id: 2 } })]);
    expect(europe.map((p) => p.context)).toEqual(["Region", "Reims"]);
  });

  it("leaves out an island named like a country found with it", () => {
    const merged = mergePlaceResults("greenland", [], [
      place("Greenland", "country", { osm: { type: "R", id: 3 } }),
      place("Greenland", "region"),
      place("Greenland", "city", { context: "New Hampshire" }),
      place("Greenland", "locality", { context: "Barbados" }),
    ]);
    // Towns and villages of that name are other places, and stay.
    expect(merged.map((p) => p.kind)).toEqual(["country", "city", "locality"]);
  });

  it("keeps shops and buildings only when nothing else is found", () => {
    const shop = place("Temperature Rules", "poi");
    expect(mergePlaceResults("bukhara", [], [place("Bukhara", "city"), shop])).toHaveLength(1);
    expect(mergePlaceResults("temperature", [], [shop])).toEqual([shop]);
  });

  it("puts a country named exactly what was typed before regions that only start with it", () => {
    const merged = mergePlaceResults("congo", [region("Congo Basin", "Central Africa")], [place("Congo", "country", { osm: { type: "R", id: 5 } })]);
    expect(merged.map((p) => p.name)).toEqual(["Congo", "Congo Basin"]);
    // …but a region named exactly that stays first.
    expect(mergePlaceResults("amazon", [region("Amazon")], [place("Amazon", "state", { osm: { type: "R", id: 6 } })])[0].source).toBe("terrascope");
  });
});

describe("searchPlaces", () => {
  const photon = (name: string, type: string, id: number, extra: Record<string, unknown> = {}) => ({ geometry: { coordinates: [0, 0] }, properties: { osm_type: "R", osm_id: id, osm_key: "place", osm_value: type, type, name, ...extra } });
  const answers: Record<string, unknown[]> = {
    usa: [photon("Usa", "city", 10, { state: "Oita Prefecture", country: "Japan" })],
    "united states": [photon("United States", "country", 148838), photon("United States Virgin Islands", "state", 286898)],
    uk: [photon("Uk", "city", 11, { country: "Russia" })],
    "united kingdom": [photon("United Kingdom", "country", 62149)],
  };

  afterEach(() => vi.unstubAllGlobals());

  it("finds the country for a short name like USA or UK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("countries-50m")) return new Response(readFileSync("public/data/countries-50m.json", "utf8"));
        const q = new URL(url).searchParams.get("q")?.toLowerCase() ?? "";
        return new Response(JSON.stringify({ features: answers[q] ?? [] }));
      }),
    );
    const usa = await searchPlaces("USA");
    expect(usa.map((p) => p.name)).toEqual(["United States", "Usa"]);
    // Read from TerraScope's own outline of the country: its land, like a country clicked on the map.
    expect(usa[0]).toMatchObject({ kind: "country", country: "USA", osm: { type: "R", id: 148838 } });
    expect(usa[1].country).toBeUndefined();
    expect((await searchPlaces("uk"))[0]).toMatchObject({ name: "United Kingdom", country: "GBR" });
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

  it("puts the place named exactly what was typed first, and lakes before villages", () => {
    const industries = { id: "1", name: "Dead Sea Industries", context: "", kind: "locality", center: [0, 0], source: "photon" } as PlaceResult;
    const lake = { id: "2", name: "Dead Sea", context: "", kind: "water", center: [0, 0], source: "photon" } as PlaceResult;
    expect(rankResults([industries, lake], "dead sea").map((r) => r.name)).toEqual(["Dead Sea", "Dead Sea Industries"]);
    expect(rankResults([industries, lake], "the Dead Sea")[0].name).toBe("Dead Sea");
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
