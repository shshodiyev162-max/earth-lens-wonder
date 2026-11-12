import { describe, expect, it } from "vitest";
import { combineGeometries, combinedAreaKm2, combinedName, coverCells } from "../combine";
import { areaKm2, bboxPolygon, circlePolygon, pointInGeometry, polygonsOf } from "../geometry";

const box = (w: number, s: number, e: number, n: number) => bboxPolygon([w, s, e, n]);

describe("places added together", () => {
  it("keep every part, islands and all", () => {
    const islands = combineGeometries([box(0, 0, 1, 1), box(2, 0, 3, 1)]);
    const shape = combineGeometries([islands, box(10, 10, 11, 11)]);
    expect(shape.type).toBe("MultiPolygon");
    expect(polygonsOf(shape)).toHaveLength(3);
    expect(combineGeometries([box(0, 0, 1, 1)]).type).toBe("Polygon");
  });

  it("are named together, briefly when there are many", () => {
    expect(combinedName(["Uzbekistan", "Kazakhstan"])).toBe("Uzbekistan + Kazakhstan");
    expect(combinedName(["A", "B", "C"])).toBe("A + B + C");
    expect(combinedName(["A", "B", "C", "D", "E"])).toBe("A + B + 3 more");
    expect(combinedName(["Area 1", "Area 1"])).toBe("Area 1");
  });

  it("add up when they don't overlap, even when they share a border", () => {
    const west = box(60, 40, 62, 42);
    const east = box(62, 40, 64, 42);
    expect(combinedAreaKm2([west, east])).toBeCloseTo(areaKm2(west) + areaKm2(east), 6);
    const far = box(100, 10, 101, 11);
    expect(combinedAreaKm2([west, far])).toBeCloseTo(areaKm2(west) + areaKm2(far), 6);
  });

  it("count shared land once", () => {
    const a = box(60, 40, 64, 44);
    const b = box(62, 42, 66, 46);
    const shared = areaKm2(box(62, 42, 64, 44));
    const together = combinedAreaKm2([a, b]);
    expect(Math.abs(together - (areaKm2(a) + areaKm2(b) - shared)) / together).toBeLessThan(0.003);
    // A place inside another adds nothing.
    const inner = circlePolygon([42, 62], 50);
    expect(Math.abs(combinedAreaKm2([a, inner]) - areaKm2(a)) / areaKm2(a)).toBeLessThan(0.003);
  });

  it("are inside wherever any part is, including where parts overlap", () => {
    const shape = combineGeometries([box(0, 0, 4, 4), box(2, 2, 6, 6)]);
    expect(pointInGeometry([3, 3], shape)).toBe(true);
    expect(pointInGeometry([5, 1], shape)).toBe(false);
  });
});

describe("coverCells", () => {
  const grid = { bbox: [0, 0, 10, 10] as [number, number, number, number], width: 10, height: 10 };
  const count = (cells: Uint8Array) => cells.reduce((sum, v) => sum + v, 0);

  it("fills overlapping parts once, never leaving a hole where they meet", () => {
    const cells = coverCells(combineGeometries([box(0, 0, 6, 6), box(4, 4, 10, 10)]), grid);
    // 36 + 36 − the 2×2 they share
    expect(count(cells)).toBe(68);
    expect(cells[5 * 10 + 5]).toBe(1);
  });

  it("still leaves a polygon's own holes empty", () => {
    const ring = (w: number, s: number, e: number, n: number) => polygonsOf(box(w, s, e, n))[0][0];
    const donut = { type: "Polygon" as const, coordinates: [ring(0, 0, 10, 10), ring(3, 3, 7, 7)] };
    expect(count(coverCells(donut, grid))).toBe(100 - 16);
  });
});
