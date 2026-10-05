import { describe, expect, it } from "vitest";
import { analysisHref, compareHref, decodeTime, describeQuestion, encodeTime, interpretation, paramsForEdit, queryFromParams, representativeMonth, resultsHeading } from "../query";
import { decodeGeometry } from "../../geo/polyline";
import { parseTrendQuery } from "../../query/parse";
import { bboxPolygon } from "../../geo/geometry";
import type { Hotspot } from "../hotspots";
import type { PeriodPlan } from "../../query/period";
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

describe("trend query URLs", () => {
  it("read a typed question", () => {
    const q = queryFromParams(new URLSearchParams({ q: "where did vegetation decline in Uzbekistan since 2015" }));
    expect(q).toMatchObject({ understood: true, indicator: "vegetation", direction: "decline", place: "Uzbekistan", time: { kind: "since", start: 2015 } });
  });

  it("apply chip edits on top of the text and keep them in the URL", () => {
    const current = new URLSearchParams({ q: "where did vegetation decline in Uzbekistan since 2015" });
    const query = queryFromParams(current);
    const edited = paramsForEdit(current, query, { indicator: "heat", direction: "increase", place: "Kazakhstan", time: { kind: "last", years: 5 }, season: "summer" });
    const q = queryFromParams(edited);
    expect(q).toMatchObject({ indicator: "heat", direction: "increase", place: "Kazakhstan", time: { kind: "last", years: 5 }, season: "summer" });
    expect(edited.get("q")).toBe("where did vegetation decline in Uzbekistan since 2015");
    const months = queryFromParams(paramsForEdit(edited, q, { months: [7, 8] }));
    expect(months.months).toEqual([7, 8]);
  });

  it("round-trip every time form", () => {
    for (const time of [{ kind: "since", start: 2015 }, { kind: "range", start: 2018, end: 2024 }, { kind: "last", years: 10 }, { kind: "year", year: 2022 }, { kind: "versus", baseline: 2013, recent: 2023 }, { kind: "default" }] as const) {
      expect(decodeTime(encodeTime(time))).toEqual(time);
    }
    expect(decodeTime("nonsense")).toBeNull();
  });

  it("accept an exact area from another page", () => {
    const q = queryFromParams(new URLSearchParams({ country: "UZB", ind: "heat" }));
    expect(q.area).toEqual({ country: "UZB", osm: undefined, poly: undefined, name: undefined });
    expect(q.understood).toBe(true);
  });
});

describe("labels", () => {
  it("summarise the interpretation and the results", () => {
    const q = queryFromParams(new URLSearchParams({ q: "where did vegetation decline in Uzbekistan since 2015" }));
    expect(interpretation(q, "Uzbekistan", plan, plan.months)).toBe("Vegetation · Decline · Uzbekistan · 2015→2025 · Apr–Sep");
    expect(resultsHeading(10, q, area, plan)).toBe("Top 10 areas with vegetation decline in Uzbekistan, 2015→2025");
    expect(resultsHeading(0, q, area, plan)).toBe("No areas with vegetation decline in Uzbekistan, 2015→2025");
    expect(resultsHeading(1, q, { ...area, name: "Around Aral Sea" }, plan)).toBe("One area with vegetation decline around the Aral Sea, 2015→2025");
  });
});

describe("describeQuestion", () => {
  it("summarises a question for the search box", () => {
    expect(describeQuestion(parseTrendQuery("dust increase near the Aral Sea"))).toBe("Dust · Increase · near Aral Sea · last 10 years");
    expect(describeQuestion(parseTrendQuery("where did vegetation decline in Uzbekistan since 2015"))).toBe("Vegetation · Decline · Uzbekistan · since 2015");
    expect(describeQuestion(parseTrendQuery("areas that experienced a decline in vegetation health"))).toBe("Vegetation · Decline · map view · last 10 years");
  });
});

describe("hotspot links", () => {
  const q = queryFromParams(new URLSearchParams({ q: "where did vegetation decline in Uzbekistan since 2015" }));

  it("open the full analysis on the hotspot's own outline and period", () => {
    const href = analysisHref(hotspot, q, area, plan, "2026-08");
    const params = new URL(href, "https://x.test").searchParams;
    expect(href.startsWith("/analysis?")).toBe(true);
    expect(decodeGeometry(params.get("poly") as string)).toEqual(hotspot.geometry);
    expect(params.get("name")).toBe("Nukus, Uzbekistan");
    expect([params.get("start"), params.get("end")]).toEqual(["2015-01", "2025-12"]);
    expect(params.get("ds")).toBe("vegetation,climate");
  });

  it("compare the middle of the season, then vs now", () => {
    expect(representativeMonth([4, 5, 6, 7, 8, 9])).toBe(6);
    expect(representativeMonth([12, 1, 2])).toBe(1);
    const params = new URL(compareHref(hotspot, q, plan, plan.months), "https://x.test").searchParams;
    expect(params.get("left")).toBe("MODIS_Terra_L3_NDVI_Monthly");
    expect([params.get("leftDate"), params.get("rightDate")]).toEqual(["2016-06-01", "2024-06-01"]);
    expect(params.get("lat")).toBe("42.4567");
  });
});
