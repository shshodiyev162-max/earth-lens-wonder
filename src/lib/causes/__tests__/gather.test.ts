import { describe, expect, it, vi } from "vitest";
import { POWER_PARAMETERS, type PowerMonthly } from "@/lib/analysis/power";
import { bboxPolygon } from "@/lib/geo/geometry";
import { COVER_GROUPS, type CoverGroup, type LandCover } from "@/lib/trends/landcover";
import {
  causeKey,
  countFromGrid,
  coverYear,
  driverMonthly,
  driverYears,
  findCauses,
  FIRE_FIRST_DAYS,
  FIRE_MAX_FOLLOW,
  fireWindows,
  firstPassDays,
  followUpDays,
  peopleYears,
  spreadDays,
  windowMonths,
  type CauseLoaders,
  type CauseRequest,
} from "../gather";

const GROWING = [4, 5, 6, 7, 8, 9];
const WINTER = [12, 1, 2];

/** NASA POWER answers for 2000–2020: rain in mm/day, temperature °C, soil wetness 0–1, wind m/s. */
function power(rain: (year: number, month: number) => number, temp = () => 18): PowerMonthly {
  const out = Object.fromEntries(POWER_PARAMETERS.map((name) => [name, {}])) as PowerMonthly;
  for (let year = 2000; year <= 2020; year++) {
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      out.PRECTOTCORR[key] = rain(year, month);
      out.T2M[key] = temp();
      out.GWETROOT[key] = 0.3;
      out.WS2M[key] = 3;
    }
  }
  return out;
}

function cover(shares: Partial<Record<CoverGroup, number>>): LandCover {
  const full = Object.fromEntries(COVER_GROUPS.map((g) => [g, shares[g] ?? 0])) as Record<CoverGroup, number>;
  return { year: 2024, km2: full, totalKm2: 500, shares: full };
}

const PATTERN = [1, -0.6, 0.3, -1, 0.8, -0.2, 0.5, -0.8, 0.1, -0.4];

describe("the weather, year by year", () => {
  it("turns NASA POWER's daily rates into monthly totals and soil wetness into a percentage", () => {
    const monthly = power(() => 2);
    expect(driverMonthly(monthly, "rain").get("2010-02")).toBe(56);
    expect(driverMonthly(monthly, "rain").get("2012-02")).toBe(58);
    expect(driverMonthly(monthly, "soil").get("2010-02")).toBe(30);
    expect(driverMonthly(monthly, "temp").get("2010-02")).toBe(18);
  });

  it("reads rain over the 12 months up to the end of each season, and the rest over the season", () => {
    expect(windowMonths(2010, GROWING, "season")).toEqual(["2010-04", "2010-05", "2010-06", "2010-07", "2010-08", "2010-09"]);
    const year = windowMonths(2010, GROWING, "year");
    expect(year).toHaveLength(12);
    expect([year[0], year[11]]).toEqual(["2009-10", "2010-09"]);
    // A winter season belongs to the year it ends in.
    expect(windowMonths(2010, WINTER, "season")).toEqual(["2009-12", "2010-01", "2010-02"]);
    expect(windowMonths(2010, WINTER, "year")[0]).toBe("2009-03");
  });

  it("adds rain up and averages the rest, and leaves out years with a missing month", () => {
    const monthly = new Map<string, number | null>(windowMonths(2010, GROWING, "year").map((m) => [m, 10]));
    expect(driverYears(monthly, "rain", "year", GROWING, [2010])).toEqual([{ year: 2010, value: 120 }]);
    expect(driverYears(monthly, "temp", "season", GROWING, [2010])).toEqual([{ year: 2010, value: 10 }]);
    monthly.set("2010-06", null);
    expect(driverYears(monthly, "rain", "year", GROWING, [2010, 2011])).toEqual([
      { year: 2010, value: null },
      { year: 2011, value: null },
    ]);
  });
});

describe("when to look for fires", () => {
  it("looks from late in the last season before a sudden change to the end of the first one after it, and the same time before", () => {
    // A fire in the last months of a season barely moves that season's average, so those months are included.
    expect(fireWindows(2018, 2019, GROWING, "2026-11-12")).toEqual({ during: ["2018-07-01", "2019-09-30"], before: ["2017-03-31", "2018-06-30"] });
    // Calendar years: a December fire before a drop the next year is looked for.
    expect(fireWindows(2019, 2020, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "2026-11-12")?.during).toEqual(["2019-10-01", "2020-12-31"]);
  });

  it("looks at most two years back, and never at days that haven't happened", () => {
    expect(fireWindows(2010, 2015, GROWING, "2026-11-12")?.during).toEqual(["2013-09-30", "2015-09-30"]);
    expect(fireWindows(2025, 2026, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "2026-11-12")?.during[1]).toBe("2026-11-11");
  });

  it("starts no earlier than NASA's fire record", () => {
    expect(fireWindows(2000, 2001, GROWING, "2026-11-12")?.during[0]).toBe("2000-11-01");
  });

  it("spreads the days checked evenly, ends included", () => {
    const days = spreadDays("2019-01-01", "2019-12-31", 36);
    expect(days).toHaveLength(36);
    expect([days[0], days[days.length - 1]]).toEqual(["2019-01-01", "2019-12-31"]);
    expect(spreadDays("2019-01-01", "2019-01-05", 36)).toEqual(["2019-01-01", "2019-01-02", "2019-01-03", "2019-01-04", "2019-01-05"]);
  });

  it("checks about one day in eight first, at most 60", () => {
    expect(firstPassDays("2018-07-01", "2019-09-30")).toHaveLength(58);
    expect(firstPassDays("2017-01-01", "2018-12-31")).toHaveLength(FIRE_FIRST_DAYS);
  });

  it("then checks every day around a day with fire, inside the period, nearest first", () => {
    const days = followUpDays(["2018-11-10"], new Set(["2018-11-10", "2018-11-18"]), "2018-07-01", "2018-11-12");
    expect(days).toEqual(["2018-11-05", "2018-11-06", "2018-11-07", "2018-11-08", "2018-11-09", "2018-11-11", "2018-11-12"]);
    const many = followUpDays(["2018-08-01", "2018-08-20", "2018-09-10", "2018-10-01", "2018-10-20"], new Set(), "2018-07-01", "2019-09-30");
    expect(many).toHaveLength(FIRE_MAX_FOLLOW);
  });
});

describe("people", () => {
  it("compares the population maps that span the years", () => {
    expect(peopleYears(2003, 2024)).toEqual([2000, 2020]);
    expect(peopleYears(2015, 2025)).toEqual([2015, 2020]);
    expect(peopleYears(2008, 2012)).toEqual([2005, 2015]);
    expect(peopleYears(2021, 2025)).toBeNull();
  });

  it("counts people from a grid of people per km², inside the area only", () => {
    const grid = { bbox: [0, 0, 0.02, 0.02] as [number, number, number, number], width: 2, height: 2 };
    const count = countFromGrid(Float32Array.from([10, 1200, NaN, 50]), Uint8Array.from([1, 1, 1, 0]), grid, 2010);
    expect(count.year).toBe(2010);
    expect(count.km2).toBeGreaterThan(2.4);
    expect(count.people / count.km2).toBeCloseTo(605, 0);
    expect(count.crowdedShare).toBeCloseTo(0.5, 2);
  });
});

describe("finding causes", () => {
  const geometry = bboxPolygon([60, 40, 61, 41]);
  const years = Array.from({ length: 13 }, (_, i) => 2008 + i);
  const request: CauseRequest = {
    family: "plants",
    direction: "decline",
    noun: "plant greenness",
    // Steady until 2018, then a sudden drop.
    series: years.map((year, i) => ({ year, value: (year <= 2018 ? 0.5 : 0.3) + 0.004 * PATTERN[i % PATTERN.length] })),
    months: GROWING,
    geometry,
    bbox: [60, 40, 61, 41],
    points: [[40.5, 60.5]],
  };

  function loaders(overrides: Partial<CauseLoaders> = {}): CauseLoaders {
    return {
      power: vi.fn(async () => power((year, month) => 1.5 + 0.5 * PATTERN[(year + month) % PATTERN.length])),
      // Fires on many days after the last season before the drop, hardly any before.
      fireDay: vi.fn(async (_g, _b, day: string) => day >= "2018-10-01" && Number(day.slice(8)) % 3 === 0),
      people: vi.fn(async (_g, _b, year: number) => ({ year, people: year === 2020 ? 150_000 : 100_000, km2: 1000, crowdedShare: 0 })),
      landCover: vi.fn(async (_g, _b, year: number) => ({ ...cover({ forest: 0.7, grass: 0.3 }), year })),
      ...overrides,
    };
  }

  it("runs every check with NASA data and names fire for a sudden drop with many fires", async () => {
    const fake = loaders();
    const { report, evidence } = await findCauses(request, { loaders: fake });
    expect(evidence.shape).toMatchObject({ kind: "sudden", before: 2018, after: 2019 });
    expect(evidence.fire.status).toBe("checked");
    if (evidence.fire.status === "checked") {
      expect(evidence.fire.check.outcome).toBe("unusual");
      expect(evidence.fire.check.during.checked).toBeLessThanOrEqual(FIRE_FIRST_DAYS + FIRE_MAX_FOLLOW);
    }
    expect(report.causes[0].id).toBe("fire");
    // The land is described as it was the year before the drop.
    expect(vi.mocked(fake.landCover).mock.calls[0][2]).toBe(2018);
    expect(report.checks.find((c) => c.id === "land")?.label).toBe("Land in 2018 (MODIS land cover)");
    // The weather is read once per point, a year before the first season (rain soaks in slowly).
    expect(fake.power).toHaveBeenCalledWith([40.5, 60.5], 2007, 2020, undefined);
    expect(fake.people).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fake.people).mock.calls.map((call) => call[2])).toEqual([2005, 2020]);
    // Polite: two periods of at most 100 small pictures each.
    expect(vi.mocked(fake.fireDay).mock.calls.length).toBeLessThanOrEqual(2 * (FIRE_FIRST_DAYS + FIRE_MAX_FOLLOW));
  });

  it("doesn't miss a fire that burned for only two or three weeks", async () => {
    // Fires on 18 days in November only (like the 2018 Camp Fire): one day in eight alone would catch two or three.
    const { evidence, report } = await findCauses(request, {
      loaders: loaders({ fireDay: vi.fn(async (_g, _b, day: string) => day >= "2018-11-08" && day <= "2018-11-25") }),
    });
    expect(evidence.fire.status).toBe("checked");
    if (evidence.fire.status === "checked") {
      expect(evidence.fire.check.during.withFire).toBeGreaterThanOrEqual(10);
      expect(evidence.fire.check.before.withFire).toBe(0);
      expect(evidence.fire.check.outcome).toBe("unusual");
    }
    expect(report.causes[0].id).toBe("fire");
  });

  it("describes the land at the start of a gradual change", () => {
    const drift = years.map((year, i) => ({ year, value: 0.5 - 0.01 * i }));
    expect(coverYear(drift, { kind: "gradual", recovering: false })).toBe(2008);
    expect(coverYear(drift, { kind: "sudden", before: 2014, after: 2015, recovering: false })).toBe(2014);
  });

  it("doesn't look for fires when the change wasn't sudden, or when they can't explain it", async () => {
    const drift = { ...request, series: years.map((year, i) => ({ year, value: 0.5 - 0.01 * i + 0.003 * PATTERN[i % PATTERN.length] })) };
    const fake = loaders();
    const { evidence } = await findCauses(drift, { loaders: fake });
    expect(evidence.fire).toEqual({ status: "skipped", reason: "notSudden" });
    expect(fake.fireDay).not.toHaveBeenCalled();
    const snow = await findCauses({ ...request, family: "snow", noun: "snow cover" }, { loaders: loaders() });
    expect(snow.evidence.fire).toEqual({ status: "skipped", reason: "measure" });
    expect(snow.evidence.people).toEqual({ status: "skipped", reason: "measure" });
  });

  it("keeps the other checks when one of NASA's services fails", async () => {
    const { evidence, report } = await findCauses(request, {
      loaders: loaders({
        people: async () => {
          throw new Error("NASA SEDAC returned 503");
        },
        power: async () => {
          throw new Error("NASA POWER returned 500");
        },
      }),
    });
    expect(evidence.people).toEqual({ status: "failed" });
    expect(evidence.weather).toBeNull();
    expect(evidence.cover?.shares.forest).toBe(0.7);
    expect(report.checks.find((c) => c.id === "people")?.result).toContain("couldn't be reached");
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    const slow = loaders({
      landCover: (_g, _b, _year, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    });
    const pending = findCauses(request, { loaders: slow, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("gives the same request the same key, and a different one another", () => {
    expect(causeKey(request)).toBe(causeKey({ ...request }));
    expect(causeKey(request)).not.toBe(causeKey({ ...request, direction: "increase" }));
    expect(causeKey(request)).not.toBe(causeKey({ ...request, points: [[41, 60]] }));
  });
});
