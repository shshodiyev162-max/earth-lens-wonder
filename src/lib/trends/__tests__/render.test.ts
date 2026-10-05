import { describe, expect, it } from "vitest";
import { changeImage, changeScale, colorizer, frameImage, hexToRgb, niceNumber, toMercator } from "../render";
import { INDICATORS } from "../../query/indicators";
import type { PixelTrends } from "../pixels";

function trends(slopes: number[], ps: number[]): PixelTrends {
  const n = slopes.length;
  return {
    width: n,
    height: 1,
    baselineMean: new Float32Array(n),
    recentMean: new Float32Array(n),
    change: Float32Array.from(slopes.map((s) => s * 8)),
    slope: Float32Array.from(slopes),
    p: Float32Array.from(ps),
  };
}

describe("colour scales", () => {
  it("round to nice numbers", () => {
    expect(niceNumber(0.013)).toBe(0.02);
    expect(niceNumber(0.21)).toBeCloseTo(0.25, 10);
    expect(niceNumber(3.7)).toBe(5);
    expect(niceNumber(70)).toBe(100);
  });

  it("read hex colours", () => {
    expect(hexToRgb("#b45309")).toEqual([180, 83, 9]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });

  it("use trends per decade and ignore one extreme pixel", () => {
    const slopes = [...Array(99).fill(-0.002), -1];
    const scale = changeScale(trends(slopes, slopes.map(() => 0.01)), INDICATORS.vegetation, true);
    expect(scale.mode).toBe("perDecade");
    expect(scale.unit).toBe("NDVI per decade");
    expect(scale.max).toBe(0.02);
  });

  it("draw declines and increases in the indicator's colours, faded when not significant", () => {
    const t = trends([-0.01, 0.01, 0.01, NaN], [0.001, 0.001, 0.5, NaN]);
    const scale = changeScale(t, INDICATORS.vegetation, true);
    const image = changeImage(t, scale);
    expect(Array.from(image.slice(0, 3))).toEqual(hexToRgb(INDICATORS.vegetation.colors.decline));
    expect(Array.from(image.slice(4, 7))).toEqual(hexToRgb(INDICATORS.vegetation.colors.increase));
    expect(image[11]).toBeLessThan(image[7]);
    expect(image[15]).toBe(0);
  });
});

describe("frames", () => {
  it("interpolate between legend stops", () => {
    const color = colorizer([
      { value: 0, color: [0, 0, 0] },
      { value: 1, color: [200, 100, 0] },
    ]);
    expect(color(0.5)).toEqual([100, 50, 0]);
    expect(color(-5)).toEqual([0, 0, 0]);
    expect(color(5)).toEqual([200, 100, 0]);
  });

  it("only draw pixels inside the mask with data", () => {
    const image = frameImage(new Float32Array([0.5, 0.5, NaN]), new Uint8Array([1, 0, 1]), () => [10, 20, 30]);
    expect(Array.from(image)).toEqual([10, 20, 30, 220, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("toMercator", () => {
  it("keeps rows in order and stretches towards the pole", () => {
    const grid = { bbox: [0, 0, 1, 60] as [number, number, number, number], width: 1, height: 60 };
    const rgba = new Uint8ClampedArray(60 * 4);
    for (let row = 0; row < 60; row++) rgba[row * 4] = row;
    const out = toMercator(rgba, grid);
    expect(out.height).toBeGreaterThanOrEqual(60);
    const rows = Array.from({ length: out.height }, (_, j) => out.data[j * 4]);
    expect(rows[0]).toBe(0);
    expect(rows[rows.length - 1]).toBe(59);
    expect(rows.every((v, i) => i === 0 || v >= rows[i - 1])).toBe(true);
    // Northern rows take up more of the image than southern ones.
    const northern = rows.filter((r) => r < 10).length;
    const southern = rows.filter((r) => r >= 50).length;
    expect(northern).toBeGreaterThan(southern);
  });
});
