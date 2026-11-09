import { describe, expect, it } from "vitest";
import { CORE_INDICATORS, INDICATOR_ORDER, INDICATORS, MEASURE_GROUPS, numberInWords, percentChangeMeansSomething, recordTag } from "../indicators";
import { DATASETS, DATASET_BY_ID, DEFAULT_DATASETS, countMaps } from "../../analysis/run";
import { METRICS } from "../../analysis/metrics";
import { MEASURE_DEFINITIONS, METRIC_DEFINITIONS } from "../../glossary";
import { getLayer } from "../../gibs/catalog";
import { LARGE_RUN_MAPS, readPeriod } from "../../analysis/period";

describe("every measure is wired up from end to end", () => {
  it("reads from a NASA layer with a colour scale, in the catalog", () => {
    for (const id of INDICATOR_ORDER) {
      const layer = getLayer(INDICATORS[id].layerId);
      expect(layer, id).toBeTruthy();
      expect(layer?.colormap, id).toBeTruthy();
      expect(layer?.period, id).toBe("monthly");
      expect(INDICATORS[id].id).toBe(id);
    }
  });

  it("lists each measure once, in a group with a label", () => {
    expect(new Set(INDICATOR_ORDER).size).toBe(INDICATOR_ORDER.length);
    expect(Object.keys(INDICATORS).sort()).toEqual([...INDICATOR_ORDER].sort());
    for (const group of MEASURE_GROUPS) expect(INDICATOR_ORDER.some((id) => INDICATORS[id].group === group.id), group.id).toBe(true);
    for (const id of INDICATOR_ORDER) expect(MEASURE_GROUPS.some((g) => g.id === INDICATORS[id].group), id).toBe(true);
    for (const id of CORE_INDICATORS) expect(INDICATOR_ORDER).toContain(id);
  });

  it("opens on the Analysis page with a dataset that exists", () => {
    for (const id of INDICATOR_ORDER) expect(DATASET_BY_ID[INDICATORS[id].dataset], id).toBeTruthy();
  });

  it("has an Analysis dataset reading a real layer, and every dataset has at least one measure", () => {
    for (const dataset of DATASETS) {
      if (dataset.id === "climate") continue;
      expect(dataset.layerId, dataset.id).toBeTruthy();
      expect(getLayer(dataset.layerId as string)?.colormap, dataset.id).toBeTruthy();
      expect(METRICS.some((metric) => metric.dataset === dataset.id), dataset.id).toBe(true);
    }
    expect(METRICS.filter((metric) => metric.dataset === "climate").map((metric) => metric.id)).toEqual(["airTemp", "rain", "soil", "humidity", "wind", "sunshine"]);
  });

  it("defines every measure in plain words", () => {
    for (const id of INDICATOR_ORDER) expect(MEASURE_DEFINITIONS[id], id).toBeTruthy();
    for (const metric of METRICS) expect(METRIC_DEFINITIONS[metric.id], metric.id).toBeTruthy();
  });

  it("keeps the record dates of the two pages the same", () => {
    expect(METRICS.find((m) => m.id === "waterStorage")?.last).toBe(INDICATORS.waterStorage.lastMonth);
    expect(METRICS.find((m) => m.id === "waterStorage")?.first).toBe(INDICATORS.waterStorage.firstMonth);
    expect(METRICS.find((m) => m.id === "salinity")?.first).toBe(INDICATORS.salinity.firstMonth);
    expect(METRICS.find((m) => m.id === "coGround")?.last).toBe(INDICATORS.coGround.lastMonth);
    expect(getLayer(INDICATORS.waterStorage.layerId)?.recordEnd).toBe(INDICATORS.waterStorage.lastMonth);
  });

  it("doesn't list carbon dioxide: NASA's scale stops too low for an honest trend", () => {
    // In January 2010 most readings sat at the bottom of the 390–405 ppm scale, so a trend would be false.
    const layers = INDICATOR_ORDER.map((id) => INDICATORS[id].layerId).join(" ");
    expect(layers).not.toMatch(/Carbon_Dioxide/);
  });
});

describe("the first report", () => {
  it("is long enough for a real test, and starts by itself", () => {
    const { start, end } = readPeriod(new URLSearchParams(), "2026-08");
    expect(Number(end.slice(0, 4)) - Number(start.slice(0, 4))).toBeGreaterThanOrEqual(20);
    expect(countMaps({ start, end, datasets: DEFAULT_DATASETS })).toBeLessThanOrEqual(LARGE_RUN_MAPS);
    expect(DEFAULT_DATASETS).toContain("climate");
  });
});

describe("words for measures", () => {
  it("tags records that started late or have ended", () => {
    expect(recordTag("salinity")).toBe("from 2015");
    expect(recordTag("coGround")).toBe("to 2024");
    expect(recordTag("snowWater")).toBe("2012–2025");
    expect(recordTag("waterStorage")).toBe("to 2022");
    expect(recordTag("vegetation")).toBeNull();
    // Starting in 2002 still covers most of the satellite era.
    expect(recordTag("methane")).toBeNull();
  });

  it("gives a percentage change only where one means something", () => {
    expect(percentChangeMeansSomething(INDICATORS.vegetation)).toBe(true);
    expect(percentChangeMeansSomething(INDICATORS.methane)).toBe(true);
    expect(percentChangeMeansSomething(INDICATORS.heat)).toBe(false);
    expect(percentChangeMeansSomething(INDICATORS.humidity)).toBe(false);
    expect(percentChangeMeansSomething(INDICATORS.waterStorage)).toBe(false);
  });

  it("writes counts in words", () => {
    expect(numberInWords(6)).toBe("six");
    expect(numberInWords(13)).toBe("thirteen");
    expect(numberInWords(20)).toBe("twenty");
    expect(numberInWords(29)).toBe("twenty-nine");
    expect(numberInWords(120)).toBe("120");
  });
});
