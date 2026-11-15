import { describe, expect, it } from "vitest";
import { MEASURE_COUNT, parseDatasets, writeDatasets } from "../measures";
import { CLIMATE_METRICS, isShown } from "../metrics";
import { DEFAULT_DATASETS } from "../run";

describe("the measures in an analysis link", () => {
  it("counts every measure: six climate measures and every map measure", () => {
    expect(CLIMATE_METRICS).toEqual(["airTemp", "rain", "soil", "humidity", "wind", "sunshine"]);
    expect(MEASURE_COUNT).toBe(30);
  });

  it("reads all six climate measures from 'climate', and single ones by name", () => {
    expect(parseDatasets("climate,vegetation")).toEqual({ datasets: ["climate", "vegetation"], climate: CLIMATE_METRICS });
    expect(parseDatasets("rain,airTemp,vegetation")).toEqual({ datasets: ["climate", "vegetation"], climate: ["airTemp", "rain"] });
    expect(parseDatasets("salinity")).toEqual({ datasets: ["salinity"], climate: [] });
    expect(parseDatasets(null)).toEqual({ datasets: DEFAULT_DATASETS, climate: CLIMATE_METRICS });
    expect(parseDatasets("nonsense")).toEqual({ datasets: DEFAULT_DATASETS, climate: CLIMATE_METRICS });
    expect(parseDatasets(null, true).datasets).toContain("water");
  });

  it("writes the choice back the same way, and nothing for the usual choice", () => {
    expect(writeDatasets(DEFAULT_DATASETS, CLIMATE_METRICS)).toBeNull();
    expect(writeDatasets(["climate", "vegetation"], ["airTemp", "rain"])).toBe("airTemp,rain,vegetation");
    expect(writeDatasets(["climate", "salinity"], CLIMATE_METRICS)).toBe("climate,salinity");
    for (const link of ["airTemp,rain,vegetation", "climate,salinity", "soil"]) {
      const { datasets, climate } = parseDatasets(link);
      expect(writeDatasets(datasets, climate)).toBe(link);
    }
  });

  it("shows only the climate measures chosen, and every map measure", () => {
    expect(isShown({ climateMeasures: ["rain"] }, "rain")).toBe(true);
    expect(isShown({ climateMeasures: ["rain"] }, "airTemp")).toBe(false);
    expect(isShown({ climateMeasures: ["rain"] }, "ndvi")).toBe(true);
    expect(isShown({}, "airTemp")).toBe(true);
  });
});
