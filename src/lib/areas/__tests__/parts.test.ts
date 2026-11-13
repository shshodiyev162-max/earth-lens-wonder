import { describe, expect, it } from "vitest";
import { bboxPolygon, circlePolygon } from "../../geo/geometry";
import { decodeGeometry, encodeGeometry } from "../../geo/polyline";
import {
  analysisParts,
  decodePart,
  encodePart,
  partKey,
  partLabel,
  placePart,
  primaryAnalysisPart,
  savedAreaPart,
  togglePart,
  writeAnalysisParts,
  type AreaPart,
} from "../parts";

const poly = encodeGeometry(bboxPolygon([60, 40, 61, 41]));

const EVERY_KIND: AreaPart[] = [
  { kind: "country", id: "KAZ", name: "Kazakhstan" },
  { kind: "region", label: "Black Sea" },
  { kind: "place", text: "Bukhara Region" },
  { kind: "osm", osm: "R196244", name: "Bukhara" },
  { kind: "poly", poly, name: "Area 2" },
  { kind: "point", lat: 39.7747, lon: 64.4286, radiusKm: 25, name: "Bukhara" },
  { kind: "bbox", bbox: [57.8, 43.3, 62, 47.2], name: "Aral box" },
  { kind: "area", id: "area-abc" },
];

describe("a part in the page address", () => {
  it("reads back exactly as it was written, for every kind", () => {
    for (const part of EVERY_KIND) expect(decodePart(encodePart(part))).toEqual(part);
  });

  it("keeps names with any punctuation, and leaves them out when there are none", () => {
    expect(decodePart(encodePart({ kind: "poly", poly, name: "Fields: north! (2024)" }))).toEqual({ kind: "poly", poly, name: "Fields: north! (2024)" });
    expect(encodePart({ kind: "country", id: "UZB" })).toBe("country:UZB");
  });

  it("refuses damaged entries", () => {
    for (const text of ["", "country", "country:", "country:UZBEK", "osm:123", "poly:%%%", "point:91,0,10", "point:40,60", "point:40,60,0", "bbox:5,5,1,1", "mystery:1"]) {
      expect(decodePart(text), text).toBeNull();
    }
  });

  it("tells a sea typed by name from the same sea picked on the map", () => {
    expect(partKey({ kind: "place", text: "the black sea" })).toBe(partKey({ kind: "region", label: "Black Sea" }));
    expect(partKey({ kind: "country", id: "KAZ" })).toBe(partKey({ kind: "country", id: "KAZ", name: "Kazakhstan" }));
  });

  it("has a name before its outline is loaded", () => {
    expect(EVERY_KIND.map(partLabel)).toEqual(["Kazakhstan", "Black Sea", "Bukhara Region", "Bukhara", "Area 2", "Bukhara", "Aral box", "Saved area"]);
    expect(partLabel({ kind: "point", lat: 39.7747, lon: 64.4286, radiusKm: 10 })).toBe("39.77°N, 64.43°E");
  });
});

describe("adding and taking out", () => {
  it("adds a new place and takes out one picked again", () => {
    const uzb: AreaPart = { kind: "country", id: "UZB" };
    const kaz: AreaPart = { kind: "country", id: "KAZ", name: "Kazakhstan" };
    const both = togglePart([uzb], kaz);
    expect(both).toEqual([uzb, kaz]);
    expect(togglePart(both, { kind: "country", id: "KAZ" })).toEqual([uzb]);
  });

  it("turns a search result into the right kind of part", () => {
    expect(placePart({ id: "r", name: "Black Sea", context: "Sea", kind: "water", center: [43, 34], region: "Black Sea", source: "terrascope" })).toEqual({ kind: "region", label: "Black Sea" });
    expect(placePart({ id: "o", name: "Bukhara Region", context: "Uzbekistan", kind: "state", center: [40, 64], osm: { type: "R", id: 196244 }, source: "nominatim" })).toMatchObject({ kind: "osm", osm: "R196244", name: "Bukhara Region" });
    expect(placePart({ id: "n", name: "Muynoq", context: "Uzbekistan", kind: "locality", center: [43.77, 59.02], osm: { type: "N", id: 1 }, source: "photon" })).toMatchObject({ kind: "point", lat: 43.77, lon: 59.02, radiusKm: 10 });
    // A country found by search is read from the bundled outline, its land only.
    expect(placePart({ id: "R148838", name: "United States", context: "", kind: "country", center: [39.8, -100.4], osm: { type: "R", id: 148838 }, country: "USA", source: "photon" })).toEqual({ kind: "country", id: "USA", name: "United States" });
  });

  it("links a saved area by name when it can, by its outline otherwise", () => {
    const geometry = bboxPolygon([60, 40, 61, 41]);
    expect(savedAreaPart({ id: "a", name: "Black Sea", geometry, region: "Black Sea" })).toEqual({ kind: "region", label: "Black Sea" });
    expect(savedAreaPart({ id: "a", name: "Libya", geometry, countryId: "LBY" })).toEqual({ kind: "country", id: "LBY", name: "Libya" });
    const drawn = savedAreaPart({ id: "a", name: "Area 1", geometry });
    expect(drawn.kind === "poly" && decodeGeometry(drawn.poly)).toEqual(geometry);
    // Too detailed for a link: kept as a saved area on this device, or simplified to fit.
    const detailed = circlePolygon([40, 60], 300, 2000);
    expect(savedAreaPart({ id: "big", name: "Ring", geometry: detailed })).toEqual({ kind: "area", id: "big" });
    const simplified = savedAreaPart({ id: "big", name: "Ring", geometry: detailed }, { local: false });
    expect(simplified.kind === "poly" && simplified.poly.length).toBeLessThanOrEqual(1800);
  });
});

describe("the Analysis page's area", () => {
  it("reads the first place from the usual keys, in the page's own order", () => {
    expect(primaryAnalysisPart(new URLSearchParams("country=uzb"))).toEqual({ kind: "country", id: "UZB", name: undefined });
    expect(primaryAnalysisPart(new URLSearchParams("lat=39.77&lon=64.42&r=25&name=Bukhara&ctx=Uzbekistan"))).toEqual({ kind: "point", lat: 39.77, lon: 64.42, radiusKm: 25, name: "Bukhara", context: "Uzbekistan" });
    expect(primaryAnalysisPart(new URLSearchParams("area=a1&country=UZB"))).toEqual({ kind: "area", id: "a1" });
    expect(primaryAnalysisPart(new URLSearchParams("ds=climate"))).toBeNull();
  });

  it("writes several places and reads them back, keeping the rest of the address", () => {
    const parts: AreaPart[] = [{ kind: "country", id: "UZB" }, { kind: "region", label: "Aral Sea" }, { kind: "poly", poly, name: "Fields" }];
    const params = writeAnalysisParts(new URLSearchParams("ds=climate&lat=1&lon=2&name=Old"), parts);
    expect(params.get("ds")).toBe("climate");
    expect([params.get("country"), params.get("lat"), params.get("name")]).toEqual(["UZB", null, null]);
    expect(params.getAll("add")).toHaveLength(2);
    expect(analysisParts(params)).toEqual([{ kind: "country", id: "UZB", name: undefined }, ...parts.slice(1)]);
  });

  it("moves the next place up when the first is taken out, and clears everything when none are left", () => {
    const params = writeAnalysisParts(new URLSearchParams(), [
      { kind: "country", id: "UZB" },
      { kind: "osm", osm: "R1", name: "Bukhara Region" },
    ]);
    const rest = writeAnalysisParts(params, analysisParts(params).slice(1));
    expect([rest.get("osm"), rest.get("name"), rest.get("country"), rest.getAll("add").length]).toEqual(["R1", "Bukhara Region", null, 0]);
    expect([...writeAnalysisParts(rest, []).keys()]).toEqual([]);
  });

  it("keeps a place typed by name as an added place, since the usual keys can't hold it", () => {
    const params = writeAnalysisParts(new URLSearchParams(), [{ kind: "place", text: "Bukhara Region" }, { kind: "country", id: "TKM" }]);
    expect(params.getAll("add")).toEqual(["place:Bukhara Region", "country:TKM"]);
    expect(analysisParts(params)).toEqual([{ kind: "place", text: "Bukhara Region" }, { kind: "country", id: "TKM" }]);
  });
});
