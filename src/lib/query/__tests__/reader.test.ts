import { describe, expect, it } from "vitest";
import { parseTrendQuery } from "../parse";
import { INDICATOR_ORDER } from "../indicators";

// How each question must be read: measures with their directions, place and time. Written as
// "measure:direction" so a mismatch reads plainly in the test output.
const GOLDEN: [string, { measures: string; place: string | null; time?: object; notes?: string; near?: boolean }][] = [
  ["where did vegetation decline in Uzbekistan since 2015", { measures: "vegetation:decline", place: "Uzbekistan", time: { kind: "since", start: 2015 } }],
  ["show me where it got hotter in Kazakhstan", { measures: "heat:increase", place: "Kazakhstan" }],
  ["Uzbekistan vegetation 2015-2024", { measures: "vegetation:any", place: "Uzbekistan", time: { kind: "range", start: 2015, end: 2024 } }],
  ["how has rainfall changed in Tashkent over the last 5 years", { measures: "rainfall:any", place: "Tashkent", time: { kind: "last", years: 5 } }],
  ["vegetation in Fergana valley", { measures: "vegetation:any", place: "Fergana valley" }],
  ["is the Aral Sea drying up", { measures: "", place: "Aral Sea", notes: "water" }],
  ["dust storms around Nukus", { measures: "dust:any", place: "Nukus", near: true }],
  ["greening in China", { measures: "vegetation:increase", place: "China" }],
  ["where are crops failing in Uzbekistan", { measures: "vegetation:decline", place: "Uzbekistan" }],
  ["drought in Africa", { measures: "rainfall:decline", place: "Africa" }],
  ["temperature change in Samarkand region between 2010 and 2020", { measures: "heat:any", place: "Samarkand region", time: { kind: "range", start: 2010, end: 2020 } }],
  ["snow in the Alps", { measures: "snow:any", place: "Alps" }],
  ["less snow on Tian Shan mountains since 2005", { measures: "snow:decline", place: "Tian Shan mountains", time: { kind: "since", start: 2005 } }],
  ["NDVI Karakalpakstan", { measures: "vegetation:any", place: "Karakalpakstan" }],
  ["where is land degrading in Turkmenistan", { measures: "vegetation:decline", place: "Turkmenistan" }],
  ["show deforestation in Brazil", { measures: "vegetation:decline", place: "Brazil" }],
  ["where did it rain more in Pakistan in 2022", { measures: "rainfall:increase", place: "Pakistan", time: { kind: "year", year: 2022 } }],
  ["heat in Tashkent summer 2023 vs summer 2013", { measures: "heat:any", place: "Tashkent", time: { kind: "versus", baseline: 2013, recent: 2023 } }],
  ["where did soil get drier in Kazakhstan during the last decade", { measures: "soil:decline", place: "Kazakhstan", time: { kind: "last", years: 10 } }],
  ["air pollution in Delhi", { measures: "dust:any", place: "Delhi", notes: "airPollution" }],
  ["changes in Bukhara", { measures: "everything:any", place: "Bukhara" }],
  ["what changed in Uzbekistan", { measures: "everything:any", place: "Uzbekistan" }],
  ["vegetation decline in New York", { measures: "vegetation:decline", place: "New York" }],
  ["water in Lake Balkhash", { measures: "", place: "Lake Balkhash", notes: "water" }],
  ["flooding in Bangladesh", { measures: "", place: "Bangladesh", notes: "flood" }],
  ["glacier melt in Pamir mountains", { measures: "snow:decline", place: "Pamir mountains", notes: "glacier" }],
  ["where did the vegetation increase or decrease in Kyrgyzstan", { measures: "vegetation:any", place: "Kyrgyzstan" }],
  ["vegetation and rainfall in Uzbekistan", { measures: "vegetation:any rainfall:any", place: "Uzbekistan" }],
  ["Kazakhstan heat", { measures: "heat:any", place: "Kazakhstan" }],
  ["hotter summers in Europe", { measures: "heat:increase", place: "Europe" }],
  // Several measures, each with its own direction.
  ["vegetation and rainfall decline in Uzbekistan since 2015", { measures: "vegetation:decline rainfall:decline", place: "Uzbekistan", time: { kind: "since", start: 2015 } }],
  ["vegetation decline and heat increase in Iran", { measures: "vegetation:decline heat:increase", place: "Iran" }],
  ["hotter and drier in Uzbekistan", { measures: "heat:increase rainfall:decline", place: "Uzbekistan" }],
  ["heat and drought in Iran since 2010", { measures: "heat:any rainfall:decline", place: "Iran", time: { kind: "since", start: 2010 } }],
  ["decline of vegetation, soil moisture and snow in the Pamirs", { measures: "vegetation:decline soil:decline snow:decline", place: "Pamirs" }],
  ["greening and browning in Mongolia", { measures: "vegetation:any", place: "Mongolia" }],
  ["gains and losses of vegetation in Kenya", { measures: "vegetation:any", place: "Kenya" }],
  ["everything that declined in Uzbekistan since 2010", { measures: "everything:decline", place: "Uzbekistan", time: { kind: "since", start: 2010 } }],
  // Things that can't be measured directly.
  ["wildfires in Australia", { measures: "", place: "Australia", notes: "fire" }],
  ["urban growth around Tashkent", { measures: "", place: "Tashkent", notes: "urban", near: true }],
  ["NO2 pollution over Beijing", { measures: "", place: "Beijing", notes: "gas" }],
  ["CO₂ emissions in China", { measures: "", place: "China", notes: "gas" }],
  ["groundwater loss in India", { measures: "", place: "India", notes: "groundwater" }],
  ["vegetation shrinking near the Aral Sea", { measures: "vegetation:decline", place: "Aral Sea", near: true }],
];

function measures(text: string): string {
  const q = parseTrendQuery(text);
  if (q.everything) return `everything:${q.direction}`;
  return q.indicators.map((id) => `${id}:${q.directions[id]}`).join(" ");
}

describe("the reader breaks every question down the same way", () => {
  it.each(GOLDEN)("%s", (text, expected) => {
    const q = parseTrendQuery(text);
    expect(measures(text)).toBe(expected.measures);
    expect(q.place).toBe(expected.place);
    expect(q.time).toEqual(expected.time ?? { kind: "default" });
    expect(q.notes.map((n) => n.id).join(" ")).toBe(expected.notes ?? "");
    expect(q.near).toBe(expected.near ?? false);
    expect(q.isTrendQuery).toBe(true);
  });

  it("scans all six measures for 'what changed'", () => {
    expect(parseTrendQuery("what changed in Uzbekistan").indicators).toEqual(INDICATOR_ORDER);
  });

  it("offers the closest real measures for things it can't measure", () => {
    const q = parseTrendQuery("is the Aral Sea drying up");
    expect(q.notes[0]).toMatchObject({ kind: "unmeasured", phrase: "drying up", closest: ["rainfall", "soil", "vegetation"] });
    expect(parseTrendQuery("flooding in Bangladesh").notes[0]).toMatchObject({ closest: ["rainfall", "soil"], direction: "increase" });
  });

  it("still treats place names as places", () => {
    for (const text of ["Bukhara", "Lower Manhattan", "Changsha", "Niagara Falls", "Tashkent, Uzbekistan", "Lake Balkhash", "Green Bay"]) {
      expect(parseTrendQuery(text).isTrendQuery, text).toBe(false);
    }
  });
});
