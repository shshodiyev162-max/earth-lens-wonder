import { describe, expect, it } from "vitest";
import { decodeGeometry, encodeGeometry, encodeGeometryForLink, MAX_LINK_OUTLINE } from "../polyline";
import { bboxOf, bboxPolygon, type PolygonGeometry, type Position } from "../geometry";

/** A jagged pixel-like outline with thousands of corners, plus many tiny islands. */
function detailedOutline(): PolygonGeometry {
  const ring: Position[] = [];
  for (let i = 0; i < 4000; i++) {
    const angle = (i / 4000) * Math.PI * 2;
    const r = 1 + (i % 2 ? 0.01 : -0.01);
    ring.push([60 + Math.cos(angle) * r, 40 + Math.sin(angle) * r]);
  }
  ring.push(ring[0]);
  const islands = Array.from({ length: 200 }, (_, k) => bboxPolygon([62 + k * 0.01, 42, 62.005 + k * 0.01, 42.005]).coordinates as Position[][]);
  return { type: "MultiPolygon", coordinates: [[ring], ...islands] };
}

describe("outlines in links", () => {
  it("keep simple outlines exactly", () => {
    const square = bboxPolygon([60, 40, 61, 41]);
    expect(encodeGeometryForLink(square)).toBe(encodeGeometry(square));
  });

  it("shrink detailed outlines to a link-friendly size, in the same place", () => {
    const geometry = detailedOutline();
    expect(encodeGeometry(geometry).length).toBeGreaterThan(MAX_LINK_OUTLINE);
    const text = encodeGeometryForLink(geometry);
    expect(text.length).toBeLessThanOrEqual(MAX_LINK_OUTLINE);
    const back = decodeGeometry(text) as PolygonGeometry;
    const [w, s, e, n] = bboxOf(back);
    expect(w).toBeCloseTo(59, 0);
    expect(s).toBeCloseTo(39, 0);
    expect(e).toBeCloseTo(61, 0);
    expect(n).toBeCloseTo(41, 0);
  });
});
