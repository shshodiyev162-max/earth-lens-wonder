import { describe, expect, it } from "vitest";
import { computePixelTrends, meanOfGrids, seasonMeanGrids } from "../pixels";
import { buildHotspots, clusterPixels, flagPixels, pixelAreaKm2, simplifyRing, traceOutline, type GridSpec } from "../hotspots";
import { polygonsOf, type Position } from "../../geo/geometry";

const W = 10;
const H = 10;
const GRID: GridSpec = { bbox: [60, 40, 70, 50], width: W, height: H };
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

/** Yearly grids: flat 0.4 everywhere with tiny wobble, plus blocks that trend by `rate` per year. */
function yearGrids(blocks: { rows: [number, number]; cols: [number, number]; rate: number }[]): Float32Array[] {
  return YEARS.map((year, k) => {
    const grid = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) grid[i] = 0.4 + (((i * 7 + k * 3) % 5) - 2) * 0.001;
    for (const block of blocks) {
      for (let r = block.rows[0]; r <= block.rows[1]; r++) for (let c = block.cols[0]; c <= block.cols[1]; c++) grid[r * W + c] = 0.4 + block.rate * (year - 2015);
    }
    return grid;
  });
}

const ALL = new Uint8Array(W * H).fill(1);
const run = (grids: Float32Array[], trend = true) => computePixelTrends(grids, YEARS, [2015, 2017], [2022, 2024], ALL, { width: W, height: H, trend });

describe("season means", () => {
  it("average the season's months and need half of them", () => {
    const a = new Float32Array([1, NaN]);
    const b = new Float32Array([3, NaN]);
    const c = new Float32Array([NaN, 5]);
    expect(Array.from(meanOfGrids([a, b, c], 2, 2))).toEqual([2, NaN]);
    const months = new Map([
      ["2020-06", a],
      ["2020-07", b],
      ["2020-08", c],
    ]);
    expect(Array.from(seasonMeanGrids(months, [2020], [6, 7, 8], 2)[0])).toEqual([2, NaN]);
  });
});

describe("computePixelTrends", () => {
  it("measures change, Sen's slope and significance per pixel", async () => {
    const trends = await run(yearGrids([{ rows: [2, 4], cols: [2, 4], rate: -0.02 }]));
    const inside = 3 * W + 3;
    expect(trends.change[inside]).toBeCloseTo(-0.02 * 7, 5);
    expect(trends.slope[inside]).toBeCloseTo(-0.02, 6);
    expect(trends.p[inside]).toBeLessThan(0.001);
    const outside = 8 * W + 8;
    expect(Math.abs(trends.change[outside])).toBeLessThan(0.005);
    expect(trends.p[outside]).toBeGreaterThan(0.05);
  });

  it("skips pixels outside the mask and with too little data", async () => {
    const grids = yearGrids([]);
    for (const grid of grids.slice(0, 7)) grid[0] = NaN;
    const mask = new Uint8Array(W * H).fill(1);
    mask[1] = 0;
    const trends = await computePixelTrends(grids, YEARS, [2015, 2017], [2022, 2024], mask, { width: W, height: H, trend: true });
    expect(trends.change[0]).toBeNaN();
    expect(trends.slope[0]).toBeNaN();
    expect(trends.change[1]).toBeNaN();
  });

  it("compares two seasons without a trend test", async () => {
    const trends = await run(yearGrids([{ rows: [0, 1], cols: [0, 1], rate: 0.01 }]), false);
    expect(trends.change[0]).toBeCloseTo(0.07, 5);
    expect(trends.slope[0]).toBeNaN();
  });
});

describe("hotspots", () => {
  it("flags and clusters the pixels that changed", async () => {
    const trends = await run(yearGrids([{ rows: [2, 4], cols: [2, 4], rate: -0.02 }]));
    const flags = flagPixels(trends, -1, 0.02);
    const clusters = clusterPixels(flags, W, H);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(9);
    expect(flagPixels(trends, 1, 0.02).some(Boolean)).toBe(false);
  });

  it("rank by area times change and keep both signs for 'any change'", async () => {
    const trends = await run(
      yearGrids([
        { rows: [0, 1], cols: [0, 1], rate: -0.02 },
        { rows: [5, 9], cols: [5, 9], rate: -0.01 },
        { rows: [0, 2], cols: [7, 9], rate: 0.03 },
      ]),
    );
    const declines = buildHotspots(trends, GRID, { direction: "decline", minChange: 0.02 });
    expect(declines).toHaveLength(2);
    expect(declines[0].pixels).toHaveLength(25);
    expect(declines[0]).toMatchObject({ rank: 1, id: "h1", sign: -1 });
    expect(declines[0].meanChange).toBeCloseTo(-0.07, 5);
    expect(declines[0].significantShare).toBe(1);
    const any = buildHotspots(trends, GRID, { direction: "any", minChange: 0.02 });
    expect(any.map((h) => h.sign).sort()).toEqual([-1, -1, 1]);
  });

  it("measures area with latitude", () => {
    const equator: GridSpec = { bbox: [0, -0.5, 1, 0.5], width: 1, height: 1 };
    expect(pixelAreaKm2(equator, 0)).toBeCloseTo(12309, -1);
    const north: GridSpec = { bbox: [0, 59.5, 1, 60.5], width: 1, height: 1 };
    expect(pixelAreaKm2(north, 0)).toBeCloseTo(12309 * 0.5, -2);
  });
});

describe("traceOutline", () => {
  const grid: GridSpec = { bbox: [0, 0, 4, 4], width: 4, height: 4 };
  const ringCount = (pixels: number[]) => polygonsOf(traceOutline(pixels, grid)).map((p) => p.length);

  it("outlines one pixel as a closed counter-clockwise square", () => {
    const outline = traceOutline([5], grid);
    expect(outline.type).toBe("Polygon");
    const ring = (outline as { coordinates: Position[][] }).coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring.slice(0, 4).map(([x, y]) => `${x},${y}`).sort()).toEqual(["1,2", "1,3", "2,2", "2,3"]);
    let area = 0;
    for (let i = 0; i < 4; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    expect(area).toBeGreaterThan(0);
  });

  it("keeps only the corners of an L shape", () => {
    const outline = traceOutline([0, 4, 5], grid);
    expect((outline as { coordinates: Position[][] }).coordinates[0]).toHaveLength(7);
  });

  it("keeps a hole as an inner ring", () => {
    expect(ringCount([0, 1, 2, 4, 6, 8, 9, 10])).toEqual([2]);
  });

  it("splits pixels that only touch at a corner", () => {
    expect(ringCount([0, 5])).toEqual([1, 1]);
  });

  it("simplifies without opening the ring", () => {
    const ring: Position[] = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [2, 1],
      [1, 1.01],
      [0, 1],
      [0, 0],
    ];
    const simple = simplifyRing(ring, 0.05);
    expect(simple.length).toBeLessThan(ring.length);
    expect(simple[0]).toEqual(simple[simple.length - 1]);
  });
});
