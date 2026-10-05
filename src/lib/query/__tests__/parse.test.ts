import { describe, expect, it } from "vitest";
import { parseTrendQuery } from "../parse";
import { monthsLabel, seasonMonths } from "../indicators";

const parse = parseTrendQuery;

describe("the challenge examples", () => {
  it("areas that experienced a decline in vegetation health", () => {
    const q = parse("areas that experienced a decline in vegetation health");
    expect(q).toMatchObject({ isTrendQuery: true, indicator: "vegetation", direction: "decline", place: null, time: { kind: "default" } });
  });

  it("where did vegetation decline in Uzbekistan since 2015", () => {
    const q = parse("where did vegetation decline in Uzbekistan since 2015");
    expect(q).toMatchObject({ indicator: "vegetation", direction: "decline", place: "Uzbekistan", time: { kind: "since", start: 2015 } });
  });

  it("places getting hotter in Central Asia over the last 10 years", () => {
    const q = parse("places getting hotter in Central Asia over the last 10 years");
    expect(q).toMatchObject({ indicator: "heat", direction: "increase", place: "Central Asia", time: { kind: "last", years: 10 } });
  });

  it("drought in Bukhara region 2021–2023", () => {
    const q = parse("drought in Bukhara region 2021–2023");
    expect(q).toMatchObject({ indicator: "rainfall", direction: "decline", place: "Bukhara region", time: { kind: "range", start: 2021, end: 2023 } });
  });

  it("dust increase near the Aral Sea", () => {
    const q = parse("dust increase near the Aral Sea");
    expect(q).toMatchObject({ indicator: "dust", direction: "increase", place: "Aral Sea", near: true });
  });

  it("snow cover loss in the Pamirs", () => {
    const q = parse("snow cover loss in the Pamirs");
    expect(q).toMatchObject({ indicator: "snow", direction: "decline", place: "Pamirs" });
  });

  it("summer 2023 vs summer 2013", () => {
    const q = parse("surface heat in Tashkent summer 2023 vs summer 2013");
    expect(q).toMatchObject({ indicator: "heat", place: "Tashkent", season: "summer", time: { kind: "versus", baseline: 2013, recent: 2023 } });
  });
});

describe("indicators", () => {
  const cases: [string, string][] = [
    ["NDVI change in Kazakhstan", "vegetation"],
    ["where is it greening in China", "vegetation"],
    ["deforestation in the Amazon since 2005", "vegetation"],
    ["crop loss in the Fergana Valley", "vegetation"],
    ["land surface temperature rise in Iran", "heat"],
    ["warming in Siberia", "heat"],
    ["heatwaves in Pakistan 2022", "heat"],
    ["less rainfall in Morocco", "rainfall"],
    ["precipitation trend in Ethiopia", "rainfall"],
    ["where is it getting drier in Kazakhstan", "rainfall"],
    ["soil moisture decline in the Sahel", "soil"],
    ["drying soils in Spain", "soil"],
    ["aerosols over Delhi", "dust"],
    ["sandstorms in Turkmenistan", "dust"],
    ["air quality in Beijing since 2010", "dust"],
    ["snowpack in the Alps", "snow"],
    ["glacier retreat in the Himalayas", "snow"],
    ["vegetation decline during the drought in Somalia", "vegetation"],
  ];
  it.each(cases)("%s → %s", (text, indicator) => {
    expect(parse(text).indicator).toBe(indicator);
  });

  it("treats plain places as place searches, not trend questions", () => {
    expect(parse("Bukhara").isTrendQuery).toBe(false);
    expect(parse("Tashkent, Uzbekistan").isTrendQuery).toBe(false);
    expect(parse("39.77, 64.42").isTrendQuery).toBe(false);
  });
});

describe("directions", () => {
  const cases: [string, string][] = [
    ["vegetation decrease in Kenya", "decline"],
    ["NDVI dropped in Iraq", "decline"],
    ["browning of grasslands in Mongolia", "decline"],
    ["greener cities in India", "increase"],
    ["more dust in Iran", "increase"],
    ["dustier air in Xinjiang", "increase"],
    ["cooling in Antarctica", "decline"],
    ["snow melting in the Rockies", "decline"],
    ["wetter summers in Bangladesh", "increase"],
    ["more drought in Syria", "decline"],
    ["vegetation trends in Peru", "any"],
    ["heat in Tashkent", "any"],
  ];
  it.each(cases)("%s → %s", (text, direction) => {
    expect(parse(text).direction).toBe(direction);
  });
});

describe("places", () => {
  const cases: [string, string | null][] = [
    ["vegetation decline in Karakalpakstan", "Karakalpakstan"],
    ["heat around Samarkand since 2010", "Samarkand"],
    ["dust across the Kyzylkum Desert", "Kyzylkum Desert"],
    ["Uzbekistan vegetation 2015-2024", "Uzbekistan"],
    ["rainfall decline over East Africa in the last 20 years", "East Africa"],
    ["snow cover loss in the world", null],
    ["vegetation change in this area", null],
    ["greening of the Loess Plateau", "Loess Plateau"],
  ];
  it.each(cases)("%s → %s", (text, place) => {
    expect(parse(text).place).toBe(place);
  });

  it("keeps capital letters from the original text", () => {
    expect(parse("NDVI decline in New South Wales since 2012").place).toBe("New South Wales");
  });
});

describe("time", () => {
  it("reads ranges written many ways", () => {
    for (const text of ["heat 2018-2024 in Iran", "heat 2018–2024 in Iran", "heat from 2018 to 2024 in Iran", "heat between 2018 and 2024 in Iran", "heat 2018 through 2024 in Iran"]) {
      expect(parse(text).time).toEqual({ kind: "range", start: 2018, end: 2024 });
    }
  });

  it("reads 'last N years' and decades", () => {
    expect(parse("dust in Iraq in the past 5 years").time).toEqual({ kind: "last", years: 5 });
    expect(parse("dust in Iraq over the last decade").time).toEqual({ kind: "last", years: 10 });
    expect(parse("dust in Iraq over the past two decades").time).toEqual({ kind: "last", years: 20 });
    expect(parse("dust in Iraq for the last twenty years").time).toEqual({ kind: "last", years: 20 });
  });

  it("reads 'since', 'after' and a single year", () => {
    expect(parse("greening in China since 2001").time).toEqual({ kind: "since", start: 2001 });
    expect(parse("greening in China after 2010").time).toEqual({ kind: "since", start: 2010 });
    expect(parse("drought in Kenya in 2022").time).toEqual({ kind: "year", year: 2022 });
  });

  it("reads comparisons with seasons and months", () => {
    expect(parse("July 2023 vs July 2013 heat in Rome")).toMatchObject({ months: [7], time: { kind: "versus", baseline: 2013, recent: 2023 } });
    expect(parse("vegetation 2005 versus 2020 in Iraq").time).toEqual({ kind: "versus", baseline: 2005, recent: 2020 });
    expect(parse("snow in winter 2010 compared to winter 2024 in the Alps")).toMatchObject({ season: "winter", time: { kind: "versus", baseline: 2010, recent: 2024 } });
  });

  it("reads a season on its own", () => {
    expect(parse("vegetation decline during the growing season in Ukraine").season).toBe("growing");
    expect(parse("hotter summers in Spain").season).toBe("summer");
  });

  it("does not take years out of the place", () => {
    expect(parse("drought in Bukhara region 2021-2023").place).toBe("Bukhara region");
  });
});

describe("seasons", () => {
  it("flip for the southern hemisphere", () => {
    expect(seasonMonths("summer", 40)).toEqual([6, 7, 8]);
    expect(seasonMonths("summer", -30)).toEqual([12, 1, 2]);
    expect(seasonMonths("growing", -30)).toEqual([10, 11, 12, 1, 2, 3]);
    expect(seasonMonths("all", -30)).toHaveLength(12);
  });

  it("label month sets", () => {
    expect(monthsLabel([4, 5, 6, 7, 8, 9])).toBe("Apr–Sep");
    expect(monthsLabel([12, 1, 2])).toBe("Dec–Feb");
    expect(monthsLabel([1, 3, 7])).toBe("Jan, Mar, Jul");
    expect(monthsLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("All months");
  });
});
