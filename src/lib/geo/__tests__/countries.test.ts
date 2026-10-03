import { describe, expect, it } from "vitest";
import { buildCountryIndex, countryAt, findCountry, type CountryCollection } from "../countries";

const square = (w: number, s: number, e: number, n: number) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];

// A big country with a hole, a small country filling the hole, and an island nation.
const collection: CountryCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "BIG", name: "Bigland" }, geometry: { type: "Polygon", coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] } },
    { type: "Feature", properties: { id: "ENC", name: "Enclavia" }, geometry: { type: "Polygon", coordinates: [square(4, 4, 6, 6)] } },
    {
      type: "Feature",
      properties: { id: "ISL", name: "Islands" },
      geometry: { type: "MultiPolygon", coordinates: [[square(20, 0, 21, 1)], [square(22, 0, 23, 1)]] },
    },
  ],
};
const index = buildCountryIndex(collection);

describe("countryAt", () => {
  it("finds the country under a point ([lat, lon])", () => {
    expect(countryAt(index, [2, 2])?.name).toBe("Bigland");
    expect(countryAt(index, [0.5, 22.5])?.name).toBe("Islands");
  });

  it("picks the enclave, not the country around it", () => {
    expect(countryAt(index, [5, 5])?.id).toBe("ENC");
  });

  it("returns nothing over the sea", () => {
    expect(countryAt(index, [0.5, 21.5])).toBeNull();
    expect(countryAt(index, [-30, -30])).toBeNull();
  });
});

describe("findCountry", () => {
  it("looks a country up by its code, in any case", () => {
    expect(findCountry(index, "isl")?.name).toBe("Islands");
    expect(findCountry(index, "XXX")).toBeNull();
  });

  it("keeps each country's bounding box", () => {
    expect(findCountry(index, "ISL")?.bbox).toEqual([20, 0, 23, 1]);
  });
});
