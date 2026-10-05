import { describe, expect, it } from "vitest";
import { completeSeasonYears, planPeriod, seasonYearMonths, type PeriodPlan } from "../period";

const NDVI = { earliest: "2000-03", latest: "2026-08" };
const GROWING = [4, 5, 6, 7, 8, 9];
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function plan(...args: Parameters<typeof planPeriod>): PeriodPlan {
  const result = planPeriod(...args);
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("seasonYearMonths", () => {
  it("keeps ordinary seasons inside the year", () => {
    expect(seasonYearMonths(2020, [6, 7, 8])).toEqual(["2020-06", "2020-07", "2020-08"]);
  });

  it("puts a season that crosses New Year in the year it ends", () => {
    expect(seasonYearMonths(2020, [12, 1, 2])).toEqual(["2019-12", "2020-01", "2020-02"]);
    expect(seasonYearMonths(2020, [11, 12, 1, 2, 3, 4])).toEqual(["2019-11", "2019-12", "2020-01", "2020-02", "2020-03", "2020-04"]);
  });
});

describe("completeSeasonYears", () => {
  it("only counts seasons the product fully covers", () => {
    // The newest map is August 2026, so the last full April–September season is 2025.
    expect(completeSeasonYears(GROWING, NDVI)).toEqual({ first: 2000, last: 2025 });
    expect(completeSeasonYears(ALL, NDVI)).toEqual({ first: 2001, last: 2025 });
    expect(completeSeasonYears([12, 1, 2], NDVI)).toEqual({ first: 2001, last: 2026 });
  });
});

describe("planPeriod", () => {
  it("defaults to the last 10 complete seasons", () => {
    const p = plan({ kind: "default" }, GROWING, NDVI);
    expect([p.startYear, p.endYear]).toEqual([2016, 2025]);
    expect(p.baseline).toEqual([2016, 2018]);
    expect(p.recent).toEqual([2023, 2025]);
    expect(p.years).toHaveLength(10);
  });

  it("'since 2015' runs to the latest complete season, with 3-year windows", () => {
    const p = plan({ kind: "since", start: 2015 }, ALL, NDVI);
    expect([p.startYear, p.endYear]).toEqual([2015, 2025]);
    expect(p.baseline).toEqual([2015, 2017]);
    expect(p.recent).toEqual([2023, 2025]);
  });

  it("compares a short period with the decade before it", () => {
    const p = plan({ kind: "range", start: 2021, end: 2023 }, ALL, NDVI);
    expect(p.recent).toEqual([2021, 2023]);
    expect(p.baseline).toEqual([2011, 2020]);
    expect(p.notes.join(" ")).toContain("2021–2023 compared with 2011–2020");
  });

  it("clamps to the record and says so", () => {
    const p = plan({ kind: "since", start: 1990 }, GROWING, NDVI);
    expect(p.startYear).toBe(2000);
    expect(p.notes[0]).toContain("starts in 2000");
  });

  it("plans a two-season comparison", () => {
    const p = plan({ kind: "versus", baseline: 2013, recent: 2023 }, [6, 7, 8], NDVI);
    expect(p).toMatchObject({ kind: "comparison", years: [2013, 2023], baseline: [2013, 2013], recent: [2023, 2023] });
  });

  it("explains impossible requests", () => {
    expect(planPeriod({ kind: "versus", baseline: 1995, recent: 2020 }, GROWING, NDVI)).toEqual({ error: expect.stringContaining("1995") });
    expect(planPeriod({ kind: "range", start: 2000, end: 2001 }, ALL, NDVI)).toEqual({ error: expect.stringContaining("no earlier record") });
  });

  it("samples middle years to fit the budget but keeps both windows", () => {
    const p = plan({ kind: "range", start: 2001, end: 2025 }, ALL, NDVI);
    expect(p.years.length * 12).toBeLessThanOrEqual(180);
    for (let y = p.baseline[0]; y <= p.baseline[1]; y++) expect(p.years).toContain(y);
    for (let y = p.recent[0]; y <= p.recent[1]; y++) expect(p.years).toContain(y);
    expect(p.notes.join(" ")).toMatch(/of 25 years are read/);
  });
});
