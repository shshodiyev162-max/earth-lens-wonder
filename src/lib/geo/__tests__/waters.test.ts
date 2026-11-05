import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCountryIndex, countryAt, type CountryCollection } from "../countries";
import { pointInGeometry, type PolygonGeometry } from "../geometry";
import { WATERS, WHOLE_PACIFIC, waterAt } from "../waters";

const shapes = new Map(
  (JSON.parse(readFileSync("public/data/waters.json", "utf8")) as { features: { properties: { label: string }; geometry: PolygonGeometry }[] }).features.map((f) => [
    f.properties.label,
    f.geometry,
  ]),
);
const countries = buildCountryIndex(JSON.parse(readFileSync("public/data/countries-50m.json", "utf8")) as CountryCollection);

// [latitude, longitude] of open water, and the sea or ocean a click there should pick.
const CLICKS: [string, number, number, string][] = [
  ["Adriatic", 42.5, 16, "Mediterranean Sea"],
  ["Ionian Sea", 37, 19, "Mediterranean Sea"],
  ["Levant", 33.5, 33, "Mediterranean Sea"],
  ["Sea of Marmara", 40.7, 28, "Mediterranean Sea"],
  ["Alboran Sea", 36, -3.5, "Mediterranean Sea"],
  ["Black Sea", 43, 34, "Black Sea"],
  ["Caspian Sea", 42, 51, "Caspian Sea"],
  ["Red Sea", 20, 38, "Red Sea"],
  ["Persian Gulf", 27, 51, "Persian Gulf"],
  ["Arabian Sea", 15, 65, "Arabian Sea"],
  ["Bay of Bengal", 15, 88, "Bay of Bengal"],
  ["South China Sea", 15, 113, "South China Sea"],
  ["Sea of Japan", 40, 135, "Sea of Japan"],
  ["Baltic proper", 57, 19, "Baltic Sea"],
  ["Gulf of Bothnia", 63, 20.5, "Baltic Sea"],
  ["Gulf of Finland", 60, 26, "Baltic Sea"],
  ["North Sea", 56, 3, "North Sea"],
  ["Skagerrak", 58, 9, "North Sea"],
  ["Caribbean off Jamaica", 17, -77, "Caribbean Sea"],
  ["Cayman Islands", 19, -81, "Caribbean Sea"],
  ["Gulf of Mexico", 25, -90, "Gulf of Mexico"],
  ["Bay of Campeche", 20, -94, "Gulf of Mexico"],
  ["Hudson Bay", 60, -85, "Hudson Bay"],
  ["Coral Sea", -15, 152, "Coral Sea"],
  ["Gulf of Guinea", 2, 2, "Gulf of Guinea"],
  ["Bay of Biscay", 45.5, -5, "North Atlantic"],
  ["Irish Sea", 53.8, -5, "North Atlantic"],
  ["English Channel", 50.2, -2, "North Atlantic"],
  ["Norwegian Sea", 66.5 - 1, 5, "North Atlantic"],
  ["Sargasso Sea", 30, -60, "North Atlantic"],
  ["Off Florida", 29, -80, "North Atlantic"],
  ["Off Brazil", -20, -35, "South Atlantic"],
  ["Off Namibia", -25, 12, "South Atlantic"],
  ["Off Peru", -12, -80, "Eastern Pacific"],
  ["Off Chile", -35, -75, "Eastern Pacific"],
  ["Gulf of Panama", 8, -79.3, "Eastern Pacific"],
  ["Off Costa Rica", 10, -86, "Eastern Pacific"],
  ["Off Nicaragua", 12, -88, "Eastern Pacific"],
  ["Gulf of California", 27, -111, "Eastern Pacific"],
  ["Gulf of Alaska", 57, -145, "Eastern Pacific"],
  ["Hawaii", 20, -157, "Eastern Pacific"],
  ["Off Tokyo", 35, 141.5, "Western Pacific"],
  ["Philippine Sea", 15, 130, "Western Pacific"],
  ["Tasman Sea", -40, 160, "Western Pacific"],
  ["Bering Sea", 58, 175, "Western Pacific"],
  ["Yellow Sea", 36, 124, "Western Pacific"],
  ["Gulf of Carpentaria", -15, 139, "Western Pacific"],
  ["Great Australian Bight", -35, 130, "Indian Ocean"],
  ["Gulf of Aden", 12.5, 48, "Indian Ocean"],
  ["Mozambique Channel", -20, 41, "Indian Ocean"],
  ["Timor Sea", -11.5, 126, "Indian Ocean"],
  ["Central Indian Ocean", -20, 80, "Indian Ocean"],
  ["Arctic", 80, 0, "Arctic Ocean"],
  ["Southern Ocean", -55, 0, "Southern Ocean"],
];

describe("seas and oceans on the map", () => {
  it.each(CLICKS)("a click in the %s picks the right water", (_name, lat, lon, expected) => {
    // The test points really are at sea…
    expect(countryAt(countries, [lat, lon])).toBeNull();
    // …and land in the right sea.
    expect(waterAt([lat, lon])?.label).toBe(expected);
  });

  it.each(CLICKS)("the %s is inside that water's bundled shape", (_name, lat, lon, expected) => {
    expect(pointInGeometry([lon, lat], shapes.get(expected) as PolygonGeometry)).toBe(true);
  });

  it("covers all the open water of the globe", () => {
    const gaps: string[] = [];
    for (let lat = -84; lat <= 84; lat += 3) {
      for (let lon = -178.5; lon <= 178.5; lon += 3) {
        if (countryAt(countries, [lat, lon])) continue;
        if (!waterAt([lat, lon])) gaps.push(`${lat},${lon}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("have unique names, closed outlines and a kind", () => {
    const names = WATERS.flatMap((water) => water.names);
    expect(new Set(names).size).toBe(names.length);
    for (const water of WATERS) {
      expect(water.outline[0]).toEqual(water.outline[water.outline.length - 1]);
      expect(["sea", "ocean"]).toContain(water.kind);
    }
  });

  it("know that the whole Pacific can't be one area", () => {
    for (const name of ["Pacific", "the Pacific Ocean", "North Pacific", "south pacific ocean"]) expect(WHOLE_PACIFIC.test(name)).toBe(true);
    expect(WHOLE_PACIFIC.test("western pacific")).toBe(false);
  });
});
