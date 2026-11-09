import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaText, chartShape, DATA_MAPS, FINDINGS, MARKERS, meanBetween, pText, rangeText, shareText, signedNumber } from "../findings";
import { STOPS, type DataId } from "../story";

describe("the page's answers agree with what was measured", () => {
  // The page says these answers in words. If a new measurement disagrees, this fails rather than the page lying.
  it('"Yes. Clearly." for the Mediterranean', () => {
    const { verdict, overlay } = FINDINGS.mediterranean;
    expect(verdict.direction).toBe("increase");
    expect(verdict.p).toBeLessThan(0.001);
    expect(verdict.lowerPerYear).toBeGreaterThan(0);
    expect(overlay.rising).toBe(1);
  });

  it('"As a whole, no." for Uzbekistan: the range includes zero', () => {
    const { verdict } = FINDINGS.uzbekistan;
    expect(verdict.direction).toBe("none");
    expect(verdict.p).toBeGreaterThan(0.05);
    expect(verdict.lowerPerYear).toBeLessThan(0);
    expect(verdict.upperPerYear).toBeGreaterThan(0);
  });

  it('"There, yes." for the Aral Sea shore: a clear decline', () => {
    const { verdict, name } = FINDINGS.uzbekistan.hotspot;
    expect(name).toContain("Muynoq");
    expect(verdict.direction).toBe("decline");
    expect(verdict.upperPerYear).toBeLessThan(0);
  });

  it('"Barely. Maybe." for Antarctic ozone: significant, but only just', () => {
    const { verdict } = FINDINGS.antarctica;
    expect(verdict.direction).toBe("increase");
    expect(verdict.p).toBeLessThan(0.05);
    expect(verdict.p).toBeGreaterThan(0.03);
    expect(verdict.lowerPerYear).toBeGreaterThan(0);
    expect(verdict.lowerPerYear).toBeLessThan(verdict.slopePerYear * 0.2);
  });

  it("every test can be run again from its link", () => {
    expect(FINDINGS.mediterranean.link).toBe("/trends?ind=sst&dir=increase&place=Mediterranean+Sea&t=since-2003");
    expect(FINDINGS.uzbekistan.link).toContain("country=UZB");
    expect(FINDINGS.antarctica.link).toContain("ind=ozone");
  });
});

describe("the measured maps", () => {
  it("are bundled with the app and cover a real area", () => {
    for (const id of Object.keys(DATA_MAPS) as DataId[]) {
      const map = DATA_MAPS[id];
      expect(existsSync(`public/data/findings/${map.file}`)).toBe(true);
      const [west, south, east, north] = map.bbox;
      expect(east).toBeGreaterThan(west);
      expect(north).toBeGreaterThan(south);
    }
  });

  it("each belong to a stop on the story", () => {
    const shown = new Set(STOPS.map((stop) => stop.data).filter(Boolean));
    expect([...shown].sort()).toEqual((Object.keys(DATA_MAPS) as DataId[]).sort());
  });

  it("have a label at the stop that shows them", () => {
    for (const marker of MARKERS) expect(STOPS[marker.stop].data).not.toBeNull();
  });
});

describe("words for numbers", () => {
  it("always signs numbers, with a real minus", () => {
    expect(signedNumber(0.6135, 2)).toBe("+0.61");
    expect(signedNumber(-0.0044, 4)).toBe("−0.0044");
  });

  it("says the 95% range", () => {
    expect(rangeText(0.434, 0.928, 2)).toBe("95% range +0.43 to +0.93");
    expect(rangeText(-0.00109, 0.00072, 4)).toBe("95% range −0.0011 to +0.0007");
  });

  it("uses the app's own wording for p-values", () => {
    expect(pText(0.0000495)).toBe("p < 0.001");
    expect(pText(0.802)).toBe("p = 0.80");
    expect(pText(0.0478)).toBe("p = 0.0478");
  });

  it("keeps a decimal only where it matters", () => {
    expect(shareText(0.9974)).toBe("99.7%");
    expect(shareText(0.1337)).toBe("13%");
    expect(shareText(0.0861)).toBe("9%");
  });

  it("writes areas plainly", () => {
    expect(areaText(2321587)).toBe("2.3 million km²");
    expect(areaText(4633)).toBe("4,633 km²");
  });

  it("averages a span of years, skipping gaps", () => {
    const series = [
      { year: 2000, value: 1 },
      { year: 2001, value: null },
      { year: 2002, value: 3 },
      { year: 2010, value: 100 },
    ];
    expect(meanBetween(series, 2000, 2002)).toBe(2);
    expect(meanBetween(series, 2003, 2005)).toBeNull();
  });
});

describe("chartShape", () => {
  const { series, verdict } = FINDINGS.mediterranean;
  const shape = chartShape(series, verdict, 480, 92);

  it("draws a point for every year measured, in order, inside the chart", () => {
    expect(shape.points).toHaveLength(series.length);
    for (const point of shape.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(480);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(92);
    }
    expect(shape.points.map((point) => point.x)).toEqual([...shape.points.map((point) => point.x)].sort((a, b) => a - b));
    expect(shape.firstYear).toBe(FINDINGS.mediterranean.startYear);
    expect(shape.lastYear).toBe(FINDINGS.mediterranean.endYear);
  });

  it("draws a rising trend upwards and a falling one downwards (screen y grows downwards)", () => {
    expect(shape.trend.y2).toBeLessThan(shape.trend.y1);
    const aral = FINDINGS.uzbekistan.hotspot;
    const falling = chartShape(aral.series, aral.verdict, 480, 92);
    expect(falling.trend.y2).toBeGreaterThan(falling.trend.y1);
  });

  it("skips years with no value", () => {
    const gappy = chartShape(
      [
        { year: 2000, value: 1 },
        { year: 2001, value: null },
        { year: 2002, value: 2 },
        { year: 2003, value: 3 },
      ],
      { direction: "increase", p: 0.01, slopePerYear: 0.5, lowerPerYear: 0.4, upperPerYear: 0.6, slopePerDecade: 5 },
      100,
      50,
    );
    expect(gappy.points.map((point) => point.year)).toEqual([2000, 2002, 2003]);
  });
});
