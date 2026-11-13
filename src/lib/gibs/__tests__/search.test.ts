import { describe, expect, it } from "vitest";
import { orderSearchItems } from "@/components/search/useUniversalSearch";
import type { PlaceResult } from "@/lib/geo/geocode";
import { layerMatchScore, MAP_LAYERS, searchLayers, type GibsLayer } from "../catalog";

const named = (name: string) => MAP_LAYERS.find((layer) => layer.name === name) as GibsLayer;

describe("NASA layer search", () => {
  it("finds a layer by a word of its name, the closest match first", () => {
    expect(searchLayers("ndvi")[0].name).toBe("Vegetation (NDVI)");
    expect(searchLayers("temp")[0].name).toBe("Land Surface Temperature");
    expect(searchLayers("sea surface")[0].name).toBe("Sea Surface Temperature");
    expect(searchLayers("snow")[0].name).toBe("Snow Cover");
  });

  it("scores a name match above a match in the description", () => {
    expect(layerMatchScore(named("Vegetation (NDVI)"), "ndvi")).toBe(0);
    expect(layerMatchScore(named("Land Surface Temperature"), "surface temp")).toBe(0);
    expect(layerMatchScore(named("Land Surface Temperature"), "face temp")).toBe(1);
    expect(layerMatchScore(named("Land Surface Temperature"), "dead sea")).toBe(-1);
  });

  it("finds nothing for a place name", () => {
    expect(searchLayers("Samarkand")).toEqual([]);
  });

  it("lists every layer when nothing is typed", () => {
    expect(searchLayers("  ")).toHaveLength(MAP_LAYERS.length);
  });
});

describe("places and layers in the top search", () => {
  const novi: PlaceResult = { id: "R1", name: "Novi", context: "Michigan, United States", kind: "city", center: [42.5, -83.5], source: "photon" };
  const samarkand: PlaceResult = { id: "R2", name: "Samarkand", context: "Uzbekistan", kind: "city", center: [39.6, 66.9], source: "photon" };

  it("puts layers first when the words name one, without shops of that name", () => {
    const shop: PlaceResult = { id: "N3", name: "NDVI Labs", context: "Texas", kind: "poi", center: [30, -97], source: "photon" };
    const items = orderSearchItems([novi, shop], searchLayers("ndvi").slice(0, 4), "ndvi");
    expect(items[0]).toMatchObject({ type: "layer", layer: { name: "Vegetation (NDVI)" } });
    expect(items.filter((item) => item.type === "place")).toEqual([{ type: "place", place: novi }]);
  });

  it("keeps places first otherwise", () => {
    const items = orderSearchItems([samarkand], searchLayers("samarkand"), "samarkand");
    expect(items).toEqual([{ type: "place", place: samarkand }]);
  });
});
