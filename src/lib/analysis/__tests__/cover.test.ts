import { describe, expect, it } from "vitest";
import { COVER_HEIGHT, COVER_WIDTH, coverFrame } from "../cover";
import type { BBox } from "../../geo/geometry";

const UZBEKISTAN: BBox = [56, 37.2, 73.1, 45.6];

describe("the part of the planet on a report's cover", () => {
  it("contains the whole place", () => {
    const [w, s, e, n] = coverFrame(UZBEKISTAN);
    expect(w).toBeLessThan(UZBEKISTAN[0]);
    expect(s).toBeLessThan(UZBEKISTAN[1]);
    expect(e).toBeGreaterThan(UZBEKISTAN[2]);
    expect(n).toBeGreaterThan(UZBEKISTAN[3]);
  });

  it("has the cover's shape on the ground", () => {
    const [w, s, e, n] = coverFrame(UZBEKISTAN);
    const cos = Math.cos((((s + n) / 2) * Math.PI) / 180);
    expect(((e - w) * cos) / (n - s)).toBeCloseTo(COVER_WIDTH / COVER_HEIGHT, 0);
  });

  it("keeps the place up and to the right, clear of the headline", () => {
    const [w, s, e, n] = coverFrame(UZBEKISTAN);
    expect((UZBEKISTAN[0] + UZBEKISTAN[2]) / 2).toBeGreaterThan((w + e) / 2);
    expect((UZBEKISTAN[1] + UZBEKISTAN[3]) / 2).toBeGreaterThan((s + n) / 2);
  });

  it("shows a small place with its surroundings", () => {
    const [w, s, e, n] = coverFrame([64.4, 39.7, 64.5, 39.8]);
    expect(n - s).toBeGreaterThan(1);
    expect(e - w).toBeGreaterThan(1);
  });

  it("stays on the map for a place crossing most of the world", () => {
    const [w, s, e, n] = coverFrame([-170, -50, 170, 70]);
    expect(w).toBeGreaterThanOrEqual(-180);
    expect(e).toBeLessThanOrEqual(180);
    expect(s).toBeGreaterThanOrEqual(-90);
    expect(n).toBeLessThanOrEqual(90);
  });
});
