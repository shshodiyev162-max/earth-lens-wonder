import { describe, expect, it } from "vitest";
import { deseasonalizedTrend, linearRegression, monthIndex, seasonalMeans, signed, yearOverYear, type MonthlyValue } from "../stats";
import { monthRange } from "../../gibs/time";

function seasonalSeries(start: string, end: string, perYear: number, amplitude = 0.2, base = 0.4): MonthlyValue[] {
  const first = monthIndex(start);
  return monthRange(start, end).map((month) => {
    const t = (monthIndex(month) - first) / 12;
    const season = Math.sin(((Number(month.slice(5, 7)) - 1) / 12) * 2 * Math.PI) * amplitude;
    return { month, value: base + season + perYear * t };
  });
}

describe("linearRegression", () => {
  it("recovers a perfect line", () => {
    const r = linearRegression([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(r?.slope).toBeCloseTo(2, 10);
    expect(r?.intercept).toBeCloseTo(1, 10);
    expect(r?.r2).toBeCloseTo(1, 10);
  });
  it("needs at least three points", () => {
    expect(linearRegression([0, 1], [1, 2])).toBeNull();
  });
});

describe("deseasonalizedTrend", () => {
  it("separates a trend from the seasonal cycle", () => {
    const trend = deseasonalizedTrend(seasonalSeries("2021-01", "2025-12", -0.02));
    expect(trend?.perYear).toBeCloseTo(-0.02, 3);
  });
  it("refuses to guess with less than two seasonal cycles", () => {
    expect(deseasonalizedTrend(seasonalSeries("2025-01", "2025-12", 0.1))).toBeNull();
  });
});

describe("seasonal helpers", () => {
  it("averages by calendar month", () => {
    const means = seasonalMeans([
      { month: "2024-01", value: 1 },
      { month: "2025-01", value: 3 },
      { month: "2025-02", value: null },
    ]);
    expect(means[0]).toBe(2);
    expect(means[1]).toBeNull();
  });
  it("compares the latest month with the same month a year earlier", () => {
    const yoy = yearOverYear([
      { month: "2025-08", value: 0.3 },
      { month: "2026-07", value: 0.2 },
      { month: "2026-08", value: 0.25 },
    ]);
    expect(yoy).toMatchObject({ month: "2026-08", previous: 0.3 });
    expect(yoy?.change).toBeCloseTo(-0.05, 10);
  });
  it("formats signed numbers with a real minus sign", () => {
    expect(signed(1.234)).toBe("+1.2");
    expect(signed(-0.5)).toBe("−0.5");
    expect(signed(0.01)).toBe("0.0");
  });
});
