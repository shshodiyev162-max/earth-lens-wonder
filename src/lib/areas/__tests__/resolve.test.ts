import { describe, expect, it } from "vitest";
import { areaKm2, bboxPolygon } from "../../geo/geometry";
import { encodeGeometry } from "../../geo/polyline";
import { combineParts, PartError, resolvePart, togetherLabel } from "../resolve";

describe("reading a part's outline", () => {
  it("draws boxes, circles and shared outlines with their names", async () => {
    const box = await resolvePart({ kind: "bbox", bbox: [60, 40, 62, 42], name: "Fields" });
    expect(box).toMatchObject({ name: "Fields", key: "bbox:60,40,62,42" });
    expect(box.areaKm2).toBeCloseTo(areaKm2(bboxPolygon([60, 40, 62, 42])), 6);

    const circle = await resolvePart({ kind: "point", lat: 40, lon: 60, radiusKm: 10 });
    expect(circle).toMatchObject({ name: "40.00°N, 60.00°E", context: "10 km radius" });
    expect(circle.areaKm2).toBeGreaterThan(300);
    expect(circle.areaKm2).toBeLessThan(330);

    const drawn = await resolvePart({ kind: "poly", poly: encodeGeometry(bboxPolygon([1, 1, 2, 2])), name: "Area 4" });
    expect(drawn.name).toBe("Area 4");
  });

  it("reads a sea as its water", async () => {
    const sea = await resolvePart({ kind: "region", label: "black sea" });
    expect(sea).toMatchObject({ name: "Black Sea", water: "sea" });
  });

  it("reads saved areas from this device, and says when one is gone", async () => {
    const geometry = bboxPolygon([0, 0, 1, 1]);
    const getArea = (id: string) => (id === "a1" ? { name: "Orchard", geometry } : undefined);
    await expect(resolvePart({ kind: "area", id: "a1" }, { getArea })).resolves.toMatchObject({ name: "Orchard", context: "Your area" });
    await expect(resolvePart({ kind: "area", id: "gone" }, { getArea })).rejects.toThrow("no longer exists on this device");
  });

  it("explains a place it doesn't know, in plain words", async () => {
    const error = await resolvePart({ kind: "region", label: "Sea of Nowhere" }).catch((e) => e);
    expect(error).toBeInstanceOf(PartError);
    expect(error.message).toBe("Sea of Nowhere isn't in TerraScope's list of known places.");
  });
});

describe("parts as one area", () => {
  it("joins names and outlines, and counts shared land once", async () => {
    const a = await resolvePart({ kind: "bbox", bbox: [60, 40, 64, 44], name: "West" });
    const b = await resolvePart({ kind: "bbox", bbox: [62, 42, 66, 46], name: "East" });
    const area = combineParts([a, b]);
    expect(area).toMatchObject({ name: "West + East", context: togetherLabel(2), bbox: [60, 40, 66, 46] });
    expect(area.areaKm2).toBeLessThan(a.areaKm2 + b.areaKm2);
    expect(area.water).toBeUndefined();
  });

  it("is water only when every part is a sea or ocean", async () => {
    const black = await resolvePart({ kind: "region", label: "Black Sea" });
    const caspian = await resolvePart({ kind: "region", label: "Caspian Sea" });
    const box = await resolvePart({ kind: "bbox", bbox: [60, 40, 61, 41] });
    expect(combineParts([black, caspian]).water).toBe("sea");
    expect(combineParts([black, box]).water).toBeUndefined();
  });
});
