import { describe, expect, it } from "vitest";
import { clearOfHotspotCard } from "../cardRoom";

describe("keeping a hotspot clear of its card", () => {
  it("leaves the top of a phone's map open, above the sheet", () => {
    const { topLeft, bottomRight } = clearOfHotspotCard({ width: 375, height: 812 });
    expect(bottomRight[1]).toBe(461);
    // The map starts under the 64 px navigation bar: real room must remain for the hotspot.
    const room = 812 - 64 - topLeft[1] - bottomRight[1];
    expect(room).toBeGreaterThan(150);
  });

  it("keeps to the right of the card on a large screen", () => {
    const { topLeft, bottomRight } = clearOfHotspotCard({ width: 1280, height: 800 });
    expect(topLeft[0]).toBeGreaterThanOrEqual(64 + 384);
    // The map beside the 24rem panel is 896 px wide.
    expect(896 - topLeft[0] - bottomRight[0]).toBeGreaterThan(300);
  });
});
