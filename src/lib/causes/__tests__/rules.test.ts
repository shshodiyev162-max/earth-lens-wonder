import { describe, expect, it } from "vitest";
import type { TrendVerdict } from "@/lib/analysis/stats";
import { INDICATOR_ORDER } from "@/lib/query/indicators";
import { COVER_GROUPS, type CoverGroup, type LandCover } from "@/lib/trends/landcover";
import type { ChangeShape, DriverEffect, WeatherCheck } from "../model";
import { FAMILY_DRIVERS, familyOfIndicator, familyOfMetric, fitsWith, MAX_CAUSES, possibleCauses, shareWords, type CauseEvidence } from "../rules";

function verdict(direction: TrendVerdict["direction"], p: number, slopePerYear: number): TrendVerdict {
  return {
    direction,
    label: direction === "decline" ? "Significant decline" : direction === "increase" ? "Significant increase" : "No clear trend",
    p,
    slopePerYear,
    lowerPerYear: slopePerYear * 1.5,
    upperPerYear: slopePerYear * 0.5,
    slopePerDecade: slopePerYear * 10,
    years: 20,
    method: "Mann–Kendall + Sen's slope",
  };
}

function cover(shares: Partial<Record<CoverGroup, number>>, year = 2024): LandCover {
  const full = Object.fromEntries(COVER_GROUPS.map((g) => [g, shares[g] ?? 0])) as Record<CoverGroup, number>;
  return { year, km2: full, totalKm2: 1000, shares: full };
}

const rainEffect = (share: number, slopePerYear = -6, p = 0.01): DriverEffect => ({
  id: "rain",
  window: "year",
  coefficient: 0.0006,
  verdict: verdict(p < 0.05 ? "decline" : "none", p, slopePerYear),
  slopePerYear,
  mean: 420,
  share,
});

function weather(outcome: WeatherCheck["outcome"], extra: Partial<WeatherCheck> = {}): WeatherCheck {
  return {
    outcome,
    years: 20,
    skill: 0.55,
    explained: 0.9,
    slopePerYear: -0.004,
    residual: verdict("none", 0.6, -0.0002),
    leftOver: false,
    effects: [rainEffect(0.85)],
    ...extra,
  };
}

const gradual: ChangeShape = { kind: "gradual", recovering: false };

function evidence(overrides: Partial<CauseEvidence> = {}): CauseEvidence {
  return {
    family: "plants",
    direction: "decline",
    noun: "plant greenness",
    months: [4, 5, 6, 7, 8, 9],
    weather: weather("weather"),
    shape: gradual,
    fire: { status: "skipped", reason: "notSudden" },
    people: { status: "skipped", reason: "after2020" },
    cover: cover({ grass: 0.6, barren: 0.3, cropland: 0.1 }),
    ...overrides,
  };
}

describe("which measures can have causes looked for", () => {
  it("covers plants, ground heat, water, snow and dust, and nothing else", () => {
    expect(familyOfIndicator("vegetation")).toBe("plants");
    expect(familyOfIndicator("nightHeat")).toBe("heat");
    expect(familyOfIndicator("waterStorage")).toBe("water");
    expect(familyOfIndicator("snow")).toBe("snow");
    expect(familyOfIndicator("haze")).toBe("dust");
    expect(familyOfMetric("ndvi")).toBe("plants");
    expect(familyOfMetric("aod")).toBe("dust");
    // The weather itself, gases, the sea and the upper air have no causes this site can test.
    for (const id of ["rainfall", "airTemp", "ozone", "methane", "sst", "upperAir"] as const) expect(familyOfIndicator(id)).toBeNull();
    expect(familyOfMetric("rain")).toBeNull();
  });

  it("tests each kind of measure against two kinds of weather", () => {
    for (const drivers of Object.values(FAMILY_DRIVERS)) expect(drivers).toHaveLength(2);
    // Every family is reachable from the Trends measures.
    const families = new Set(INDICATOR_ORDER.map(familyOfIndicator).filter(Boolean));
    expect([...families].sort()).toEqual(Object.keys(FAMILY_DRIVERS).sort());
  });
});

describe("possible causes", () => {
  it("names drier years when rain falls and accounts for the trend", () => {
    const report = possibleCauses(evidence());
    expect(report.causes[0].id).toBe("drier");
    expect(report.causes[0].title).toBe("Drier years");
    expect(report.causes[0].strength).toBe("strong");
    const words = report.causes[0].because.join(" ");
    expect(words).toContain("Rainfall in the 12 months up to the end of each season fell by about 14% a decade");
    expect(words).toContain("In years with less rain, plant greenness here is lower.");
    expect(words).toContain("no clear trend is left");
    // When the weather accounts for it, people aren't offered as a cause.
    expect(report.causes.some((c) => c.id === "people" || c.id === "notWeather")).toBe(false);
  });

  it("is only weakly sure when the rain's own trend is unclear and the weather explains part", () => {
    const report = possibleCauses(evidence({ weather: weather("partly", { explained: 0.4, effects: [rainEffect(0.3, -2, 0.3)] }) }));
    expect(report.causes[0]).toMatchObject({ id: "drier", strength: "weak" });
    expect(report.causes[0].because[0]).toContain("not a clear trend on its own");
  });

  it("names fire when fires burned far more often around a sudden drop", () => {
    const report = possibleCauses(
      evidence({
        weather: weather("noLink", { skill: 0.05 }),
        shape: { kind: "sudden", before: 2018, after: 2019, step: -0.12, recovering: true },
        fire: {
          status: "checked",
          check: { during: { checked: 36, withFire: 9, from: "2018-10-01", to: "2019-09-30" }, before: { checked: 36, withFire: 1, from: "2017-10-01", to: "2018-09-30" }, outcome: "unusual" },
        },
        cover: cover({ forest: 0.7, grass: 0.3 }),
      }),
    );
    expect(report.causes[0]).toMatchObject({ id: "fire", title: "Fire", strength: "strong" });
    expect(report.causes[0].because.join(" ")).toContain("fires on 9 of 36 days checked in that time, against 1 of 36 days");
    expect(report.causes[0].because.join(" ")).toContain("coming back, as plants do after a fire");
    // Fire already accounts for the jump: no separate "one-off event".
    expect(report.causes.some((c) => c.id === "oneOff")).toBe(false);
  });

  it("calls a sudden change the weather and fires don't explain a one-off event, with what fits the land", () => {
    const report = possibleCauses(
      evidence({
        weather: weather("notWeather", { explained: 0.05, leftOver: true, residual: verdict("decline", 0.002, -0.004), effects: [rainEffect(0.05, -0.2, 0.8)] }),
        shape: { kind: "sudden", before: 2012, after: 2013, step: -0.1, recovering: false },
        fire: {
          status: "checked",
          check: { during: { checked: 36, withFire: 4, from: "2012-10-01", to: "2013-09-30" }, before: { checked: 36, withFire: 3, from: "2011-10-01", to: "2012-09-30" }, outcome: "usual" },
        },
        cover: cover({ forest: 0.55, cropland: 0.3, grass: 0.15 }),
      }),
    );
    const oneOff = report.causes[0];
    expect(oneOff).toMatchObject({ id: "oneOff", title: "A one-off event", strength: "strong" });
    expect(oneOff.because.join(" ")).toContain("dropped all at once between 2012 and 2013");
    expect(oneOff.because.join(" ")).toContain("no more often than before");
    expect(oneOff.fitsWith?.[0]).toBe("trees cut down or burnt (forest: 55% of the area)");
    expect(oneOff.fitsWith?.[1]).toContain("cropland: 30% of the area");
    expect(report.causes.some((c) => c.id === "notWeather")).toBe(false);
  });

  it("says when a day or two of fire are too few to tell", () => {
    const report = possibleCauses(
      evidence({
        weather: weather("noLink", { skill: 0 }),
        shape: { kind: "sudden", before: 2018, after: 2019, step: -0.1, recovering: false },
        fire: {
          status: "checked",
          check: { during: { checked: 58, withFire: 1, from: "2018-07-01", to: "2019-09-30" }, before: { checked: 58, withFire: 0, from: "2017-03-31", to: "2018-06-30" }, outcome: "few" },
        },
      }),
    );
    const words = report.causes[0].because.join(" ");
    expect(words).toContain("Fires were seen on 1 of the 58 days checked, too few to tell whether one caused it.");
    expect(words).not.toContain("no more often than before");
    expect(report.causes[0].landYear).toBe(2024);
  });

  it("says something other than the weather is at work when a gradual trend is left over, and weighs more people", () => {
    const report = possibleCauses(
      evidence({
        family: "heat",
        direction: "increase",
        noun: "daytime ground heat",
        weather: weather("notWeather", { explained: 0.1, leftOver: true, residual: verdict("increase", 0.004, 0.05), effects: [] }),
        people: {
          status: "checked",
          check: {
            first: { year: 2000, people: 400_000, km2: 2000, crowdedShare: 0.04 },
            last: { year: 2020, people: 640_000, km2: 2000, crowdedShare: 0.09 },
            growth: 0.6,
            density: 320,
            strength: "some",
          },
        },
        cover: cover({ urban: 0.12, cropland: 0.5, grass: 0.38 }),
      }),
    );
    expect(report.causes.map((c) => c.id)).toEqual(["notWeather", "people"]);
    expect(report.causes[0].strength).toBe("strong");
    expect(report.causes[0].because.join(" ")).toContain("Air temperature and soil wetness follow the ups and downs of daytime ground heat");
    expect(report.causes[0].because.join(" ")).toContain("still rises clearly (p = 0.004)");
    expect(report.causes[0].fitsWith).toEqual(["building (streets and roofs hold heat) (towns and cities: 12% of the area)", "less watering of fields (cropland: 50% of the area)"]);
    const people = report.causes[1].because.join(" ");
    expect(people).toContain("about 400,000 people in 2000 to 640,000 in 2020 (+60%)");
    expect(people).toContain("from 4% to 9% of the area");
  });

  it("says nothing stands out when no check finds anything", () => {
    const report = possibleCauses(evidence({ weather: weather("noLink", { skill: 0.08 }), shape: { kind: "none", recovering: false } }));
    expect(report.causes).toEqual([]);
    expect(report.checks.find((c) => c.id === "weather")?.result).toContain("predict about 8% of the ups and downs");
    expect(report.checks.find((c) => c.id === "weather")?.result).toContain("too little to say");
  });

  it("lists every check, and leaves out the ones that don't apply to the measure", () => {
    const report = possibleCauses(evidence({ fire: { status: "skipped", reason: "measure" }, people: { status: "skipped", reason: "measure" } }));
    expect(report.checks.map((c) => c.id)).toEqual(["weather", "shape", "land"]);
    expect(report.checks.find((c) => c.id === "land")).toEqual({ id: "land", label: "Land in 2024 (MODIS land cover)", result: expect.stringContaining("Mostly grassland") });
    const other = possibleCauses(evidence({ weather: null }));
    expect(other.checks.map((c) => c.id)).toEqual(["weather", "shape", "fire", "people", "land"]);
    expect(other.checks[0].result).toContain("couldn't be reached");
    expect(other.checks[2].result).toContain("wasn't sudden");
    expect(other.checks[3].result).toContain("stop at 2020");
    expect(other.notMeasured).toContain("grazing");
  });

  it("never shows more than three causes, strongest first", () => {
    const report = possibleCauses(
      evidence({
        weather: weather("partly", {
          explained: 0.5,
          leftOver: true,
          residual: verdict("decline", 0.03, -0.002),
          effects: [rainEffect(0.4), { ...rainEffect(0.3), id: "temp", window: "season", slopePerYear: 0.04, coefficient: -0.03, mean: 18 }],
        }),
        shape: { kind: "sudden", before: 2010, after: 2011, step: -0.1, recovering: false },
        fire: { status: "failed" },
        people: {
          status: "checked",
          check: { first: { year: 2000, people: 1e5, km2: 1000, crowdedShare: 0 }, last: { year: 2020, people: 2e5, km2: 1000, crowdedShare: 0 }, growth: 1, density: 200, strength: "some" },
        },
      }),
    );
    expect(report.causes.length).toBe(MAX_CAUSES);
    const rank = { strong: 0, some: 1, weak: 2 };
    const strengths = report.causes.map((c) => rank[c.strength]);
    expect([...strengths].sort()).toEqual(strengths);
  });

  it("keeps to plain words", () => {
    const report = possibleCauses(evidence());
    const text = JSON.stringify(report);
    for (const word of ["JSON", "pipeline", "LLM", "regression", "residual", "RESTREND", "coefficient"]) expect(text).not.toContain(word);
  });
});

describe("what fits the land", () => {
  it("only offers human causes the land makes possible", () => {
    expect(fitsWith("dust", "increase", cover({ barren: 0.7, water: 0.02, wetland: 0.02 }))).toEqual([
      "bare ground spreading (bare ground and desert: 70% of the area)",
      "lakes or wetlands drying out (water and wetlands: 4% of the area)",
    ]);
    expect(fitsWith("snow", "decline", cover({ snow: 0.9 }))).toEqual([]);
    expect(fitsWith("plants", "decline", null)).toEqual([]);
  });

  it("words shares honestly at the ends", () => {
    expect(shareWords(0.97)).toBe("all or nearly all");
    expect(shareWords(0.62)).toBe("about 62%");
    expect(shareWords(0.02)).toBe("almost none");
    expect(shareWords(-0.3)).toContain("the other way");
  });
});
