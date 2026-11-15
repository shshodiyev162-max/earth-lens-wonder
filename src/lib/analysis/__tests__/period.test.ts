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

  it("keeps a changed comparison when the page reads its own link back", () => {
    const p = read("period=compare&base=2001-2010&recent=2016-2025");
    const next = writePeriod(new URLSearchParams(), p, { kind: "compare", baseline: [2003, 2009] });
    expect(next.get("base")).toBe("2003-2009");
    expect(read(next.toString()).baseline).toEqual([2003, 2009]);
    // Links written with a dash between the years, as earlier versions did, still open.
    expect(read("period=compare&base=2002%E2%80%932008&recent=2016-2025").baseline).toEqual([2002, 2008]);
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

  it("counts a lake's largest water only when the month that usually has the most was seen", () => {
    // Water peaks in May (1,000 km²) and is 600 the rest of the season; in 2022 ice hid May.
    const values = [2020, 2021, 2022].flatMap((y) =>
      [3, 4, 5, 6].map((m) => ({ month: `${y}-0${m}`, value: y === 2022 && m === 5 ? null : m === 5 ? 1000 : 600 })),
    );
    const yearly = yearlyValues(values, [3, 4, 5, 6], "max");
    expect(yearly.map((y) => y.value)).toEqual([1000, 1000, null]);
  });

  it("asks for stronger evidence of a difference when years follow the year before", () => {
    // A slow swing: each period drifts in long runs, so its years are less independent than they look.
    const swing = [0, 0.3, 0.6, 0.8, 0.9, 0.8, 0.6, 0.3, 0, -0.2];
    const yearly = Array.from({ length: 20 }, (_, i) => ({ year: 2001 + i, value: (i < 10 ? 1 : 1.5) + swing[i % 10], count: 12, expected: 12, complete: true }));
    const result = comparePeriods(yearly, [2001, 2010], [2011, 2020]);
    expect(result.carryOver).toBeGreaterThan(0.5);
    const plain = welchTTest(yearly.slice(0, 10).map((y) => y.value), yearly.slice(10).map((y) => y.value));
    expect(result.p).toBeGreaterThan(plain!.p);
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
