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
