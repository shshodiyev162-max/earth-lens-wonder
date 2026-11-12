import { describe, expect, it } from "vitest";
import { analysisHref, applyEdit, areaAnalysisHref, compareHref, decodeTime, editForParts, encodeTime, filterFor, paramsFor, paramsWithPlace, queryFromParams, representativeMonth, resultsHeading, scanKey, sentenceFor, trendParts, type TrendQuery } from "../query";
import { decodeGeometry } from "../../geo/polyline";
import { INDICATOR_ORDER, type Direction, type IndicatorId } from "../../query/indicators";
import { bboxPolygon } from "../../geo/geometry";
import type { Hotspot } from "../hotspots";
import type { PeriodPlan, TimeSpec } from "../../query/period";
import type { ScanArea } from "../place";

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
const choices = (values: Record<string, string>) => queryFromParams(new URLSearchParams(values));
const VEGETATION_UZB = { ind: "vegetation", dir: "decline", place: "Uzbekistan", t: "since-2015" };

describe("search URLs", () => {
  it("read the choices", () => {
    const q = choices(VEGETATION_UZB);
    expect(q).toMatchObject({ understood: true, indicators: ["vegetation"], place: "Uzbekistan", time: { kind: "since", start: 2015 }, tab: "vegetation" });
    expect(q.filters.vegetation).toEqual({ direction: "decline", minFactor: 1, minAreaKm2: 0, strict: false });
    expect(q.text).toBe("Vegetation decline in Uzbekistan since 2015");
  });

  it("start empty, and ignore typed questions in old links", () => {
    expect(queryFromParams(new URLSearchParams())).toMatchObject({ understood: false, indicators: [], place: null, time: { kind: "default" }, text: "" });
    expect(choices({ q: "where did vegetation decline in Uzbekistan since 2015" })).toMatchObject({ understood: false, indicators: [], place: null });
  });

  it("keep several measures, their directions and filters in the link", () => {
    const q = applyEdit(choices(VEGETATION_UZB), {
      indicators: ["heat", "vegetation"],
      filters: { vegetation: { direction: "decline", minFactor: 2, minAreaKm2: 50, strict: true }, heat: { direction: "increase", minFactor: 1, minAreaKm2: 0, strict: false } },
      tab: "heat",
    });
    const params = paramsFor(q);
    expect(params.has("q")).toBe(false);
    const back = queryFromParams(params);
    expect(back.indicators).toEqual(["vegetation", "heat"]);
    expect(back.filters).toEqual(q.filters);
    expect(back.tab).toBe("heat");
    expect(back.text).toBe("Vegetation decline and heat increase in Uzbekistan since 2015");
  });

  it("rewrite the sentence on every edit", () => {
    const q = applyEdit(choices({ ind: "snow", dir: "decline", place: "Pamirs" }), { season: "all" });
    expect(q.text).toBe("Snow cover decline in Pamirs, all year round");
    expect(applyEdit(q, { filters: { snow: { direction: "any", minFactor: 1, minAreaKm2: 0, strict: false } } }).text).toBe("Snow cover change in Pamirs, all year round");
    const old = choices({ ind: "heat", dir: "increase", place: "Kazakhstan", t: "last-5", season: "summer" });
    expect(old).toMatchObject({ indicators: ["heat"], place: "Kazakhstan", time: { kind: "last", years: 5 }, season: "summer" });
    expect(old.filters.heat?.direction).toBe("increase");
  });

  it("scan again only when what is scanned changes, not the filters", () => {
    const q = choices({ ind: "vegetation", dir: "decline", place: "Uzbekistan" });
    expect(scanKey(applyEdit(q, { filters: { vegetation: { direction: "any", minFactor: 3, minAreaKm2: 10, strict: true } } }))).toBe(scanKey(q));
    expect(scanKey(applyEdit(q, { place: "Kazakhstan" }))).not.toBe(scanKey(q));
  });

  it("use an area picked on the map instead of a place chosen by name", () => {
    const q = applyEdit(choices({ ind: "vegetation", dir: "decline", place: "Uzbekistan" }), { area: { country: "TKM", name: "Turkmenistan" } });
    expect(q).toMatchObject({ place: null, area: { country: "TKM", name: "Turkmenistan" }, text: "Vegetation decline in Turkmenistan" });
    const back = queryFromParams(paramsFor(q));
    expect(back.area).toEqual({ country: "TKM", osm: undefined, poly: undefined, name: "Turkmenistan" });
    expect(scanKey(back)).toBe(scanKey(q));
    // Choosing a place by name again replaces the picked area.
    expect(applyEdit(q, { place: "Mediterranean Sea" })).toMatchObject({ place: "Mediterranean Sea", area: null });
    // Starting from nothing: an area first, then a measure.
    const empty = queryFromParams(new URLSearchParams());
    const drawn = applyEdit(applyEdit(empty, { area: { poly: "abc", name: "Area 1" } }), { indicators: ["vegetation"] });
    expect(drawn).toMatchObject({ understood: true, text: "Vegetation change in Area 1" });
  });

  it("take a place found by search: a sea by name, a place by its exact boundary", () => {
    const current = paramsFor(choices({ ...VEGETATION_UZB, ind: "sst" }));
    const sea = queryFromParams(paramsWithPlace(current, { id: "region:Black Sea", name: "Black Sea", context: "Sea", kind: "water", center: [44, 34], region: "Black Sea", source: "terrascope" }));
    expect(sea).toMatchObject({ indicators: ["sst"], place: "Black Sea", area: null, time: { kind: "since", start: 2015 } });
    const city = queryFromParams(paramsWithPlace(current, { id: "R1", name: "Bukhara", context: "Uzbekistan", kind: "city", center: [39.8, 64.4], osm: { type: "R", id: 1 }, source: "photon" }));
    expect(city).toMatchObject({ place: null, area: { osm: "R1", name: "Bukhara" } });
    const point = queryFromParams(paramsWithPlace(current, { id: "N1", name: "Muynoq", context: "Uzbekistan", kind: "locality", center: [43.8, 59], osm: { type: "N", id: 1 }, source: "photon" }));
    expect(point).toMatchObject({ place: "Muynoq", area: null });
  });

  it("round-trip every time form", () => {
    for (const time of [{ kind: "since", start: 2015 }, { kind: "range", start: 2018, end: 2024 }, { kind: "last", years: 10 }, { kind: "year", year: 2022 }, { kind: "versus", baseline: 2013, recent: 2023 }, { kind: "default" }] as const) {
      expect(decodeTime(encodeTime(time))).toEqual(time);
    }
    expect(decodeTime("nonsense")).toBeNull();
  });
});

describe("every choice survives the link", () => {
  const sets: IndicatorId[][] = [["vegetation"], ["heat", "rainfall"], ["soil", "dust", "snow"], [...INDICATOR_ORDER]];
  const directionSets: ((i: number) => Direction)[] = [() => "decline", () => "increase", () => "any", (i) => (["decline", "increase", "any"] as const)[i % 3]];
  const places: [string | null, boolean][] = [["Uzbekistan", false], ["Aral Sea", true], [null, false], ["Mediterranean Sea", false]];
  const times: TimeSpec[] = [{ kind: "default" }, { kind: "since", start: 2012 }, { kind: "range", start: 2005, end: 2015 }, { kind: "last", years: 20 }, { kind: "year", year: 2021 }, { kind: "versus", baseline: 2003, recent: 2023 }];
  const seasons: [TrendQuery["season"], number[] | null][] = [[null, null], ["all", null], ["growing", null], ["winter", null], [null, [4, 5, 6, 7, 8, 9]], [null, [11, 12, 1, 2]], [null, [7]]];

  it("for every combination of measures, directions, places, periods and months", () => {
    const empty = queryFromParams(new URLSearchParams());
    let checked = 0;
    for (const ids of sets)
      for (const dirs of directionSets)
        for (const [place, near] of places)
          for (const time of times)
            for (const [season, months] of seasons) {
              const filters = Object.fromEntries(ids.map((id, i) => [id, { direction: dirs(i), minFactor: 1, minAreaKm2: 0, strict: false }]));
              const q = applyEdit(empty, { indicators: ids, filters, place, near, time, season, months });
              const back = queryFromParams(paramsFor(q));
              expect({ ids: back.indicators, filters: back.filters, place: back.place, near: back.near, time: back.time, season: back.season, months: back.months, text: back.text }).toEqual({
                ids: INDICATOR_ORDER.filter((id) => ids.includes(id)),
                filters: q.filters,
                place,
                near,
                time,
                season: months ? null : season,
                months: months ? [...months].sort((a, b) => a - b) : null,
                text: q.text,
              });
              checked += 1;
            }
    expect(checked).toBe(4 * 4 * 4 * 6 * 7);
  });
});

describe("measures picked for the place", () => {
  it("are kept as a flag through links and edits", () => {
    const q = choices({ ind: "all", dir: "any", place: "Uzbekistan" });
    expect(q.everything).toBe(true);
    const params = paramsFor(q);
    expect(params.get("ind")).toBe("all");
    expect(queryFromParams(params).everything).toBe(true);
    expect(sentenceFor(q)).toBe("Everything that changed in Uzbekistan");
    // Any measure picked for the place can be the open tab.
    expect(queryFromParams(new URLSearchParams({ ...Object.fromEntries(params), tab: "sst" })).tab).toBe("sst");
  });

  it("are switched off by choosing measures, and back on by asking for suggestions", () => {
    const q = choices({ ind: "all", dir: "decline", place: "Uzbekistan" });
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
    const q = choices({ ind: "all", place: "Uzbekistan" });
    expect(scanKey(q)).not.toBe(scanKey(applyEdit(q, { indicators: ["vegetation", "heat", "rainfall", "soil", "dust", "snow"] })));
  });
});

describe("labels and links", () => {
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
    // A country chosen by name links by its code; a named sea or region by its name.
    expect(new URL(areaAnalysisHref({ ...area, countryId: "UZB" }, null, "vegetation", plan, "2026-08"), "https://x.test").searchParams.get("country")).toBe("UZB");
    const sea = new URL(areaAnalysisHref({ ...area, name: "Mediterranean Sea", kind: "region", region: "Mediterranean Sea" }, null, "sst", plan, "2026-08"), "https://x.test").searchParams;
    expect([sea.get("region"), sea.get("poly")]).toEqual(["Mediterranean Sea", null]);
  });

  it("compare the middle of the season, then vs now", () => {
    expect(representativeMonth([12, 1, 2])).toBe(1);
    const params = new URL(compareHref(hotspot, "vegetation", plan, plan.months), "https://x.test").searchParams;
    expect([params.get("leftDate"), params.get("rightDate")]).toEqual(["2016-06-01", "2024-06-01"]);
  });
});

describe("places added together", () => {
  const both = () => applyEdit(choices({ ind: "vegetation", dir: "decline", place: "Uzbekistan", t: "since-2015" }), { extra: [{ kind: "country", id: "TKM", name: "Turkmenistan" }] });

  it("are part of the search, its sentence and its link", () => {
    const q = both();
    expect(q.text).toBe("Vegetation decline in Uzbekistan + Turkmenistan since 2015");
    const back = queryFromParams(paramsFor(q));
    expect(back.extra).toEqual([{ kind: "country", id: "TKM", name: "Turkmenistan" }]);
    expect(scanKey(back)).toBe(scanKey(q));
    expect(scanKey(q)).not.toBe(scanKey(applyEdit(q, { extra: [] })));
  });

  it("go when a new place is chosen, and stay when only the years change", () => {
    const q = both();
    expect(applyEdit(q, { place: "Kazakhstan" }).extra).toEqual([]);
    expect(applyEdit(q, { area: { country: "KAZ", name: "Kazakhstan" } }).extra).toEqual([]);
    expect(applyEdit(q, { time: { kind: "since", start: 2005 } }).extra).toHaveLength(1);
  });

  it("are listed in order, and any one can be taken out", () => {
    const q = applyEdit(both(), { extra: [{ kind: "country", id: "TKM", name: "Turkmenistan" }, { kind: "region", label: "Aral Sea" }] });
    expect(trendParts(q)).toEqual([{ kind: "place", text: "Uzbekistan" }, { kind: "country", id: "TKM", name: "Turkmenistan" }, { kind: "region", label: "Aral Sea" }]);
    // Taking out the first place: the next one leads.
    const rest = applyEdit(q, editForParts(trendParts(q).slice(1)));
    expect(rest).toMatchObject({ place: null, area: { country: "TKM", name: "Turkmenistan" }, extra: [{ kind: "region", label: "Aral Sea" }] });
    expect(rest.text).toBe("Vegetation decline in Turkmenistan + Aral Sea since 2015");
    expect(applyEdit(q, editForParts([]))).toMatchObject({ place: null, area: null, extra: [] });
  });

  it("never search 'near' a place, which only makes sense for one", () => {
    const near = applyEdit(choices({ ind: "dust", place: "Aral Sea", near: "1" }), {});
    expect(near.near).toBe(true);
    expect(applyEdit(near, { extra: [{ kind: "region", label: "Caspian Sea" }] }).near).toBe(false);
  });

  it("lead the search when a link only has added places", () => {
    const q = queryFromParams(new URLSearchParams([["ind", "sst"], ["add", "region:Black Sea"], ["add", "region:Caspian Sea"], ["add", "area:only-on-this-device"]]));
    expect(q).toMatchObject({ place: "Black Sea", area: null, extra: [{ kind: "region", label: "Caspian Sea" }] });
  });

  it("open together on the Analysis page", () => {
    const parts = trendParts(both()).map((p) => (p.kind === "place" ? { kind: "country" as const, id: "UZB", name: "Uzbekistan" } : p));
    const link = new URL(areaAnalysisHref({ ...area, name: "Uzbekistan + Turkmenistan" }, null, "vegetation", plan, "2026-08", parts), "https://x.test").searchParams;
    expect([link.get("country"), link.get("name"), link.getAll("add"), link.get("poly")]).toEqual(["UZB", "Uzbekistan", ["country:TKM!Turkmenistan"], null]);
    expect(link.get("ds")).toBe("vegetation,climate");
  });

  it("are cleared by a place picked from search", () => {
    const params = paramsFor(both());
    const next = paramsWithPlace(params, { id: "r", name: "Aral Sea", context: "Kazakhstan / Uzbekistan", kind: "water", center: [45, 60], region: "Aral Sea", source: "terrascope" });
    expect(next.getAll("add")).toEqual([]);
  });
});
