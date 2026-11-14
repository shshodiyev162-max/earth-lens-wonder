import { describe, expect, it } from "vitest";
import {
  annualTrendVerdict,
  carryOverFactor,
  carryOverText,
  detectabilityText,
  explainVerdict,
  falseDiscoveryThreshold,
  lag1Autocorrelation,
  mannKendall,
  yearsToDetect,
} from "../stats";
import { longerPeriodHint } from "../trend";
import { pixelTrend } from "../../trends/pixels";
import { pixelCutoff, PIXEL_SIGNIFICANCE, STRICT_P } from "../../trends/hotspots";

const years = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// A slow wave around a flat line: each year close to the one before, no trend over the whole record.
const wave = years(2000, 2025).map((year) => Math.sin((year - 2000) / 2.2));

describe("year-to-year carry-over (Yue & Wang 2004)", () => {
  it("measures how much a year follows the year before, once the trend is taken out", () => {
    const xs = years(2000, 2025);
    expect(lag1Autocorrelation(xs, wave, xs.length, 0, 0)).toBeGreaterThan(0.7);
    const alternating = xs.map((_, i) => (i % 2 ? 1 : -1));
    expect(lag1Autocorrelation(xs, alternating, xs.length, 0, 0)).toBeLessThan(-0.9);
    expect(lag1Autocorrelation(xs.slice(0, 5), wave.slice(0, 5), 5, 0, 0)).toBeNull();
  });

  it("widens the spread of the test only when the carry-over is positive and clear", () => {
    // 1 + 2 Σ (1 − k/10) 0.8^k for n = 10: 1 + 1.44 + 1.024 + 0.7168 + 0.4915 + 0.3277 + 0.2097 + 0.1258 + 0.0671 + 0.0268.
    expect(carryOverFactor(0.8, 10)).toBeCloseTo(5.4295, 4);
    // Below 1.96/√n it isn't clearly there; negative carry-over never loosens the test.
    expect(carryOverFactor(0.5, 10)).toBe(1);
    expect(carryOverFactor(-0.9, 30)).toBe(1);
    expect(carryOverFactor(null, 30)).toBe(1);
  });

  it("keeps a slow wave from passing for a trend", () => {
    // A slowly bending rise: plain Mann–Kendall is near certain, the corrected test asks for more.
    const xs = years(2000, 2015);
    const ys = xs.map((year) => Math.sin((year - 2000) / 8) + 0.05 * Math.cos(year * 7));
    const plain = mannKendall(ys);
    const verdict = annualTrendVerdict(xs, ys);
    expect(plain?.p).toBeLessThan(0.001);
    expect(verdict?.carryOver).toBeGreaterThan(0.5);
    expect(verdict?.p).toBeGreaterThan(plain?.p as number);
    expect(carryOverText(verdict!)).toMatch(/follow the year before/);
  });

  it("leaves independent years to the plain test", () => {
    const xs = years(2000, 2019);
    // A steady rise with alternating noise: no carry-over.
    const ys = xs.map((year, i) => 0.1 * (year - 2000) + (i % 2 ? 0.3 : -0.3));
    const verdict = annualTrendVerdict(xs, ys);
    expect(verdict?.carryOver).toBeNull();
    expect(verdict?.p).toBeCloseTo(mannKendall(ys)?.p as number, 12);
  });

  it("applies to every pixel's test too", () => {
    const xs = years(2000, 2015);
    const ys = xs.map((year) => Math.sin((year - 2000) / 8) + 0.05 * Math.cos(year * 7));
    const n = xs.length;
    const result = pixelTrend(Float64Array.from(xs), Float64Array.from(ys), n, new Float64Array((n * (n - 1)) / 2), new Float64Array(n));
    expect(result.p).toBeGreaterThan(mannKendall(ys)?.p as number);
    expect(result.p).toBeCloseTo(annualTrendVerdict(xs, ys)?.p as number, 6);
  });
});

describe("years needed to tell a trend (Weatherhead et al. 1998)", () => {
  it("follows the formula for one value a year", () => {
    // Values ±1 around a line rising 0.1 a year, no carry-over: σ = 1.02, n = (3.3·√12·σ/0.1)^(2/3).
    const xs = years(2000, 2019);
    const ys = xs.map((year, i) => 0.1 * (year - 2000) + (i % 2 ? 1 : -1));
    const sigma = Math.sqrt(20 / 19);
    expect(yearsToDetect(xs, ys, 0.1, -1, 0)).toBeCloseTo(((3.3 * Math.sqrt(12) * sigma) / 0.1) ** (2 / 3), 6);
    // Carry-over makes the record need to be longer; a flat trend can never be told.
    expect(yearsToDetect(xs, ys, 0.1, -1, 0.6) as number).toBeGreaterThan(yearsToDetect(xs, ys, 0.1, -1, 0) as number);
    expect(yearsToDetect(xs, ys, 0, 0, 0)).toBe(Infinity);
  });

  it("says how long a record a weak trend would need, only when it's more than the record has", () => {
    const base = { direction: "none" as const, years: 10 };
    expect(detectabilityText({ ...base, yearsNeeded: 37.2 })).toBe("At this rate, telling it from the normal ups and downs would take about 38 years of records; this one has 10.");
    expect(detectabilityText({ ...base, yearsNeeded: 8 })).toBeNull();
    expect(detectabilityText({ ...base, yearsNeeded: Infinity })).toMatch(/more than a century/);
    expect(detectabilityText({ ...base, direction: "increase", yearsNeeded: 37 })).toBeNull();
  });

  it("is told in the explanation and in the offer to test a longer record", () => {
    const xs = years(2016, 2025);
    const noise = [0.3, -0.5, 0.1, 0.4, -0.2, -0.4, 0.5, -0.1, 0.2, -0.3];
    const ys = xs.map((year, i) => 0.005 * (year - 2016) + noise[i]);
    const verdict = annualTrendVerdict(xs, ys)!;
    expect(verdict.direction).toBe("none");
    expect(verdict.yearsNeeded).toBeGreaterThan(26);
    expect(explainVerdict(verdict, "Rainfall", "mm", 1)).toMatch(/would take about \d+ years of records; this one has 10\./);
    expect(longerPeriodHint(verdict, 2016)?.text).toMatch(/even every year since 2000 \(26\) may not settle it/);
  });
});

describe("thousands of pixels at once (Benjamini–Hochberg)", () => {
  it("finds the largest p-value under its rank's share of the false discovery rate", () => {
    // Ranks 1–3 of 3 at q = 0.05: cut-offs 0.0167, 0.0333, 0.05.
    expect(falseDiscoveryThreshold([0.5, 0.001, 0.02], 0.05)).toBe(0.02);
    expect(falseDiscoveryThreshold([0.01, 0.02, 0.03, 0.04, 0.05], 0.05)).toBe(0.05);
    expect(falseDiscoveryThreshold([0.2, 0.3, NaN], 0.05)).toBe(0);
    expect(falseDiscoveryThreshold([], 0.05)).toBe(0);
  });

  it("is what Only clear trends holds pixels to, never looser than 0.05", () => {
    const p = Float32Array.from([0.001, 0.004, 0.03, 0.2, 0.6, 0.9]);
    expect(pixelCutoff({ strict: false }, { p })).toBe(PIXEL_SIGNIFICANCE);
    const cutoff = pixelCutoff({ strict: true }, { p });
    // 0.004 ≤ 2/6 · 0.05 passes, 0.03 > 3/6 · 0.05 doesn't.
    expect(cutoff).toBeGreaterThan(0.004);
    expect(cutoff).toBeLessThan(0.03);
    expect(cutoff).toBeLessThanOrEqual(STRICT_P);
    expect(pixelCutoff({ strict: true }, { p: Float32Array.from([0.3, 0.6]) })).toBe(0);
  });
});
