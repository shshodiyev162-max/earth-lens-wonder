import { describe, expect, it } from "vitest";
import { areaKm2, bboxOf, bboxPolygon, centroidOf, circlePolygon, formatArea, haversineKm, interiorPoint, pointInGeometry, representativePoints, type PolygonGeometry } from "../geometry";

describe("geometry", () => {
  it("computes geodesic areas", () => {
    // A 1°×1° cell at the equator is ~12,364 km².
    expect(areaKm2(bboxPolygon([0, 0, 1, 1]))).toBeGreaterThan(12_300);
    expect(areaKm2(bboxPolygon([0, 0, 1, 1]))).toBeLessThan(12_400);
    // The same cell at 60°N is roughly half as large.
    const north = areaKm2(bboxPolygon([0, 60, 1, 61]));
    expect(north).toBeGreaterThan(6_000);
    expect(north).toBeLessThan(6_300);
  });

  it("builds circles with the expected area", () => {
    const circle = circlePolygon([39.77, 64.42], 10);
    expect(areaKm2(circle)).toBeGreaterThan(Math.PI * 100 * 0.99);
    expect(areaKm2(circle)).toBeLessThan(Math.PI * 100 * 1.01);
    const [w, s, e, n] = bboxOf(circle);
    expect(haversineKm([s, (w + e) / 2], [n, (w + e) / 2])).toBeCloseTo(20, 0);
  });

  it("handles holes in point-in-polygon tests and areas", () => {
    const donut: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    };
    expect(pointInGeometry([1, 1], donut)).toBe(true);
    expect(pointInGeometry([5, 5], donut)).toBe(false);
    expect(pointInGeometry([11, 5], donut)).toBe(false);
    expect(areaKm2(donut)).toBeLessThan(areaKm2(bboxPolygon([0, 0, 10, 10])));
    // The centroid of a donut is in its hole; interiorPoint must not be.
    const [lat, lon] = interiorPoint(donut);
    expect(pointInGeometry([lon, lat], donut)).toBe(true);
  });

  it("finds centroids and representative points", () => {
    const [lat, lon] = centroidOf(bboxPolygon([60, 40, 70, 44]));
    expect(lat).toBeCloseTo(42, 5);
    expect(lon).toBeCloseTo(65, 5);
    expect(representativePoints(bboxPolygon([60, 40, 70, 44]), 5)).toHaveLength(5);
    expect(representativePoints(bboxPolygon([60, 40, 70, 44]), 1)).toHaveLength(1);
  });

  it("spreads sample points across irregular shapes", () => {
    // An L-shaped area: the 2×2 quarter points of its bbox mostly fall outside.
    const shape: PolygonGeometry = {
      type: "Polygon",
      coordinates: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]]],
    };
    const points = representativePoints(shape, 5);
    expect(points).toHaveLength(5);
    for (const [lat, lon] of points) expect(pointInGeometry([lon, lat], shape)).toBe(true);
    // Both arms of the L are sampled.
    expect(points.some(([lat]) => lat > 6)).toBe(true);
    expect(points.some(([, lon]) => lon > 6)).toBe(true);
  });

  it("formats areas for people", () => {
    expect(formatArea(0.5)).toBe("50 ha");
    expect(formatArea(12.34)).toBe("12.3 km²");
    expect(formatArea(4321)).toBe("4,321 km²");
    expect(formatArea(447_400)).toBe("447k km²");
  });
});
