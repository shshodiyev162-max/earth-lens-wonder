import { describe, expect, it } from "vitest";
import { completeSeasonYears, lastSeasonYear, planPeriod, seasonYearMonths, timeSpan, trendWindows, type PeriodPlan, type TimeSpec } from "../period";

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
  it("defaults to the last 20 complete seasons (ten are too few for hotspots to show)", () => {
    const p = plan({ kind: "default" }, GROWING, NDVI);
    expect([p.startYear, p.endYear]).toEqual([2006, 2025]);
    expect(p.baseline).toEqual([2006, 2010]);
    expect(p.recent).toEqual([2021, 2025]);
    expect(p.years).toHaveLength(20);
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

describe("the years a timeline shows", () => {
  it("are the years each time choice covers", () => {
    expect(timeSpan({ kind: "default" }, 2025)).toEqual([2006, 2025]);
    expect(timeSpan({ kind: "last", years: 5 }, 2025)).toEqual([2021, 2025]);
    expect(timeSpan({ kind: "since", start: 2003 }, 2025)).toEqual([2003, 2025]);
    expect(timeSpan({ kind: "range", start: 2005, end: 2012 }, 2025)).toEqual([2005, 2012]);
    expect(timeSpan({ kind: "year", year: 2021 }, 2025)).toEqual([2021, 2021]);
    expect(timeSpan({ kind: "versus", baseline: 2005, recent: 2024 }, 2025)).toEqual([2005, 2024]);
  });

  it("mark the same years compared as the scan itself", () => {
    const choices: TimeSpec[] = [{ kind: "default" }, { kind: "since", start: 2003 }, { kind: "range", start: 2010, end: 2016 }, { kind: "range", start: 2021, end: 2023 }, { kind: "year", year: 2024 }];
    for (const time of choices) {
      const scan = plan(time, ALL, NDVI);
      const [start, end] = timeSpan(time, 2025);
      expect(trendWindows(start, end, 2000)).toEqual({ baseline: scan.baseline, recent: scan.recent });
    }
    // A short span right at the start of the record has nothing earlier to compare with.
    expect(trendWindows(2000, 2002, 2000)).toBeNull();
  });
});

describe("the last year a search can reach", () => {
  it("is this year once a season's months are out, and last year for a whole year", () => {
    // In mid-November 2026 NASA has published up to October.
    expect(lastSeasonYear([[6, 7, 8]], "2026-10")).toBe(2026);
    expect(lastSeasonYear([[4, 5, 6, 7, 8, 9]], "2026-10")).toBe(2026);
    expect(lastSeasonYear([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]], "2026-10")).toBe(2025);
    // Several measures: the one that reaches furthest sets the timeline; each scan stops at its own.
    expect(lastSeasonYear([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [6, 7, 8]], "2026-10")).toBe(2026);
    expect(lastSeasonYear([], "2026-10")).toBe(2025);
  });
});
