import { describe, expect, it } from "vitest";
import { gridFor, rasterizeMask, statsFromPixels, summarize, wmsGetMapUrl, type RasterGrid } from "../sample";
import { getLayer, type GibsLayer } from "../catalog";
import { parseColorMapXml } from "../colormap";
import { bboxPolygon, type PolygonGeometry } from "../../geo/geometry";

const ndvi = getLayer("MODIS_Terra_L3_NDVI_Monthly") as GibsLayer;

const PALETTE = parseColorMapXml(`<ColorMaps><ColorMap title="Vegetation Indices"><Entries>
  <ColorMapEntry rgb="225,225,226" transparent="true" value="[-0.0999,0.0001)"/>
  <ColorMapEntry rgb="10,10,10" transparent="false" value="[0.1,0.2)"/>
  <ColorMapEntry rgb="20,20,20" transparent="false" value="[0.5,0.6)"/>
</Entries></ColorMap></ColorMaps>`);

function rgbaGrid(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  return data;
}

describe("gridFor", () => {
  it("matches native resolution for small areas and caps big ones", () => {
    const small = gridFor([64, 39, 65, 40], ndvi); // 1° at Level7 ≈ 91 px
    expect(small.width).toBeGreaterThan(80);
    expect(small.width).toBeLessThan(100);
    const huge = gridFor([-120, 20, -60, 50], ndvi);
    expect(Math.max(huge.width, huge.height)).toBe(320);
    const tiny = gridFor([64.4, 39.7, 64.401, 39.701], ndvi);
    expect(tiny.width).toBeGreaterThanOrEqual(12);
  });
});

describe("wmsGetMapUrl", () => {
  it("uses latitude-first BBOX for WMS 1.3.0 EPSG:4326", () => {
    const url = new URL(wmsGetMapUrl(ndvi, { bbox: [64, 39, 65, 40], width: 10, height: 10 }, "2026-08-01"));
    expect(url.searchParams.get("BBOX")).toBe("39.000000,64.000000,40.000000,65.000000");
    expect(url.searchParams.get("TIME")).toBe("2026-08-01");
    expect(url.searchParams.get("LAYERS")).toBe("MODIS_Terra_L3_NDVI_Monthly");
  });
});

describe("rasterizeMask", () => {
  const grid: RasterGrid = { bbox: [0, 0, 10, 10], width: 10, height: 10 };

  it("fills a rectangle", () => {
    const mask = rasterizeMask(bboxPolygon([0, 0, 5, 10]), grid);
    expect(mask.reduce((s, v) => s + v, 0)).toBe(50);
    expect(mask[0]).toBe(1);
    expect(mask[9]).toBe(0);
  });

  it("leaves holes empty", () => {
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
          [2, 2],
          [8, 2],
          [8, 8],
          [2, 8],
          [2, 2],
        ],
      ],
    };
    expect(rasterizeMask(donut, grid).reduce((s, v) => s + v, 0)).toBe(100 - 36);
  });

  it("always includes at least one pixel for tiny areas", () => {
    const mask = rasterizeMask(bboxPolygon([4.1, 4.1, 4.2, 4.2]), grid);
    expect(mask.reduce((s, v) => s + v, 0)).toBe(1);
  });
});

describe("statsFromPixels", () => {
  it("decodes pixels inside the mask and reports coverage", () => {
    const width = 4;
    const height = 2;
    // Left column transparent (water), next column NDVI 0.15, right half NDVI 0.55
    const rgba = rgbaGrid(width, height, (x) => (x === 0 ? [225, 225, 226, 0] : x === 1 ? [10, 10, 10, 255] : [20, 20, 20, 255]));
    const mask = new Uint8Array(width * height).fill(1);
    const stats = statsFromPixels(rgba, mask, PALETTE);
    expect(stats.total).toBe(8);
    expect(stats.count).toBe(6);
    expect(stats.coverage).toBeCloseTo(0.75, 5);
    expect(stats.mean).toBeCloseTo((0.15 * 2 + 0.55 * 4) / 6, 5);
    expect(stats.min).toBeCloseTo(0.15, 5);
    expect(stats.max).toBeCloseTo(0.55, 5);
  });

  it("summarises empty input safely", () => {
    const stats = summarize([], 10);
    expect(stats.count).toBe(0);
    expect(stats.coverage).toBe(0);
    expect(Number.isNaN(stats.mean)).toBe(true);
  });
});
