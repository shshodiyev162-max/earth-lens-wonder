import { describe, expect, it } from "vitest";
import { changeShape, fitLinear, judgeFire, judgePeople, leastSquares, MIN_WEATHER_YEARS, weatherCheck, type DriverInput, type YearPoint } from "../model";

/** Repeatable "random" numbers in [-1, 1]. */
function noise(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return (state / 2147483648) * 2 - 1;
  };
}

const YEARS = Array.from({ length: 20 }, (_, i) => 2001 + i);
const series = (f: (t: number, year: number) => number): YearPoint[] => YEARS.map((year, t) => ({ year, value: f(t, year) }));
const driver = (id: DriverInput["id"], points: YearPoint[], window: DriverInput["window"] = "season"): DriverInput => ({ id, window, points });
/** A wet/dry pattern with no trend at all: the same set of values, shuffled the same way each half. */
const PATTERN = [1, -0.6, 0.3, -1, 0.8, -0.2, 0.5, -0.8, 0.1, -0.4];
const steady = (t: number) => PATTERN[t % PATTERN.length];

describe("least squares", () => {
  it("solves an exact system", () => {
    const X = [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ];
    const b = leastSquares(X, [1, 3, 5, 7]) as number[];
    expect(b[0]).toBeCloseTo(1, 10);
    expect(b[1]).toBeCloseTo(2, 10);
  });

  it("refuses columns that say the same thing", () => {
    expect(
      leastSquares(
        [
          [1, 2],
          [1, 2],
          [1, 2],
        ],
        [1, 2, 3],
      ),
    ).toBeNull();
  });

  it("fits a driver and scores it on years left out", () => {
    const x = YEARS.map((_, t) => t * 1.5 + steady(t));
    const fit = fitLinear(
      x.map((v) => 2 + 3 * v),
      [x],
    );
    expect(fit?.coefficients[0]).toBeCloseTo(3, 8);
    expect(fit?.intercept).toBeCloseTo(2, 8);
    expect(fit?.skill).toBeGreaterThan(0.999);
  });
});

describe("the weather check", () => {
  it("finds that drier years explain falling greenness", () => {
    const r = noise(7);
    const rain = series((t) => 500 - 10 * t + 60 * r());
    const temp = series(() => 15 + 0.5 * r());
    const greenness = series((t) => 0.05 + 0.0006 * (rain[t].value as number) + 0.004 * r());
    const check = weatherCheck(greenness, [driver("rain", rain, "year"), driver("temp", temp)]);
    expect(check.outcome).toBe("weather");
    expect(check.years).toBe(20);
    expect(check.skill).toBeGreaterThan(0.6);
    expect(check.explained).toBeGreaterThan(0.75);
    expect(check.residual?.direction).toBe("none");
    const rainEffect = check.effects.find((e) => e.id === "rain");
    expect(rainEffect?.share).toBeGreaterThan(0.75);
    expect(rainEffect?.verdict?.direction).toBe("decline");
    expect(rainEffect?.coefficient).toBeCloseTo(0.0006, 3);
  });

  it("finds a trend the weather doesn't explain, though it follows the ups and downs", () => {
    const r = noise(11);
    const rain = series((t) => 500 + 80 * steady(t));
    const temp = series((t) => 15 + 0.4 * steady(t + 3));
    const greenness = series((t) => 0.4 + 0.0005 * (rain[t].value as number - 500) - 0.004 * t + 0.003 * r());
    const check = weatherCheck(greenness, [driver("rain", rain, "year"), driver("temp", temp)]);
    expect(check.skill).toBeGreaterThan(0.2);
    expect(check.explained).toBeLessThan(0.25);
    expect(check.residual?.direction).toBe("decline");
    expect(check.leftOver).toBe(true);
    expect(check.outcome).toBe("notWeather");
  });

  it("can't say when the measure doesn't follow the weather at all", () => {
    const r = noise(3);
    const rain = series(() => 500 + 80 * r());
    const temp = series(() => 15 + r());
    const greenness = series((t) => 0.4 - 0.004 * t + 0.03 * r());
    expect(weatherCheck(greenness, [driver("rain", rain), driver("temp", temp)]).outcome).toBe("noLink");
  });

  it("needs enough years with both measurements", () => {
    const short = series((t) => t).slice(0, MIN_WEATHER_YEARS - 1);
    const check = weatherCheck(short, [driver("rain", short)]);
    expect(check.outcome).toBe("tooFewYears");
    expect(check.years).toBe(MIN_WEATHER_YEARS - 1);
  });

  it("only uses years where the measure and every driver have a value", () => {
    const r = noise(5);
    const rain = series((t) => 500 - 10 * t + 40 * r()).map((p, i) => (i < 5 ? { ...p, value: null } : p));
    const greenness = series((t) => 0.05 + 0.0006 * (500 - 10 * t));
    expect(weatherCheck(greenness, [driver("rain", rain)]).years).toBe(15);
  });

  it("leaves out a driver that never changes", () => {
    const rain = series((t) => 500 - 10 * t + 30 * steady(t));
    const snow = series(() => 0);
    const greenness = series((t) => 0.0006 * (rain[t].value as number));
    const check = weatherCheck(greenness, [driver("rain", rain), driver("temp", snow)]);
    expect(check.effects.map((e) => e.id)).toEqual(["rain"]);
    // A perfect fit leaves only rounding noise, which mustn't count as a trend left over.
    expect(check.leftOver).toBe(false);
    expect(check.outcome).toBe("weather");
  });
});

describe("sudden or gradual", () => {
  it("finds the year of a sudden drop", () => {
    const r = noise(9);
    const points = series((_, year) => (year < 2009 ? 0.5 : 0.35) + 0.01 * r());
    const shape = changeShape(points, "decline");
    expect(shape.kind).toBe("sudden");
    expect(shape.before).toBe(2008);
    expect(shape.after).toBe(2009);
    expect(shape.step).toBeLessThan(-0.1);
    expect(shape.recovering).toBe(false);
  });

  it("sees plants coming back after a sudden drop", () => {
    const points = series((t, year) => (year < 2012 ? 0.5 + 0.005 * steady(t) : 0.25 + 0.012 * (year - 2012)));
    const shape = changeShape(points, "decline");
    expect(shape.kind).toBe("sudden");
    expect(shape.after).toBe(2012);
    expect(shape.recovering).toBe(true);
  });

  it("calls a steady drift gradual", () => {
    const r = noise(4);
    expect(changeShape(series((t) => 0.5 - 0.006 * t + 0.006 * r()), "decline").kind).toBe("gradual");
  });

  it("doesn't count a jump the other way", () => {
    const points = series((_, year) => (year < 2009 ? 0.35 : 0.5) + 0.002 * steady(year));
    expect(changeShape(points, "decline").kind).not.toBe("sudden");
  });

  it("needs enough years", () => {
    expect(changeShape(series((t) => t).slice(0, 5), "increase").kind).toBe("tooFewYears");
  });

  it("finds a clean jump in a short record of ten years", () => {
    const points = series((t, year) => (year < 2006 ? 0.5 : 0.3) + 0.004 * steady(t)).slice(0, 10);
    const shape = changeShape(points, "decline");
    expect(shape.kind).toBe("sudden");
    expect([shape.before, shape.after]).toEqual([2005, 2006]);
  });

  it("still sees a jump in the last two years of a record", () => {
    const points = series((t, year) => (year <= 2018 ? 0.5 : 0.3) + 0.004 * steady(t));
    expect(changeShape(points, "decline")).toMatchObject({ kind: "sudden", before: 2018, after: 2019 });
  });

  it("doesn't call two odd years at the end a jump when the years vary a lot anyway", () => {
    const r = noise(21);
    const points = series((_, year) => 0.4 + 0.06 * r() - (year >= 2019 ? 0.05 : 0));
    expect(changeShape(points, "decline").kind).not.toBe("sudden");
  });
});

describe("fires and people", () => {
  const days = (checked: number, withFire: number) => ({ checked, withFire, from: "2019-01-01", to: "2019-12-31" });

  it("calls fires unusual when they burned far more often than before", () => {
    expect(judgeFire(days(36, 9), days(36, 1))).toBe("unusual");
    expect(judgeFire(days(36, 3), days(36, 0))).toBe("unusual");
    expect(judgeFire(days(36, 9), days(36, 6))).toBe("usual");
    // One or two days with fire are too few to tell, which isn't the same as fire being usual here.
    expect(judgeFire(days(36, 2), days(36, 0))).toBe("few");
    expect(judgeFire(days(36, 4), days(36, 3))).toBe("usual");
    expect(judgeFire(days(36, 0), days(36, 0))).toBe("none");
  });

  it("weighs population growth by how many people live here", () => {
    const count = (year: number, people: number, crowdedShare = 0) => ({ year, people, km2: 1000, crowdedShare });
    expect(judgePeople(count(2000, 100_000), count(2020, 150_000)).strength).toBe("some");
    expect(judgePeople(count(2000, 100_000), count(2020, 115_000)).strength).toBe("weak");
    expect(judgePeople(count(2000, 20_000), count(2020, 23_000)).strength).toBe("weak");
    // A few more people in an almost empty place don't count.
    expect(judgePeople(count(2000, 5_000), count(2020, 8_000)).strength).toBeNull();
    expect(judgePeople(count(2000, 100_000), count(2020, 104_000)).strength).toBeNull();
    // Crowded land spreading counts, even when the totals can't show it (the map stops at 1,000 per km²).
    expect(judgePeople(count(2000, 900_000, 0.4), count(2020, 950_000, 0.45)).strength).toBe("some");
    const check = judgePeople(count(2000, 100_000), count(2020, 150_000));
    expect(check.growth).toBeCloseTo(0.5);
    expect(check.density).toBeCloseTo(150);
  });
});
