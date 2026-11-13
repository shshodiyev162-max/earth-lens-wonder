import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCountryIndex, type CountryCollection } from "../countries";
import { CONTINENT_OF, continentLand, countryOnContinent, LEFT_OUT, type ContinentId } from "../continents";
import { areaKm2, bboxOf, pointInGeometry, polygonsOf } from "../geometry";

const index = buildCountryIndex(JSON.parse(readFileSync("public/data/countries-50m.json", "utf8")) as CountryCollection);
const ALL: ContinentId[] = ["europe", "asia", "africa", "northAmerica", "southAmerica", "oceania"];
const whole = (id: string) => areaKm2(index.countries.find((c) => c.id === id)!.geometry);
const partKm2 = (id: string, continent: ContinentId) => {
  const land = countryOnContinent(index, id, continent);
  return land ? areaKm2(land) : 0;
};
/** The continents whose land includes the point. */
const continentsAt = (lat: number, lon: number) => ALL.filter((c) => pointInGeometry([lon, lat], continentLand(index, c)!));

describe("continents", () => {
  it("place every country on the map, or say why it is left out", () => {
    const codes = index.countries.map((c) => c.id).sort();
    expect(Object.keys(CONTINENT_OF).sort()).toEqual(codes);
    for (const [code, continent] of Object.entries(CONTINENT_OF)) {
      if (continent === null) expect(LEFT_OUT[code], code).toBeTruthy();
    }
  });

  it("have about the sizes usually quoted for them", () => {
    // The usual figures differ a little between sources, and the map's coastlines are simplified.
    const quoted: Record<ContinentId, number> = { europe: 10.18e6, asia: 44.58e6, africa: 30.37e6, northAmerica: 24.71e6, southAmerica: 17.84e6, oceania: 8.53e6 };
    for (const continent of ALL) {
      const km2 = areaKm2(continentLand(index, continent)!);
      expect(Math.abs(km2 / quoted[continent] - 1), continent).toBeLessThan(0.04);
    }
  });

  it("cut Russia where Europe meets Asia: the Urals and the Ural River", () => {
    const europe = partKm2("RUS", "europe");
    // European Russia is usually given as about 3.95 million km².
    expect(europe).toBeGreaterThan(3.85e6);
    expect(europe).toBeLessThan(4.05e6);
    // The two sides add up to the whole country, less Chukotka's tip across the 180° line.
    const missing = whole("RUS") - europe - partKm2("RUS", "asia");
    expect(missing).toBeGreaterThan(0);
    expect(missing / whole("RUS")).toBeLessThan(0.01);

    const sides: [string, number, number, ContinentId][] = [
      ["Moscow", 55.75, 37.62, "europe"],
      ["Perm", 58.01, 56.25, "europe"],
      ["Ufa", 54.74, 55.97, "europe"],
      ["Vorkuta", 67.5, 64.03, "europe"],
      ["Zlatoust", 55.17, 59.67, "europe"],
      ["Kaliningrad", 54.71, 20.51, "europe"],
      ["Makhachkala", 42.98, 47.5, "europe"],
      ["Novaya Zemlya", 71.55, 52.32, "europe"],
      ["Yekaterinburg", 56.84, 60.61, "asia"],
      ["Chelyabinsk", 55.16, 61.4, "asia"],
      ["Miass", 55.05, 60.1, "asia"],
      ["Salekhard", 66.53, 66.6, "asia"],
      ["Novosibirsk", 55.03, 82.92, "asia"],
      ["Vladivostok", 43.12, 131.9, "asia"],
    ];
    for (const [name, lat, lon, side] of sides) expect(continentsAt(lat, lon), name).toEqual([side]);
  });

  it("cut Kazakhstan at the Ural River and Turkey at the Bosporus", () => {
    expect(continentsAt(49.42, 46.85)).toEqual(["europe"]); // Zhanibek, west of the Ural River
    expect(continentsAt(50.28, 57.2)).toEqual(["asia"]); // Aktobe
    expect(continentsAt(43.65, 51.17)).toEqual(["asia"]); // Aktau, across the Caspian
    expect(partKm2("KAZ", "europe") / whole("KAZ")).toBeGreaterThan(0.03);
    expect(partKm2("KAZ", "europe") / whole("KAZ")).toBeLessThan(0.08);

    expect(continentsAt(41.03, 28.95)).toEqual(["europe"]); // Istanbul, the European side
    expect(continentsAt(41.68, 26.56)).toEqual(["europe"]); // Edirne
    expect(continentsAt(39.93, 32.86)).toEqual(["asia"]); // Ankara
    // Turkey's European part, East Thrace, is about 24,000 km².
    expect(partKm2("TUR", "europe")).toBeGreaterThan(20_000);
    expect(partKm2("TUR", "europe")).toBeLessThan(28_000);
  });

  it("count the Caucasus countries and Cyprus as Asia, as the UN does", () => {
    expect(continentsAt(41.72, 44.79)).toEqual(["asia"]); // Tbilisi
    expect(continentsAt(40.18, 44.51)).toEqual(["asia"]); // Yerevan
    expect(continentsAt(35.17, 33.36)).toEqual(["asia"]); // Nicosia
    expect(continentsAt(72, -40)).toEqual(["northAmerica"]); // Greenland's ice sheet
    expect(continentsAt(64.15, -21.94)).toEqual(["europe"]); // Reykjavík
  });

  it("put lands overseas with the continent they are on", () => {
    expect(continentsAt(48.86, 2.35)).toEqual(["europe"]); // Paris
    expect(continentsAt(4.92, -52.33)).toEqual(["southAmerica"]); // Cayenne, French Guiana
    expect(continentsAt(-21.1, 55.5)).toEqual(["africa"]); // Réunion
    expect(continentsAt(14.64, -61.02)).toEqual(["northAmerica"]); // Martinique
    expect(continentsAt(12.15, -68.27)).toEqual(["northAmerica"]); // Bonaire
    expect(continentsAt(28.29, -16.6)).toEqual(["europe"]); // Tenerife stays with Spain
  });

  it("never wrap around the 180° line", () => {
    for (const continent of ALL) {
      // Land on both sides of the line would make the scan's box go round the whole globe.
      const [west, , east] = bboxOf(continentLand(index, continent)!);
      expect(west > -179 || east < 179, continent).toBe(true);
    }
    expect(bboxOf(continentLand(index, "asia")!)[2]).toBeLessThanOrEqual(180);
    expect(bboxOf(continentLand(index, "oceania")!)[0]).toBeGreaterThan(100);
    expect(continentsAt(-13.83, -171.76)).toEqual([]); // Apia, Samoa: east of the line
  });

  it("leave out remote islands that would stretch a scan over empty ocean", () => {
    expect(continentsAt(-27.12, -109.35)).toEqual([]); // Easter Island
    expect(continentsAt(-54.6, 158.9)).toEqual([]); // Macquarie Island
    expect(continentsAt(-0.7, -90.4)).toEqual(["southAmerica"]); // the Galápagos stay
    expect(bboxOf(continentLand(index, "africa")!)[1]).toBeGreaterThan(-36);
  });

  it("give no land to two continents", () => {
    for (const country of index.countries) {
      const parts = ALL.reduce((sum, continent) => sum + partKm2(country.id, continent), 0);
      expect(parts, country.id).toBeLessThanOrEqual(whole(country.id) * 1.000001 + 1);
    }
  });

  it("keep a country's land whole unless it is split on purpose", () => {
    const split = new Set(["RUS", "KAZ", "TUR", "FRA", "NLD", "USA", "CHL", "NZL", "FJI", "KIR", "AUS", "ZAF"]);
    for (const country of index.countries) {
      if (split.has(country.id) || CONTINENT_OF[country.id] === null) continue;
      const home = CONTINENT_OF[country.id] as ContinentId;
      expect(polygonsOf(countryOnContinent(index, country.id, home)!).length, country.id).toBe(polygonsOf(country.geometry).length);
    }
  });
});
