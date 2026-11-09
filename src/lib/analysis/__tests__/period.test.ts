import { describe, expect, it } from "vitest";
import { averageYear, comparePeriods, monthsOfSeasonYear, seasonYearOf, yearlyValues } from "../aggregate";
import { describePeriod, periodProblems, readPeriod, requestedMonths, selectionMonths, writePeriod } from "../period";
import { welchTTest } from "../stats";

const latest = "2026-08";
const read = (query: string) => readPeriod(new URLSearchParams(query), latest);

describe("analysis period", () => {
  it("defaults to the last 20 years and keeps old links working", () => {
    expect(read("")).toMatchObject({ kind: "20y", start: "2006-09", end: "2026-08" });
    expect(read("period=10y")).toMatchObject({ kind: "10y", start: "2016-09" });
    expect(read("period=12")).toMatchObject({ kind: "1y", start: "2025-09" });
    expect(read("period=all")).toMatchObject({ start: "2000-03", end: latest });
  });

  it("clamps custom ranges to the NASA record and explains why", () => {
    const p = read("period=custom&start=1995-01&end=2030-01");
    expect([p.start, p.end]).toEqual(["2000-03", latest]);
    expect(p.notes).toHaveLength(2);
  });

  it("reads and writes a baseline-vs-comparison period with a season", () => {
    const p = read("period=compare&base=2001-2010&recent=2016-2025&season=winter");
    expect([p.baseline, p.recent]).toEqual([[2001, 2010], [2016, 2025]]);
    const months = requestedMonths(p, 40, latest);
    expect(months[0]).toBe("2000-12");
    expect(months).toHaveLength(60);
    expect(describePeriod(p, selectionMonths(p, 40))).toBe("2001–2010 vs 2016–2025 · Dec–Feb only");
    expect(selectionMonths(p, -30)).toEqual([6, 7, 8]);
    const next = writePeriod(new URLSearchParams("lat=1"), p, { customMonths: [4, 5] });
    expect(next.get("season")).toBe("m-4.5");
    expect(next.get("lat")).toBe("1");
    expect(periodProblems(read("period=compare&base=2001-2012&recent=2010-2020"), 10)[0]).toMatch(/overlap/);
  });
});

describe("yearly aggregation", () => {
  it("assigns winter months to the year they end in", () => {
    expect(seasonYearOf("2016-12", [12, 1, 2])).toBe(2017);
    expect(seasonYearOf("2016-06", [1, 6, 12])).toBe(2016);
    expect(monthsOfSeasonYear(2017, [11, 12, 1, 2, 3, 4])).toEqual(["2016-11", "2016-12", "2017-01", "2017-02", "2017-03", "2017-04"]);
  });

  it("averages complete years and adjusts for a missing month", () => {
    const values = [2020, 2021].flatMap((y) => Array.from({ length: 12 }, (_, i) => ({ month: `${y}-${String(i + 1).padStart(2, "0")}`, value: i + (y - 2020) })));
    values[0] = { ...values[0], value: null }; // Jan 2020 missing
    const yearly = yearlyValues(values, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // 2020 lacks January: its average is the long-run normal (72.5 / 12) plus its mean departure (−0.5).
    expect(yearly[0].value).toBeCloseTo(72.5 / 12 - 0.5, 6);
    expect(yearly[1].value).toBeCloseTo(6.5, 6);
    expect(yearlyValues(values, [1, 2, 3], "sum")[0].value).toBeNull();
    expect(averageYear(values, [2021, 2021], [6])).toEqual([{ month: 6, value: 6, count: 1 }]);
  });

  it("tests a difference between two periods", () => {
    const yearly = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ year: 2000 + i, value: i <= 4 ? 1 + i * 0.01 : 2 + i * 0.01, count: 12, expected: 12, complete: true }));
    const result = comparePeriods(yearly, [2001, 2004], [2005, 2008]);
    expect(result.label).toBe("Significantly higher");
    expect(result.change).toBeCloseTo(1.04, 6);
    expect(welchTTest([1, 2, 3], [1, 2, 3])?.p).toBeCloseTo(1, 6);
    expect(welchTTest([1], [2])).toBeNull();
  });
});
