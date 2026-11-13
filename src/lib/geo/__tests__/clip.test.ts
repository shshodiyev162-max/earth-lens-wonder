import { describe, expect, it } from "vitest";
import { clipPolygon, clipRing } from "../clip";
import type { Position } from "../geometry";

/** Flat area of a ring (shoelace), whichever way round it goes. */
function flatArea(ring: Position[]): number {
  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) total += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(total / 2);
}
const polygonArea = (polygon: Position[][]) => polygon.reduce((sum, ring, i) => sum + (i === 0 ? flatArea(ring) : -flatArea(ring)), 0);
const totalArea = (parts: Position[][][]) => parts.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
const square = (w: number, s: number, e: number, n: number): Position[] => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];
const closed = (ring: Position[]) => ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];

describe("cutting a shape by another", () => {
  it("keeps the part inside, with both outlines' points", () => {
    // A 10 × 10 square cut by the line x + y = 12: the corner beyond it, a triangle with sides of 8, is inside.
    const beyond: Position[] = [
      [12, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 12],
      [12, 0],
    ];
    const parts = clipRing(square(0, 0, 10, 10), beyond);
    expect(parts).toHaveLength(1);
    expect(flatArea(parts[0])).toBeCloseTo(32, 10);
    expect(closed(parts[0])).toBe(true);
    // The square's corner and the two points where the line crosses its sides.
    expect(parts[0]).toEqual(expect.arrayContaining([[10, 10], [2, 10], [10, 2]]));
  });

  it("gives the same answer whichever way round either outline goes", () => {
    const subject = square(0, 0, 10, 10);
    const clip = square(5, -5, 15, 5);
    const expected = 25;
    expect(flatArea(clipRing(subject, clip)[0])).toBeCloseTo(expected, 10);
    expect(flatArea(clipRing([...subject].reverse(), clip)[0])).toBeCloseTo(expected, 10);
    expect(flatArea(clipRing(subject, [...clip].reverse())[0])).toBeCloseTo(expected, 10);
  });

  it("splits a shape the line crosses twice into separate parts", () => {
    // A U shape cut along y = 5 keeps its two arms.
    const u: Position[] = [
      [0, 0],
      [30, 0],
      [30, 20],
      [20, 20],
      [20, 10],
      [10, 10],
      [10, 20],
      [0, 20],
      [0, 0],
    ];
    const parts = clipRing(u, square(-5, 15, 35, 25));
    expect(parts).toHaveLength(2);
    expect(parts.map(flatArea)).toEqual([50, 50]);
  });

  it("keeps a shape that is wholly inside, and drops one that is wholly outside", () => {
    const small = square(2, 2, 3, 3);
    expect(clipRing(small, square(0, 0, 10, 10))).toEqual([small]);
    expect(clipRing(small, square(20, 20, 30, 30))).toEqual([]);
    // The cutting shape wholly inside: the land inside it is the cutting shape itself.
    expect(flatArea(clipRing(square(0, 0, 10, 10), small)[0])).toBeCloseTo(1, 10);
  });

  it("still cuts cleanly when a corner lies exactly on the line", () => {
    // The diamond's corners (5, 0) and (5, 10) lie on the line x = 5.
    const diamond: Position[] = [
      [5, 0],
      [10, 5],
      [5, 10],
      [0, 5],
      [5, 0],
    ];
    const parts = clipRing(diamond, square(5, -5, 20, 15));
    expect(parts).toHaveLength(1);
    expect(flatArea(parts[0])).toBeCloseTo(25, 4);
  });

  it("takes out the part of a hole on its side of the line", () => {
    // A 10 × 10 square with a 4 × 4 hole in the middle, cut down the middle.
    const parts = clipPolygon([square(0, 0, 10, 10), square(3, 3, 7, 7)], square(5, -5, 15, 15));
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(2);
    expect(totalArea(parts)).toBeCloseTo(50 - 8, 10);
    // A hole wholly on the other side is simply gone.
    expect(totalArea(clipPolygon([square(0, 0, 10, 10), square(1, 1, 2, 2)], square(5, -5, 15, 15)))).toBeCloseTo(50, 10);
  });
});
