import { describe, expect, it } from "vitest";
import {
  annualTrendVerdict,
  anomalies,
  deseasonalize,
  explainVerdict,
  formatP,
  laggedCorrelation,
  mannKendall,
  monthIndex,
  monthlyTrendVerdict,
  normalCdf,
  normalQuantile,
  pearson,
  seasonalMannKendall,
  seasonalSenSlope,
  senSlope,
  studentTTwoSided,
  type MonthlyValue,
} from "../stats";
import { monthRange } from "../../gibs/time";

/** Deterministic pseudo-random numbers in [-0.5, 0.5). */
function noise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  };
}

function monthly(start: string, end: string, value: (month: string, t: number) => number): MonthlyValue[] {
  const first = monthIndex(start);
  return monthRange(start, end).map((month) => ({ month, value: value(month, (monthIndex(month) - first) / 12) }));
}

const season = (month: string) => Math.sin(((Number(month.slice(5, 7)) - 1) / 12) * 2 * Math.PI) * 0.2;

describe("normal and t distributions", () => {
  it("match standard table values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.645)).toBeCloseTo(0.05, 3);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.05)).toBeCloseTo(-1.644854, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
  });

  it("gives two-sided t p-values", () => {
    expect(studentTTwoSided(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(studentTTwoSided(2.0, 10)).toBeCloseTo(0.0734, 3);
    expect(studentTTwoSided(0, 5)).toBeCloseTo(1, 6);
  });
});

describe("mannKendall", () => {
  it("matches the textbook example for a rising series", () => {
    const result = mannKendall([1, 2, 3, 4, 5]);
    expect(result?.s).toBe(10);
    expect(result?.varS).toBeCloseTo(16.6667, 3);
    expect(result?.z).toBeCloseTo(2.2045, 3);
    expect(result?.p).toBeCloseTo(0.0275, 3);
    expect(result?.tau).toBe(1);
  });

  it("corrects the variance for ties", () => {
    const result = mannKendall([1, 2, 2, 3, 4]);
    expect(result?.s).toBe(9);
    expect(result?.varS).toBeCloseTo((300 - 18) / 18, 6);
  });

  it("finds no trend in a flat or alternating series", () => {
    expect(mannKendall([3, 3, 3, 3, 3])?.p).toBe(1);
    expect(mannKendall([1, 2, 1, 2, 1, 2, 1, 2])?.p).toBeGreaterThan(0.5);
  });

  it("skips missing values and needs four of them", () => {
    expect(mannKendall([1, NaN, 2, 3, NaN, 4])?.n).toBe(4);
    expect(mannKendall([1, 2, 3])).toBeNull();
  });
});

describe("senSlope", () => {
  it("recovers a straight line exactly", () => {
    const result = senSlope([0, 1, 2, 3, 4, 5], [1, 3, 5, 7, 9, 11]);
    expect(result?.slope).toBe(2);
    expect(result?.intercept).toBe(1);
    expect(result?.lower).toBe(2);
    expect(result?.upper).toBe(2);
  });

  it("ignores an outlier and brackets the slope", () => {
    const xs = Array.from({ length: 15 }, (_, i) => 2010 + i);
    const random = noise(7);
    const ys = xs.map((x, i) => 0.5 - 0.01 * (x - 2010) + random() * 0.01 + (i === 7 ? 1 : 0));
    const result = senSlope(xs, ys);
    expect(result?.slope).toBeCloseTo(-0.01, 2);
    expect(result!.lower).toBeLessThanOrEqual(result!.slope);
    expect(result!.upper).toBeGreaterThanOrEqual(result!.slope);
    expect(result!.upper).toBeLessThan(0);
  });
});

describe("seasonal tests", () => {
  it("separate a trend from the seasonal cycle", () => {
    const random = noise(3);
    const series = monthly("2014-01", "2023-12", (m, t) => 0.4 + season(m) - 0.02 * t + random() * 0.01);
    const mk = seasonalMannKendall(series);
    const sen = seasonalSenSlope(series);
    expect(mk?.p).toBeLessThan(0.001);
    expect(mk?.z).toBeLessThan(0);
    expect(sen?.slope).toBeCloseTo(-0.02, 2);
    expect(sen!.lower).toBeLessThan(sen!.upper);
  });

  it("do not mistake the seasonal cycle for a trend", () => {
    const random = noise(11);
    const series = monthly("2014-01", "2023-12", (m) => 0.4 + season(m) + random() * 0.02);
    expect(seasonalMannKendall(series)!.p).toBeGreaterThan(0.05);
  });
});

describe("verdicts", () => {
  it("call a significant monthly decline and explain it", () => {
    const random = noise(5);
    const series = monthly("2015-01", "2024-12", (m, t) => 0.4 + season(m) - 0.01 * t + random() * 0.01);
    const verdict = monthlyTrendVerdict(series);
    expect(verdict?.label).toBe("Significant decline");
    expect(verdict?.slopePerDecade).toBeCloseTo(-0.1, 1);
    const text = explainVerdict(verdict!, "Plant greenness", "NDVI", 3);
    expect(text).toMatch(/^Plant greenness fell by −0\.01\d NDVI per year/);
    expect(text).toContain("per decade");
    expect(text).toContain("p < 0.001");
  });

  it("say 'No clear trend' for noise, without a per-decade rate on short records", () => {
    const random = noise(9);
    const series = monthly("2021-01", "2024-12", (m) => 0.4 + season(m) + random() * 0.05);
    const verdict = monthlyTrendVerdict(series);
    expect(verdict?.label).toBe("No clear trend");
    expect(verdict?.slopePerDecade).toBeNull();
    expect(explainVerdict(verdict!, "Plant greenness", "NDVI", 3)).toContain("without a consistent direction");
  });

  it("works on one value per year", () => {
    const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
    const verdict = annualTrendVerdict(years, years.map((y) => 30 + 0.08 * (y - 2015)));
    expect(verdict?.label).toBe("Significant increase");
    expect(verdict?.slopePerYear).toBeCloseTo(0.08, 6);
    expect(verdict?.slopePerDecade).toBeCloseTo(0.8, 6);
  });

  it("formats p-values", () => {
    expect(formatP(0.0004)).toBe("p < 0.001");
    expect(formatP(0.0042)).toBe("p = 0.004");
    expect(formatP(0.27)).toBe("p = 0.27");
  });
});

describe("anomalies", () => {
  it("compare each month with the same calendar month in the baseline", () => {
    const series = monthly("2018-01", "2023-12", (m, t) => (m.endsWith("-07") ? 10 + (t >= 5 ? 6 : t % 2) : 1));
    const result = anomalies(series, { start: "2018-01", end: "2022-12" });
    const july2023 = result.find((a) => a.month === "2023-07")!;
    // Baseline Julys: 10.5, 11.5, 10.5, 11.5, 10.5 → mean 10.9.
    expect(july2023.anomaly).toBeCloseTo(16 - 10.9, 6);
    expect(july2023.z).toBeGreaterThan(2);
    expect(result.find((a) => a.month === "2023-01")?.anomaly).toBe(0);
  });

  it("removes the seasonal cycle", () => {
    const series = monthly("2020-01", "2021-12", (m) => season(m));
    expect(deseasonalize(series).every((p) => Math.abs(p.value as number) < 1e-12)).toBe(true);
  });
});

describe("laggedCorrelation", () => {
  it("finds the lag at which a driver leads the response", () => {
    const random = noise(21);
    const driver = monthly("2015-01", "2024-12", (m) => season(m) + random());
    const shifted = new Map(driver.map((p, i) => [driver[i + 2]?.month, p.value]));
    const response = driver.map((p) => ({ month: p.month, value: shifted.get(p.month) ?? null }));
    const result = laggedCorrelation(driver, response, 3);
    const best = [...result].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
    expect(best.lag).toBe(2);
    expect(best.r).toBeGreaterThan(0.95);
    expect(best.p).toBeLessThan(0.001);
  });

  it("ignores a shared seasonal cycle", () => {
    const a = noise(1);
    const b = noise(2);
    const x = monthly("2015-01", "2024-12", (m) => season(m) * 5 + a());
    const y = monthly("2015-01", "2024-12", (m) => season(m) * 5 + b());
    expect(Math.abs(laggedCorrelation(x, y, 0)[0].r)).toBeLessThan(0.3);
  });

  it("pearson needs four pairs", () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])?.r).toBeCloseTo(1, 10);
  });
});
