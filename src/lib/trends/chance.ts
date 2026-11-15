// The chance check: could patches like these appear without any real trend?
//
// The years a scan read are put in a different order (the same new order for every pixel) and every
// pixel is tested again. That keeps everything that could fool the test (clouds and gaps, the ups and
// downs from year to year, neighbouring pixels sharing the same weather) but takes away any real
// trend. Whatever patches still pass were made by chance. This is a permutation test on the patches
// themselves (as in cluster-based permutation tests): a real patch should be stronger than the
// strongest chance patch in nearly every shuffle. No new NASA maps are needed.

import { computePixelTrends, type PixelTrends } from "./pixels";
import { buildHotspots, hotspotOptions, type GridSpec, type HotspotFilter } from "./hotspots";
import type { PeriodPlan } from "../query/period";

/** Shuffles per check: with none beating a patch, chance makes one that strong less than 1 time in 20. */
export const CHANCE_RUNS = 19;

/** The shuffled pixel tests a check needs (only what grouping into patches reads). */
export type ShuffledTrends = Pick<PixelTrends, "width" | "height" | "change" | "slope" | "p" | "tested">;

/**
 * `runs` fixed orders of `count` years, each different from the real order, so the same scan always
 * gets the same check.
 */
export function shuffledOrders(count: number, runs = CHANCE_RUNS, seed = 20261114): number[][] {
  let state = seed >>> 0;
  const random = () => {
    // A small fixed generator (xorshift), so the orders are the same on every computer.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  const orders: number[][] = [];
  if (count < 2) return orders;
  while (orders.length < runs) {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (count > 2 && order.every((value, i) => value === i)) continue;
    orders.push(order);
  }
  return orders;
}

export interface ShuffleInput {
  yearGrids: Float32Array[];
  plan: Pick<PeriodPlan, "years" | "baseline" | "recent">;
  mask: Uint8Array;
  grid: GridSpec;
}

/** Every pixel tested again on each shuffled order of the years. */
export async function shuffledTrends(
  input: ShuffleInput,
  options: { runs?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void; chunk?: number; steps?: boolean } = {},
): Promise<ShuffledTrends[]> {
  const orders = shuffledOrders(input.plan.years.length, options.runs ?? CHANCE_RUNS);
  const out: ShuffledTrends[] = [];
  for (const order of orders) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const trends = await computePixelTrends(
      order.map((k) => input.yearGrids[k]),
      input.plan.years,
      input.plan.baseline,
      input.plan.recent,
      input.mask,
      // Tested exactly as the scan tested them (open water allows a step: lib/trends/pixels).
      { width: input.grid.width, height: input.grid.height, trend: true, steps: options.steps, signal: options.signal, chunk: options.chunk },
    );
    // Only what grouping into patches reads is kept, to spare memory.
    out.push({ width: trends.width, height: trends.height, change: trends.change, slope: trends.slope, p: trends.p, tested: true });
    options.onProgress?.(out.length, orders.length);
  }
  return out;
}

export interface ChanceCheck {
  runs: number;
  /** The strongest chance patch of each shuffle (area × size of change), 0 when none passed. */
  topScores: number[];
  /** Shuffles in which at least one patch passed. */
  runsWithPatches: number;
}

/** The patches the same filter finds in each shuffle. */
export function chanceCheck(shuffled: ShuffledTrends[], grid: GridSpec, filter: HotspotFilter, minChange: number, coarse: boolean): ChanceCheck {
  const topScores = shuffled.map((trends) => {
    const found = buildHotspots(trends, grid, { ...hotspotOptions(filter, minChange, coarse, trends), maxHotspots: 1 });
    return found[0]?.score ?? 0;
  });
  return { runs: shuffled.length, topScores, runsWithPatches: topScores.filter((score) => score > 0).length };
}

/** Shuffles whose strongest chance patch was at least as strong as this one. */
export function timesBeaten(check: ChanceCheck, score: number): number {
  return check.topScores.filter((top) => top > 0 && top >= score).length;
}

/** No shuffle made a patch this strong. */
export function beyondChance(check: ChanceCheck, score: number): boolean {
  return timesBeaten(check, score) === 0;
}

/** The whole check, to follow "Chance check:" above the list of patches. */
export function chanceSummaryText(check: ChanceCheck): string {
  const tries = `with the years shuffled ${check.runs} times`;
  if (check.runsWithPatches === 0) return `${tries}, no patch passed the same test, so these patches are not chance.`;
  return `${tries}, patches passed in ${check.runsWithPatches} of them, so some of these could be chance: each patch says whether it is stronger than chance made.`;
}

/** One patch against chance, in a sentence. */
export function hotspotChanceText(check: ChanceCheck, score: number): string {
  const beaten = timesBeaten(check, score);
  if (beaten === 0) return `Beyond chance: with the years shuffled ${check.runs} times, no patch came out this strong.`;
  return `Could be chance: with the years shuffled ${check.runs} times, a patch at least this strong came out ${beaten === 1 ? "once" : `${beaten} times`}.`;
}
