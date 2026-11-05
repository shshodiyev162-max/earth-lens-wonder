import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pointInGeometry, type PolygonGeometry } from "../geometry";
import { searchPlaces } from "../geocode";
import { findNamedRegion, regionGeometry, regionPlace, searchNamedRegions } from "../regions";
import { WATERS } from "../waters";
import { analysisHrefForPlace } from "../../links";

const shapes = new Map(
  (JSON.parse(readFileSync("public/data/waters.json", "utf8")) as { features: { properties: { label: string }; geometry: PolygonGeometry }[] }).features.map((f) => [
    f.properties.label,
    f.geometry,
  ]),
);
const inShape = (label: string, lat: number, lon: number) => pointInGeometry([lon, lat], shapes.get(label) as PolygonGeometry);

describe("the bundled water areas", () => {
  it("have one shape for every sea and ocean", () => {
    expect([...shapes.keys()].sort()).toEqual(WATERS.map((w) => w.label).sort());
  });

  it("are water only: land and islands are cut out", () => {
    // Open sea…
    expect(inShape("Mediterranean Sea", 35, 18)).toBe(true);
    expect(inShape("Mediterranean Sea", 43, 5)).toBe(true);
    // …but not Italy, Sicily, Crete or the Sahara inside the rough outline.
    expect(inShape("Mediterranean Sea", 43, 12.5)).toBe(false);
    expect(inShape("Mediterranean Sea", 37.5, 14.2)).toBe(false);
    expect(inShape("Mediterranean Sea", 35.2, 24.9)).toBe(false);
    expect(inShape("Mediterranean Sea", 31, 15)).toBe(false);
    expect(inShape("Caribbean Sea", 18.2, -77.3)).toBe(false); // Jamaica
    expect(inShape("Caribbean Sea", 15, -75)).toBe(true);
  });

  it("leave the enclosed seas out of the oceans around them", () => {
    expect(inShape("North Atlantic", 30, -40)).toBe(true);
    expect(inShape("North Atlantic", 40, 5)).toBe(false); // western Mediterranean
    expect(inShape("North Atlantic", 57, 18)).toBe(false); // Baltic
    expect(inShape("Indian Ocean", 20, 38)).toBe(false); // Red Sea
    // Marginal seas stay part of their ocean.
    expect(inShape("North Atlantic", 25, -90)).toBe(true); // Gulf of Mexico
  });
});

describe("named regions", () => {
  it("are found by name, with or without 'the'", () => {
    expect(findNamedRegion("the Mediterranean")?.label).toBe("Mediterranean Sea");
    expect(findNamedRegion("Mediterranean Sea")?.water).toBe("sea");
    expect(findNamedRegion("pamir mountains")?.label).toBe("Pamirs");
    expect(findNamedRegion("Atlantis")).toBeNull();
  });

  it("are offered while typing", () => {
    expect(searchNamedRegions("medit").map((r) => r.label)).toEqual(["Mediterranean Sea"]);
    expect(searchNamedRegions("pacific").map((r) => r.label)).toEqual(["Western Pacific", "Eastern Pacific"]);
    expect(searchNamedRegions("aral").map((r) => r.label)).toEqual(["Aral Sea"]);
    expect(searchNamedRegions("me")).toEqual([]);
  });

  it("have a shape: a box, an outline or their countries", async () => {
    const pamirs = await regionGeometry(findNamedRegion("Pamirs")!, null);
    expect(pamirs?.type).toBe("Polygon");
    // A countries-based region needs the country outlines.
    expect(await regionGeometry(findNamedRegion("Central Asia")!, null)).toBeNull();
  });

  it("become search results that open as a region on the Analysis page", async () => {
    const place = await regionPlace(findNamedRegion("Black Sea")!);
    expect(place).toMatchObject({ name: "Black Sea", kind: "water", region: "Black Sea", source: "terrascope", bbox: [27.2, 41, 41.9, 47] });
    const href = new URL(analysisHrefForPlace(place!), "https://x.test").searchParams;
    expect([href.get("region"), href.get("osm"), href.get("lat")]).toEqual(["Black Sea", null, null]);
  });
});

describe("place search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts known seas first, with their shape, instead of OpenStreetMap's single point", async () => {
    const photon = {
      features: [
        { geometry: { coordinates: [18, 35] }, properties: { osm_type: "N", osm_id: 1, osm_key: "place", type: "sea", name: "Mediterranean Sea" } },
        { geometry: { coordinates: [14.5, 35.9] }, properties: { osm_type: "N", osm_id: 2, osm_key: "place", type: "city", name: "Mediterranean Hotel", country: "Malta" } },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(photon), { status: 200 })));
    const found = await searchPlaces("Mediterranean");
    expect(found[0]).toMatchObject({ name: "Mediterranean Sea", region: "Mediterranean Sea", kind: "water" });
    expect(found.filter((p) => p.name === "Mediterranean Sea")).toHaveLength(1);
    expect(found.map((p) => p.name)).toContain("Mediterranean Hotel");
  });
});
