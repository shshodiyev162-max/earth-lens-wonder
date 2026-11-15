import { describe, expect, it } from "vitest";
import { beyondChance, chanceCheck, chanceSummaryText, hotspotChanceText, shuffledOrders, shuffledTrends, timesBeaten, type ChanceCheck } from "../chance";
import { buildHotspots, hotspotOptions, type GridSpec } from "../hotspots";
import { computePixelTrends } from "../pixels";

const W = 20;
const H = 20;
const GRID: GridSpec = { bbox: [60, 30, 70, 40], width: W, height: H };
const YEARS = Array.from({ length: 15 }, (_, i) => 2010 + i);
const PLAN = { years: YEARS, baseline: [2010, 2014] as [number, number], recent: [2020, 2024] as [number, number] };
const MASK = new Uint8Array(W * H).fill(1);
const CLEAR = { direction: "any" as const, minFactor: 1, minAreaKm2: 0, strict: true };

/** Year-to-year noise everywhere (fixed, so the test always sees the same numbers), plus an optional falling block. */
function yearGrids(trend: number): Float32Array[] {
  let state = 12345;
  const noise = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
  return YEARS.map((year, k) => {
    const grid = new Float32Array(W * H);
    for (let i = 0; i < grid.length; i++) grid[i] = 0.4 + noise() * 0.02;
    for (let r = 4; r < 9; r++) for (let c = 4; c < 9; c++) grid[r * W + c] += trend * k;
    return grid;
  });
}

const testOf = (grids: Float32Array[]) => computePixelTrends(grids, YEARS, PLAN.baseline, PLAN.recent, MASK, { width: W, height: H, trend: true });

describe("shuffled orders of the years", () => {
  it("are the same every time, use every year once, and never keep the real order", () => {
    const orders = shuffledOrders(15);
    expect(orders).toHaveLength(19);
    expect(shuffledOrders(15)).toEqual(orders);
    for (const order of orders) {
      expect([...order].sort((a, b) => a - b)).toEqual(YEARS.map((_, i) => i));
      expect(order.every((value, i) => value === i)).toBe(false);
    }
    expect(new Set(orders.map((order) => order.join())).size).toBe(orders.length);
    expect(shuffledOrders(1)).toEqual([]);
  });
});

describe("the chance check", () => {
  it("finds no chance patch as strong as a real, steady decline", async () => {
    const grids = yearGrids(-0.005);
    const real = await testOf(grids);
    const [patch] = buildHotspots(real, GRID, hotspotOptions(CLEAR, 0.02, false, real));
    expect(patch).toBeDefined();
    expect(patch.sign).toBe(-1);

    const shuffled = await shuffledTrends({ yearGrids: grids, plan: PLAN, mask: MASK, grid: GRID });
    expect(shuffled).toHaveLength(19);
    const check = chanceCheck(shuffled, GRID, CLEAR, 0.02, false);
    expect(check.runs).toBe(19);
    expect(beyondChance(check, patch.score)).toBe(true);
    expect(hotspotChanceText(check, patch.score)).toMatch(/^Beyond chance/);
  });

  it("finds that noise alone makes no clear patches", async () => {
    const grids = yearGrids(0);
    const check = chanceCheck(await shuffledTrends({ yearGrids: grids, plan: PLAN, mask: MASK, grid: GRID }), GRID, CLEAR, 0.02, false);
    expect(check.runsWithPatches).toBe(0);
    expect(chanceSummaryText(check)).toContain("no patch passed");
  });

  it("says how often chance beat a patch", () => {
    const check: ChanceCheck = { runs: 19, topScores: [0, 5, 12, 0, 30, ...Array(14).fill(0)], runsWithPatches: 3 };
    expect(timesBeaten(check, 10)).toBe(2);
    expect(timesBeaten(check, 40)).toBe(0);
    expect(beyondChance(check, 40)).toBe(true);
    expect(hotspotChanceText(check, 10)).toBe("Could be chance: with the years shuffled 19 times, a patch at least this strong came out 2 times.");
    expect(hotspotChanceText(check, 20)).toContain("came out once");
    expect(chanceSummaryText(check)).toContain("patches passed in 3 of them");
  });

  it("stops when asked", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(shuffledTrends({ yearGrids: yearGrids(0), plan: PLAN, mask: MASK, grid: GRID }, { signal: controller.signal })).rejects.toThrow(/Abort/);
  });
});
