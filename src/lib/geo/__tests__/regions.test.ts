import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCountryIndex, findCountry, type CountryCollection } from "../countries";
import { matchCountry } from "../countryNames";
import { countryOnContinent, type ContinentId } from "../continents";
import { bboxOf, pointInGeometry, type PolygonGeometry } from "../geometry";
import { searchPlaces } from "../geocode";
import { findNamedRegion, isContinent, NAMED_REGIONS, regionBBox, regionGeometry, regionNote, regionPlace, searchNamedRegions } from "../regions";
import { WATERS } from "../waters";
import { analysisHrefForPlace } from "../../links";
import { resolveArea } from "../../trends/place";

const COUNTRIES_FILE = readFileSync("public/data/countries-50m.json", "utf8");
const countries = buildCountryIndex(JSON.parse(COUNTRIES_FILE) as CountryCollection);

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

describe("continents and regions made of countries", () => {
  /** Whether the region's land includes the point. */
  const inside = async (label: string, lat: number, lon: number) => pointInGeometry([lon, lat], (await regionGeometry(findNamedRegion(label)!, countries))!);

  it("name only real countries, and only continents those countries reach", () => {
    for (const region of NAMED_REGIONS) {
      for (const entry of region.countries ?? []) {
        const [code, continent] = entry.split(":");
        expect(findCountry(countries, code), `${region.label}: ${code}`).not.toBeNull();
        if (continent) expect(countryOnContinent(countries, code, continent as ContinentId), `${region.label}: ${entry}`).not.toBeNull();
      }
      for (const code of region.except ?? []) expect(findCountry(countries, code), `${region.label}: ${code}`).not.toBeNull();
      expect(new Set(region.names).size, region.label).toBe(region.names.length);
    }
  });

  it("each have land, a box that doesn't wrap around the globe, and a name of their own", async () => {
    const names = new Map<string, string>();
    for (const region of NAMED_REGIONS) {
      for (const name of [region.label.toLowerCase(), ...region.names]) {
        const key = name.replace(/^the\s+/, "");
        expect(names.get(key) ?? region.label, `"${key}" names two places`).toBe(region.label);
        names.set(key, region.label);
      }
      if (region.water) continue;
      const geometry = await regionGeometry(region, countries);
      expect(geometry, region.label).not.toBeNull();
      // Land on both sides of the 180° line would make the scan's box go round the whole globe.
      const [west, , east] = bboxOf(geometry!);
      expect(west > -179 || east < 179, region.label).toBe(true);
    }
  });

  it("find continents and regions by their usual names", () => {
    expect(isContinent(findNamedRegion("Europe")!)).toBe(true);
    expect(findNamedRegion("the Americas")?.label).toBe("The Americas");
    expect(findNamedRegion("EU")?.label).toBe("European Union");
    expect(findNamedRegion("South-East Asia")?.label).toBe("Southeast Asia");
    // "Caribbean" is the sea; its islands are a region of their own.
    expect(findNamedRegion("Caribbean")?.water).toBe("sea");
    expect(findNamedRegion("West Indies")?.label).toBe("Caribbean islands");
    // A country with a region's name stays the country.
    expect(findNamedRegion("South Africa")).toBeNull();
    expect(findNamedRegion("Australia")).toBeNull();
  });

  it("are offered first while typing", () => {
    expect(searchNamedRegions("europe").map((r) => r.label)).toEqual(["Europe", "European Union", "European Russia"]);
    // Whole words before letters inside a word: Central Asia before Eurasia or Australasia.
    expect(searchNamedRegions("asia").map((r) => r.label)).toEqual(["Asia", "Central Asia", "Western Asia"]);
    expect(searchNamedRegions("africa", 8).map((r) => r.label)).not.toContain("Oceania");
    expect(searchNamedRegions("south america").map((r) => r.label)).toEqual(["South America"]);
  });

  it("know the big deserts and forests that OpenStreetMap has only as a point", () => {
    expect(searchNamedRegions("sahara").map((r) => r.label)).toEqual(["Sahara", "Sub-Saharan Africa"]);
    for (const [name, lat, lon] of [
      ["Sahara", 23.4, 5.5],
      ["Gobi Desert", 42.6, 103.4],
      ["Taklamakan Desert", 38.9, 82.2],
      ["Thar Desert", 27.0, 71.5],
      ["Kalahari Desert", -23.0, 22.0],
      ["Atacama Desert", -24.5, -69.3],
      ["Congo Basin", 0.0, 21.0],
    ] as const) {
      const region = findNamedRegion(name);
      expect(region?.bbox, name).toBeDefined();
      const [west, south, east, north] = region?.bbox ?? [0, 0, 0, 0];
      expect(lon > west && lon < east && lat > south && lat < north, name).toBe(true);
      expect(regionNote(region as NonNullable<typeof region>), name).toMatch(/box around it/);
    }
    // A region drawn from countries says nothing about a box.
    expect(regionNote(findNamedRegion("Central Asia") as NonNullable<ReturnType<typeof findNamedRegion>>)).toBeUndefined();
  });

  it("make Europe its countries, with Russia, Kazakhstan and Turkey only west of the line", async () => {
    for (const [lat, lon] of [
      [48.86, 2.35], // Paris
      [55.75, 37.62], // Moscow
      [41.03, 28.95], // Istanbul's European side
      [64.15, -21.94], // Reykjavík
    ]) {
      expect(await inside("Europe", lat, lon), `${lat}, ${lon}`).toBe(true);
    }
    for (const [lat, lon] of [
      [56.84, 60.61], // Yekaterinburg
      [39.93, 32.86], // Ankara
      [41.72, 44.79], // Tbilisi
      [4.92, -52.33], // Cayenne, French Guiana
      [33.9, -6.9], // Morocco
    ]) {
      expect(await inside("Europe", lat, lon), `${lat}, ${lon}`).toBe(false);
    }
    expect(await inside("Asia", 56.84, 60.61)).toBe(true);
    expect(await inside("Asia", 55.75, 37.62)).toBe(false);
    // The box to scan is the land's own extent, not a box drawn around the continent.
    expect(regionBBox(findNamedRegion("Europe")!, countries)!.map((v) => Math.round(v))).toEqual([-31, 28, 69, 82]);
  });

  it("keep a region's countries to the right continent", async () => {
    expect(await inside("Eastern Europe", 55.75, 37.62)).toBe(true); // Moscow
    expect(await inside("Eastern Europe", 55.03, 82.92)).toBe(false); // Novosibirsk
    expect(await inside("Siberia", 55.03, 82.92)).toBe(true);
    expect(await inside("Western Europe", 48.86, 2.35)).toBe(true);
    expect(await inside("Western Europe", 4.92, -52.33)).toBe(false); // French Guiana
    expect(await inside("Caribbean islands", 14.64, -61.02)).toBe(true); // Martinique
    expect(await inside("Sub-Saharan Africa", -1.29, 36.82)).toBe(true); // Nairobi
    expect(await inside("Sub-Saharan Africa", 30.04, 31.24)).toBe(false); // Cairo
    expect(await inside("Middle East", 31.9, 35.2)).toBe(true); // Palestine is part of it
  });

  it("are scanned as their land, with their own name", async () => {
    const europe = await resolveArea("Europe", { countries });
    expect(europe).toMatchObject({ name: "Europe", context: "Continent", kind: "region", region: "Europe" });
    expect(europe.water).toBeUndefined();
    expect(pointInGeometry([37.62, 55.75], europe.geometry)).toBe(true);
    expect(pointInGeometry([60.61, 56.84], europe.geometry)).toBe(false);
  });
});

describe("place search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the continent's land first, instead of OpenStreetMap's single point", async () => {
    const photon = {
      features: [
        { geometry: { coordinates: [9.1, 53.0] }, properties: { osm_type: "N", osm_id: 3, osm_key: "place", osm_value: "continent", type: "other", name: "Europe", extent: [-25, 72, 45, 34] } },
        { geometry: { coordinates: [13.4, 52.5] }, properties: { osm_type: "N", osm_id: 4, osm_key: "amenity", type: "house", name: "Europa-Center", city: "Berlin" } },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => new Response(String(url).includes("countries-50m") ? COUNTRIES_FILE : JSON.stringify(photon), { status: 200 })),
    );
    const found = await searchPlaces("Europe");
    expect(found[0]).toMatchObject({ name: "Europe", region: "Europe", kind: "region", context: "Continent" });
    expect(found[0].bbox?.map((v) => Math.round(v))).toEqual([-31, 28, 69, 82]);
    expect(found.filter((p) => p.name === "Europe")).toHaveLength(1);
  });

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

  it("reads a country found by search from the bundled outline, by its OpenStreetMap name", () => {
    for (const [name, code] of [
      ["United States", "USA"],
      ["Côte d'Ivoire", "CIV"],
      ["Timor-Leste", "TLS"],
      ["Tanzania", "TZA"],
      ["Türkiye", "TUR"],
      ["The Bahamas", "BHS"],
      ["Eswatini", "SWZ"],
      ["Czechia", "CZE"],
      ["Democratic Republic of the Congo", "COD"],
      ["Uzbekistan", "UZB"],
    ] as const) {
      expect(matchCountry(countries, name)?.id, name).toBe(code);
    }
    const usa = { id: "R148838", name: "United States", context: "", kind: "country" as const, center: [39.8, -100.4] as [number, number], osm: { type: "R" as const, id: 148838 }, country: "USA", source: "photon" as const };
    const href = new URL(analysisHrefForPlace(usa), "https://x.test").searchParams;
    expect([href.get("country"), href.get("osm")]).toEqual(["USA", null]);
  });
});
