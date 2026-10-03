import { describe, expect, it } from "vitest";
import { averageMonthly, parseClimatologyResponse, parseMonthlyResponse } from "../power";
import { buildClimatePoints } from "../run";

// Shapes copied from real NASA POWER responses (values shortened).
const MONTHLY = {
  properties: {
    parameter: {
      T2M: { "202507": 33.74, "202508": 30.24, "202513": 17.32, "202609": -999 },
      PRECTOTCORR: { "202507": 0.0, "202508": 0.1, "202609": -999 },
      ALLSKY_SFC_SW_DWN: { "202507": 27.91, "202508": 24.86 },
      GWETROOT: { "202507": 0.42, "202508": 0.4 },
    },
  },
};

const CLIMATOLOGY = {
  properties: {
    parameter: {
      T2M: { JAN: 0.55, FEB: 2.74, MAR: 9.5, APR: 17, MAY: 23, JUN: 28, JUL: 30.1, AUG: 28.2, SEP: 21.9, OCT: 14.3, NOV: 7.2, DEC: 2.1, ANN: 15.4 },
      PRECTOTCORR: { JAN: 0.53, FEB: 0.94, MAR: 0.86, APR: 0.78, MAY: 0.32, JUN: 0.07, JUL: 0.01, AUG: 0.01, SEP: 0.01, OCT: 0.15, NOV: 0.49, DEC: 0.43, ANN: 0.38 },
      GWETROOT: { JAN: 0.5, FEB: 0.5, MAR: 0.5, APR: 0.5, MAY: 0.5, JUN: 0.45, JUL: 0.44, AUG: 0.43, SEP: 0.43, OCT: 0.45, NOV: 0.48, DEC: 0.5, ANN: 0.47 },
    },
  },
};

describe("NASA POWER parsing", () => {
  it("drops annual values and fill values", () => {
    const monthly = parseMonthlyResponse(MONTHLY);
    expect(monthly.T2M["2025-07"]).toBe(33.74);
    expect(monthly.T2M["2025-13"]).toBeUndefined();
    expect(monthly.T2M["2026-09"]).toBeNull();
    expect(monthly.RH2M).toEqual({});
  });

  it("reads twelve monthly normals", () => {
    const normals = parseClimatologyResponse(CLIMATOLOGY);
    expect(normals.T2M).toHaveLength(12);
    expect(normals.T2M?.[6]).toBe(30.1);
  });

  it("builds climate points with totals, anomalies and unit conversions", () => {
    const points = buildClimatePoints(["2025-07", "2025-08", "2026-09"], parseMonthlyResponse(MONTHLY), parseClimatologyResponse(CLIMATOLOGY));
    expect(points[0].tempAnomaly).toBeCloseTo(33.74 - 30.1, 5);
    expect(points[1].precip).toBeCloseTo(0.1 * 31, 5); // mm/day × days
    expect(points[1].precipNormal).toBeCloseTo(0.01 * 31, 5);
    expect(points[0].solar).toBeCloseTo(27.91 / 3.6, 5); // MJ → kWh
    expect(points[0].soil).toBeCloseTo(42, 5);
    expect(points[2].temp).toBeNull();
    expect(points[2].tempAnomaly).toBeNull();
  });

  it("averages several sampling points", () => {
    const a = parseMonthlyResponse({ properties: { parameter: { T2M: { "202501": 10 } } } });
    const b = parseMonthlyResponse({ properties: { parameter: { T2M: { "202501": 20 } } } });
    expect(averageMonthly([a, b]).T2M["2025-01"]).toBe(15);
  });
});
