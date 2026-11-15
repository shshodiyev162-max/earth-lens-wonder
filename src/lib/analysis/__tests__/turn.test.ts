import { describe, expect, it } from "vitest";
import { annualTrendVerdict, answerInWords, explainVerdict, findTurn } from "../stats";
import { longerPeriodHint } from "../trend";

const years = Array.from({ length: 19 }, (_, i) => 2007 + i);
const wobble = [0.002, -0.003, 0.001, 0.003, -0.002, 0, -0.001, 0.002, -0.003, 0.001, 0.002, -0.002, 0.003, -0.001, 0, 0.002, -0.003, 0.001, -0.002];
// Up 0.01 a year to 2016, then down 0.01 a year: the two cancel out.
const hump = years.map((y, i) => 0.4 + 0.01 * (9 - Math.abs(y - 2016)) + wobble[i]);

describe("a rise and a fall that cancel out", () => {
  it("is found, with the year it turned, and isn't called weak", () => {
    const verdict = annualTrendVerdict(years, hump)!;
    expect(verdict.direction).toBe("none");
    expect(verdict.turn).toMatchObject({ year: 2016, first: "increase" });
    expect(verdict.turn!.p).toBeLessThan(0.05);
    expect(answerInWords(verdict)).toBe("Not in one direction. It rose until 2016, then fell.");
    const text = explainVerdict(verdict, "Plant greenness", "NDVI", 3);
    expect(text).toMatch(/^Plant greenness rose from 2007 to 2016 .*then fell to 2025/);
    expect(text).not.toMatch(/weak can easily|century|too small|change this small/);
    expect(longerPeriodHint(verdict, 2007)).toBeNull();
  });

  it("isn't found in a straight trend or in random ups and downs", () => {
    expect(findTurn(years, years.map((y, i) => 0.4 + 0.004 * (y - 2007) + wobble[i]))).toBeNull();
    expect(findTurn(years, wobble)).toBeNull();
    // Too few years to test two stretches.
    expect(findTurn(years.slice(0, 10), hump.slice(0, 10))).toBeNull();
  });

  it("gives the same answer every time", () => {
    expect(findTurn(years, hump)).toEqual(findTurn(years, hump));
  });
});

describe("a clear trend that came as one jump", () => {
  it("names a jump the steady-trend test can't see, instead of calling it no change", () => {
    // Flat near 0.40 until 2015, then flat near 0.55 (a reservoir filled, say). The trend test reads
    // the two flat levels as years that follow the year before, and finds no steady trend.
    const level = years.map((y, i) => (y <= 2015 ? 0.4 : 0.55) + wobble[i]);
    const verdict = annualTrendVerdict(years, level)!;
    expect(verdict.direction).toBe("none");
    expect(verdict.step).toMatchObject({ before: 2015, after: 2016 });
    expect(verdict.step!.p).toBeLessThan(0.05);
    expect(answerInWords(verdict)).toBe("Not steadily. It jumped up between 2015 and 2016.");
    const text = explainVerdict(verdict, "Open water", "", 2);
    expect(text).toMatch(/^Open water didn't change steadily: it jumped from about 0\.40 \(up to 2015\) to about 0\.55 \(from 2016\)/);
    expect(text).not.toMatch(/weak|century/);
    expect(longerPeriodHint(verdict, 2007)).toBeNull();
  });

  it("doesn't call a steady rise a jump", () => {
    const steady = years.map((y, i) => 0.4 + 0.01 * (y - 2007) + wobble[i]);
    expect(annualTrendVerdict(years, steady)?.step ?? null).toBeNull();
  });
});

describe("other shapes a steady trend can't describe", () => {
  const long = Array.from({ length: 24 }, (_, i) => 2001 + i);
  const jitter = (i: number) => [0.002, -0.003, 0.001, 0.003, -0.002, 0, -0.001, 0.002][i % 8];

  it("finds two turns: up, down, then up again", () => {
    // Up to 2008, down to 2016, up again to 2024.
    const wave = long.map((y, i) => 0.4 + (y <= 2008 ? 0.01 * (y - 2001) : y <= 2016 ? 0.07 - 0.01 * (y - 2008) : -0.01 + 0.01 * (y - 2016)) + jitter(i));
    const verdict = annualTrendVerdict(long, wave)!;
    expect(verdict.turn).toMatchObject({ year: 2008, first: "increase" });
    // The low point is 2016, give or take the wobble.
    expect(verdict.turn!.second).toBeGreaterThanOrEqual(2015);
    expect(verdict.turn!.second).toBeLessThanOrEqual(2017);
    expect(answerInWords(verdict)).toMatch(/^Not in one direction\. It rose until 2008, fell until 201[5-7], then rose again\.$/);
    expect(explainVerdict(verdict, "Greenness", "", 3)).toMatch(/fell until 201[5-7] .*then rose again to 2024/);
  });

  it("finds a start after years of nothing", () => {
    // Level until 2014, then rising 0.01 a year.
    const started = long.map((y, i) => 0.4 + (y > 2014 ? 0.01 * (y - 2014) : 0) + jitter(i));
    const verdict = annualTrendVerdict(long, started)!;
    const shape = verdict.direction === "none" ? answerInWords(verdict) : explainVerdict(verdict, "Greenness", "", 3);
    expect(verdict.bend?.kind).toBe("started");
    expect(shape).toMatch(/2014/);
  });

  it("finds nothing extra in a steady trend or in plain ups and downs", () => {
    const steady = long.map((y, i) => 0.4 + 0.005 * (y - 2001) + jitter(i));
    const flat = long.map((_, i) => 0.4 + jitter(i) * 3);
    for (const values of [steady, flat]) {
      const verdict = annualTrendVerdict(long, values)!;
      expect([verdict.turn ?? null, verdict.step ?? null, verdict.bend ?? null]).toEqual([null, null, null]);
    }
  });
});
