import { describe, expect, it } from "vitest";
import { analysisHref, applyEdit, areaAnalysisHref, compareHref, decodeTime, describeQuestion, encodeTime, filterFor, paramsFor, queryFromParams, representativeMonth, resultsHeading, scanKey, sentenceFor, type TrendQuery } from "../query";
import { decodeGeometry } from "../../geo/polyline";
import { parseTrendQuery } from "../../query/parse";
import { INDICATOR_ORDER, type Direction, type IndicatorId } from "../../query/indicators";
import { bboxPolygon } from "../../geo/geometry";
import type { Hotspot } from "../hotspots";
import type { PeriodPlan } from "../../query/period";
import type { ScanArea } from "../place";
import type { TimeSpec } from "../../query/parse";

const plan: PeriodPlan = { kind: "trend", startYear: 2015, endYear: 2025, baseline: [2015, 2017], recent: [2023, 2025], years: [], months: [4, 5, 6, 7, 8, 9], notes: [] };
const area: ScanArea = { name: "Uzbekistan", geometry: bboxPolygon([56, 37, 73, 46]), bbox: [56, 37, 73, 46], center: [41, 64], kind: "country" };
const hotspot: Hotspot = {
  id: "h1",
  rank: 1,
  sign: -1,
  pixels: [],
  areaKm2: 1234,
  center: [42.4567, 59.6123],
  bbox: [59, 42, 60, 43],
  geometry: bboxPolygon([59, 42, 60, 43]),
  meanChange: -0.05,
  meanSlope: -0.005,
  significantShare: 0.8,
  score: 1,
  label: "Nukus, Uzbekistan",
};
const fromText = (q: string) => queryFromParams(new URLSearchParams({ q }));

describe("search URLs", () => {
  it("read a typed question", () => {
    const q = fromText("where did vegetation decline in Uzbekistan since 2015");
    expect(q).toMatchObject({ understood: true, indicators: ["vegetation"], place: "Uzbekistan", time: { kind: "since", start: 2015 }, tab: "vegetation" });
    expect(q.filters.vegetation).toEqual({ direction: "decline", minFactor: 1, minAreaKm2: 0, strict: false });
  });

  it("keep several measures, their directions and filters in the link", () => {
    const q = applyEdit(fromText("vegetation decline in Uzbekistan since 2015"), {
      indicators: ["heat", "vegetation"],
      filters: { vegetation: { direction: "decline", minFactor: 2, minAreaKm2: 50, strict: true }, heat: { direction: "increase", minFactor: 1, minAreaKm2: 0, strict: false } },
      tab: "heat",
    });
    const back = queryFromParams(paramsFor(q));
    expect(back.indicators).toEqual(["vegetation", "heat"]);
    expect(back.filters).toEqual(q.filters);
    expect(back.tab).toBe("heat");
    expect(back.text).toBe("Vegetation decline and heat increase in Uzbekistan since 2015");
  });

  it("rewrite the sentence on every edit, and read old links", () => {
    const q = applyEdit(fromText("snow cover loss in the Pamirs"), { season: "all" });
    expect(q.text).toBe("Snow cover decline in Pamirs, all year round");
    const legacy = queryFromParams(new URLSearchParams({ q: "x", ind: "heat", dir: "increase", place: "Kazakhstan", t: "last-5", season: "summer" }));
    expect(legacy).toMatchObject({ indicators: ["heat"], place: "Kazakhstan", time: { kind: "last", years: 5 }, season: "summer" });
    expect(legacy.filters.heat?.direction).toBe("increase");
  });

  it("keep the typed words when a filter doesn't change them", () => {
    const q = fromText("where did vegetation decline in Uzbekistan since 2015");
    expect(applyEdit(q, { filters: { vegetation: { direction: "decline", minFactor: 2, minAreaKm2: 0, strict: false } } }).text).toBe(q.text);
    expect(applyEdit(q, { filters: { vegetation: { direction: "any", minFactor: 1, minAreaKm2: 0, strict: false } } }).text).toBe("Vegetation change in Uzbekistan since 2015");
  });

  it("scan again only when what is scanned changes, not the filters", () => {
    const q = fromText("vegetation decline in Uzbekistan");
    expect(scanKey(applyEdit(q, { filters: { vegetation: { direction: "any", minFactor: 3, minAreaKm2: 10, strict: true } } }))).toBe(scanKey(q));
    expect(scanKey(applyEdit(q, { place: "Kazakhstan" }))).not.toBe(scanKey(q));
  });

  it("use an area picked on the map instead of a typed place", () => {
    const q = applyEdit(fromText("vegetation decline in Uzbekistan"), { area: { country: "TKM", name: "Turkmenistan" } });
    expect(q).toMatchObject({ place: null, area: { country: "TKM", name: "Turkmenistan" }, text: "Vegetation decline in Turkmenistan" });
    const back = queryFromParams(paramsFor(q));
    expect(back.area).toEqual({ country: "TKM", osm: undefined, poly: undefined, name: "Turkmenistan" });
    expect(scanKey(back)).toBe(scanKey(q));
    // Typing a place again replaces the picked area.
    expect(applyEdit(q, { place: "Tashkent" })).toMatchObject({ place: "Tashkent", area: null });
    // Starting from nothing (step by step): an area first, then a measure.
    const empty = queryFromParams(new URLSearchParams());
    const drawn = applyEdit(applyEdit(empty, { area: { poly: "abc", name: "Area 1" } }), { indicators: ["vegetation"] });
    expect(drawn).toMatchObject({ understood: true, text: "Vegetation change in Area 1" });
  });

  it("asks before scanning things it can't measure", () => {
    const q = fromText("is the Aral Sea drying up");
    expect(q).toMatchObject({ understood: false, indicators: [], place: "Aral Sea" });
    expect(q.notes[0].closest).toEqual(["rainfall", "evaporation", "soil", "vegetation"]);
    const picked = applyEdit(q, { indicators: ["rainfall"], filters: { rainfall: { direction: "decline", minFactor: 1, minAreaKm2: 0, strict: false } } });
    expect(picked.text).toBe("Rainfall decline in Aral Sea");
    expect(picked.notes).toEqual([]);
  });

  it("round-trip every time form", () => {
    for (const time of [{ kind: "since", start: 2015 }, { kind: "range", start: 2018, end: 2024 }, { kind: "last", years: 10 }, { kind: "year", year: 2022 }, { kind: "versus", baseline: 2013, recent: 2023 }, { kind: "default" }] as const) {
      expect(decodeTime(encodeTime(time))).toEqual(time);
    }
    expect(decodeTime("nonsense")).toBeNull();
  });
});

describe("the sentence reads back as the same search", () => {
  const sets: IndicatorId[][] = [["vegetation"], ["heat", "rainfall"], ["soil", "dust", "snow"], [...INDICATOR_ORDER]];
  const directionSets: ((i: number) => Direction)[] = [() => "decline", () => "increase", () => "any", (i) => (["decline", "increase", "any"] as const)[i % 3]];
  const places: [string | null, boolean][] = [["Uzbekistan", false], ["Aral Sea", true], [null, false], ["New South Wales", false]];
  const times: TimeSpec[] = [{ kind: "default" }, { kind: "since", start: 2012 }, { kind: "range", start: 2005, end: 2015 }, { kind: "last", years: 20 }, { kind: "year", year: 2021 }, { kind: "versus", baseline: 2003, recent: 2023 }];
  const seasons: [TrendQuery["season"], number[] | null][] = [[null, null], ["all", null], ["growing", null], ["winter", null], ["cold", null], ["summer", null], [null, [4, 5, 6, 7, 8, 9]], [null, [11, 12, 1, 2]], [null, [1, 3, 7]], [null, [7]]];

  let checked = 0;
  for (const ids of sets)
    for (const dirs of directionSets)
      for (const [place, near] of places)
        for (const time of times)
          for (const [season, months] of seasons) {
            const filters = Object.fromEntries(ids.map((id, i) => [id, { direction: dirs(i), minFactor: 1, minAreaKm2: 0, strict: false }]));
            const sentence = sentenceFor({ indicators: ids, filters, place, near, area: null, time, season, months });
            const parsed = parseTrendQuery(sentence);
            const got = { ids: INDICATOR_ORDER.filter((id) => parsed.indicators.includes(id)), dirs: ids.map((id) => parsed.directions[id]), place: parsed.place, near: parsed.near, time: parsed.time, season: parsed.season, months: parsed.months };
            const want = { ids, dirs: ids.map((_, i) => dirs(i)), place, near, time, season, months: months ? [...months].sort((a, b) => a - b) : null };
            if (JSON.stringify({ ...got, months: got.months ? [...got.months].sort((a, b) => a - b) : null }) !== JSON.stringify(want)) {
              it(sentence, () => expect(got).toEqual(want));
            }
            checked += 1;
          }
  it(`checked ${4 * 4 * 4 * 6 * 10} combinations`, () => expect(checked).toBe(3840));
});

describe("measures picked for the place", () => {
  it("are kept as a flag through links and edits", () => {
    const q = queryFromParams(new URLSearchParams({ q: "what changed in Uzbekistan" }));
    expect(q.everything).toBe(true);
    const params = paramsFor(q);
    expect(params.get("ind")).toBe("all");
    expect(queryFromParams(params).everything).toBe(true);
    expect(sentenceFor(q)).toBe("Everything that changed in Uzbekistan");
    // Any measure picked for the place can be the open tab.
    expect(queryFromParams(new URLSearchParams({ ...Object.fromEntries(params), tab: "sst" })).tab).toBe("sst");
  });

  it("are switched off by choosing measures, and back on by asking for suggestions", () => {
    const q = queryFromParams(new URLSearchParams({ q: "everything that declined in Uzbekistan" }));
    const picked = applyEdit(q, { indicators: ["vegetation"] });
    expect(picked.everything).toBe(false);
    expect(picked.text).toBe("Vegetation decline in Uzbekistan");
    const back = applyEdit(picked, { everything: true });
    expect(back.everything).toBe(true);
    expect(back.text).toBe("Everything that declined in Uzbekistan");
    // Measures picked later share the direction asked for everything.
    expect(filterFor(back, "sst").direction).toBe("decline");
  });

  it("change what is scanned", () => {
    const q = queryFromParams(new URLSearchParams({ q: "what changed in Uzbekistan" }));
    expect(scanKey(q)).not.toBe(scanKey(applyEdit(q, { indicators: ["vegetation", "heat", "rainfall", "soil", "dust", "snow"] })));
  });
});

describe("labels and links", () => {
  it("summarise a question for the search boxes", () => {
    expect(describeQuestion(parseTrendQuery("dust increase near the Aral Sea"))).toBe("Dust · Increase · near Aral Sea · last 10 years");
    expect(describeQuestion(parseTrendQuery("vegetation and rainfall decline in Uzbekistan since 2015"))).toBe("Vegetation + Rainfall · Decline · Uzbekistan · since 2015");
    expect(describeQuestion(parseTrendQuery("what changed in Uzbekistan"))).toBe("Measures that suit the place · Any change · Uzbekistan · last 10 years");
    expect(describeQuestion(parseTrendQuery("is the Aral Sea drying up"))).toBe("Closest measures for “drying up” · Aral Sea · last 10 years");
  });

  it("head the results", () => {
    expect(resultsHeading(10, "vegetation", "decline", area, plan)).toBe("Top 10 areas with vegetation decline in Uzbekistan, 2015→2025");
    expect(resultsHeading(1, "vegetation", "decline", { ...area, name: "Around Aral Sea" }, plan)).toBe("One area with vegetation decline around the Aral Sea, 2015→2025");
  });

  it("open the full analysis on the hotspot's own outline and period", () => {
    const params = new URL(analysisHref(hotspot, "vegetation", area, plan, "2026-08"), "https://x.test").searchParams;
    expect(decodeGeometry(params.get("poly") as string)).toEqual(hotspot.geometry);
    // The growing season of each year, so the Analysis page tests the same months.
    expect([params.get("start"), params.get("end"), params.get("season"), params.get("ds")]).toEqual(["2015-04", "2025-09", "m-4.5.6.7.8.9", "vegetation,climate"]);
  });

  it("send a comparison of two seasons to the Analysis page as a comparison", () => {
    const versus = { ...plan, kind: "comparison" as const, baseline: [2003, 2003] as [number, number], recent: [2023, 2023] as [number, number] };
    const params = new URL(analysisHref(hotspot, "vegetation", area, versus, "2026-08"), "https://x.test").searchParams;
    expect([params.get("period"), params.get("base"), params.get("recent")]).toEqual(["compare", "2003-2003", "2023-2023"]);
  });

  it("open the full analysis for the whole area, on the same country or outline", () => {
    const country = new URL(areaAnalysisHref(area, { country: "UZB", name: "Uzbekistan" }, "heat", plan, "2026-08"), "https://x.test").searchParams;
    expect([country.get("country"), country.get("poly"), country.get("name"), country.get("ds")]).toEqual(["UZB", null, "Uzbekistan", "surfaceHeat,climate"]);
    const view = new URL(areaAnalysisHref({ ...area, kind: "view" }, null, "vegetation", plan, "2026-08"), "https://x.test").searchParams;
    expect(decodeGeometry(view.get("poly") as string)).toEqual(area.geometry);
    expect(view.get("name")).toBe("Map view");
    // A typed country found in the bundled outlines links by its code.
    expect(new URL(areaAnalysisHref({ ...area, countryId: "UZB" }, null, "vegetation", plan, "2026-08"), "https://x.test").searchParams.get("country")).toBe("UZB");
  });

  it("compare the middle of the season, then vs now", () => {
    expect(representativeMonth([12, 1, 2])).toBe(1);
    const params = new URL(compareHref(hotspot, "vegetation", plan, plan.months), "https://x.test").searchParams;
    expect([params.get("leftDate"), params.get("rightDate")]).toEqual(["2016-06-01", "2024-06-01"]);
  });
});
