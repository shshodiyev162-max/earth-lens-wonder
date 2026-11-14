import { describe, expect, it } from "vitest";
import { METRIC_BY_ID } from "../../analysis/metrics";
import { annualTrendVerdict, type MonthlyValue } from "../../analysis/stats";
import type { MetricTrend } from "../../analysis/trend";
import { compareWithStations, groundCheckText, stationYearly } from "../groundCheck";
import { parseStationData, parseStationSearch, stationDataUrl, stationName, stationSearchUrl, type StationRecord } from "../ncei";

const BUKHARA: [number, number] = [39.77, 64.42];

describe("NOAA's station search", () => {
  it("asks for stations around the place, north-west-south-east, in the years asked", () => {
    const url = new URL(stationSearchUrl(BUKHARA, 75, 2001, 2025));
    expect(url.origin + url.pathname).toBe("https://www.ncei.noaa.gov/access/services/search/v1/data");
    expect(url.searchParams.get("dataset")).toBe("global-summary-of-the-month");
    const [north, west, south, east] = (url.searchParams.get("bbox") ?? "").split(",").map(Number);
    expect(north).toBeCloseTo(39.77 + 75 / 111, 2);
    expect(south).toBeCloseTo(39.77 - 75 / 111, 2);
    expect(west).toBeLessThan(64.42 - 75 / 111);
    expect(east).toBeGreaterThan(64.42 + 75 / 111);
    expect(url.searchParams.get("dataTypes")).toBe("TAVG,PRCP");
    expect(url.searchParams.get("startDate")).toBe("2001-01-01T00:00:00");
  });

  // Shaped like NOAA's real answer for Bukhara (November 2026), shortened.
  const answer = {
    results: [
      { location: { coordinates: [63.85, 39.5] }, stations: [{ id: "UZM00038685", name: "KARAKUL, UZ", dataTypes: [{ id: "PRCP" }, { id: "TAVG" }] }] },
      { location: { coordinates: [64.617, 39.717] }, stations: [{ id: "UZM00038683", name: "BUHARA, UZ", dataTypes: [{ id: "TAVG" }, { id: "EMXT" }] }] },
      { location: { coordinates: [66.0, 41.0] }, stations: [{ id: "FAR", name: "FAR AWAY, UZ", dataTypes: [{ id: "TAVG" }] }] },
      { location: { coordinates: [64.5, 39.8] }, stations: [{ id: "SNOWONLY", name: "SNOW, UZ", dataTypes: [{ id: "SNOW" }] }] },
    ],
  };

  it("keeps stations within the radius that measure temperature or rainfall, nearest first", () => {
    const stations = parseStationSearch(answer, BUKHARA, 75);
    expect(stations.map((s) => s.id)).toEqual(["UZM00038683", "UZM00038685"]);
    expect(stations[0]).toMatchObject({ name: "Buhara, UZ", center: [39.717, 64.617] });
    expect(stations[0].distanceKm).toBeGreaterThan(15);
    expect(stations[0].distanceKm).toBeLessThan(20);
  });

  it("names stations in title case", () => {
    expect(stationName("BUHARA, UZ")).toBe("Buhara, UZ");
    expect(stationName("NEW YORK CNTRL PK TWR, NY US")).toBe("New York Cntrl Pk Twr, NY US");
    expect(stationName("ST-PETERSBURG, RS")).toBe("St-Petersburg, RS");
  });
});

describe("NOAA's monthly records", () => {
  it("asks for several stations at once, in °C and mm", () => {
    const url = new URL(stationDataUrl(["A", "B"], 2001, 2025));
    expect(url.searchParams.get("stations")).toBe("A,B");
    expect(url.searchParams.get("units")).toBe("metric");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("reads each station's months, keeping gaps as gaps", () => {
    const data = parseStationData([
      { DATE: "2000-02", STATION: "A", TAVG: "4.4", PRCP: "18.4" },
      { DATE: "2000-01", STATION: "A", TAVG: "4.5" },
      { DATE: "2000-01", STATION: "B", PRCP: "12" },
      { DATE: "bad", STATION: "B", TAVG: "1" },
    ]);
    expect(data.get("A")?.temperature).toEqual([
      { month: "2000-01", value: 4.5 },
      { month: "2000-02", value: 4.4 },
    ]);
    expect(data.get("A")?.rainfall).toEqual([
      { month: "2000-01", value: null },
      { month: "2000-02", value: 18.4 },
    ]);
    expect(data.get("B")?.rainfall).toEqual([{ month: "2000-01", value: 12 }]);
  });
});

describe("checking NASA against the ground", () => {
  const years = Array.from({ length: 20 }, (_, i) => 2005 + i);
  const wiggle = (i: number) => [0.3, -0.2, 0.1, -0.4, 0.2, 0.0, -0.1, 0.4, -0.3, 0.1][i % 10];
  /** Twelve months a year at `base + rate·(year − 2005) + wiggle`. */
  const monthly = (rate: number, base = 15, scale = 1): MonthlyValue[] =>
    years.flatMap((year, i) => Array.from({ length: 12 }, (_, m) => ({ month: `${year}-${String(m + 1).padStart(2, "0")}`, value: base + rate * (year - 2005) + scale * wiggle(i) })));
  const nasaTrend = (rate: number): MetricTrend => {
    const yearly = years.map((year, i) => ({ year, value: 15 + rate * (year - 2005) + wiggle(i), count: 12, expected: 12, complete: true }));
    return { metric: METRIC_BY_ID.airTemp, yearly, verdict: annualTrendVerdict(years, yearly.map((y) => y.value as number)), span: [2005, 2024], comparison: null, note: null, hint: null };
  };
  const station = (id: string, distanceKm: number, temperature: MonthlyValue[]): StationRecord => ({
    station: { id, name: `${id}, UZ`, center: BUKHARA, distanceKm },
    temperature,
    rainfall: [],
  });
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("agrees when the station's rate is within reach of NASA's, and says how closely their years follow each other", () => {
    const comparison = compareWithStations(nasaTrend(0.05), [station("Bukhara", 16, monthly(0.05, 14.5))], all);
    expect(comparison).toMatchObject({ measure: "airTemp", agree: true, sharedYears: 20, span: [2005, 2024], whole: true });
    expect(comparison?.correlation).toBeGreaterThan(0.95);
    const text = groundCheckText(comparison!, "°C", 1);
    expect(text).toMatch(/^Over 2005–2024, the Bukhara, UZ weather station, 16 km away, measured \+0\.5 °C per decade/);
    expect(text).toMatch(/NASA's record here gives \+0\.5 °C per decade over the same years/);
    expect(text).toMatch(/Their ranges overlap: the ground agrees with NASA's rate\./);
    expect(text).toMatch(/rise and fall together \(r = 1\.00 over 20 years\)/);
  });

  it("says plainly when they disagree, and why a station can", () => {
    const comparison = compareWithStations(nasaTrend(0.05), [station("Town", 10, monthly(-0.08))], all);
    expect(comparison?.agree).toBe(false);
    expect(groundCheckText(comparison!, "°C", 1)).toMatch(/disagree here\. A station measures one spot/);
  });

  it("fills a patchy station's missing months from its own averages, so gaps can't fake a trend", () => {
    const cycle = (m: number) => 10 * Math.cos(((m - 7) / 12) * 2 * Math.PI);
    const seasonal = (rate: number) => monthly(rate).map((point) => ({ ...point, value: (point.value as number) + cycle(Number(point.month.slice(5))) }));
    const trendOf = (yearly: { year: number; value: number | null }[]) =>
      annualTrendVerdict(
        yearly.filter((y) => y.value !== null).map((y) => y.year),
        yearly.filter((y) => y.value !== null).map((y) => y.value as number),
      );
    // No change at all, but winters missing in the first ten years and summers in the last ten: plain
    // yearly means would show a steep fall; departures from each month's own average show none.
    const lopsided = seasonal(0).filter((point) => {
      const [year, month] = [Number(point.month.slice(0, 4)), Number(point.month.slice(5))];
      return year < 2015 ? month >= 4 && month <= 11 : month <= 3 || month >= 10;
    });
    const plainMeans = years.map((year) => {
      const list = lopsided.filter((p) => p.month.startsWith(String(year))).map((p) => p.value as number);
      return { year, value: list.reduce((a, b) => a + b, 0) / list.length };
    });
    expect(trendOf(plainMeans)?.slopePerYear).toBeLessThan(-0.2);
    const filled = trendOf(stationYearly(lopsided, all, "mean", 2005, 2024));
    expect(filled?.direction).toBe("none");
    expect(Math.abs(filled?.slopePerYear as number)).toBeLessThan(0.01);
    // A real rise with scattered gaps (one month in five missing) keeps its rate.
    const scattered = seasonal(0.05).filter((point) => (Number(point.month.slice(0, 4)) * 7 + Number(point.month.slice(5)) * 3) % 5 !== 0);
    expect(trendOf(stationYearly(scattered, all, "mean", 2005, 2024))?.slopePerYear).toBeCloseTo(0.05, 2);
    // Fewer than half the months of a year: no value. Rainfall becomes a season total.
    expect(stationYearly(scattered.filter((p) => !p.month.startsWith("2010")), all, "mean", 2005, 2024).find((y) => y.year === 2010)?.value).toBeNull();
    expect(stationYearly(monthly(0, 30, 0), all, "sum", 2005, 2024)[0].value).toBeCloseTo(360, 6);
  });

  it("skips a nearer station whose record is too short, and checks only temperature and rainfall", () => {
    const short = monthly(0.05).filter((m) => m.month < "2010");
    const comparison = compareWithStations(nasaTrend(0.05), [station("Short", 5, short), station("Long", 40, monthly(0.05))], all);
    expect(comparison?.station.id).toBe("Long");
    expect(compareWithStations({ ...nasaTrend(0.05), metric: METRIC_BY_ID.wind }, [station("Long", 40, monthly(0.05))], all)).toBeNull();
    expect(compareWithStations(nasaTrend(0.05), [], all)).toBeNull();
  });

  it("compares over the years both have when a station's record stops early, and says so", () => {
    // Twelve good years then nothing, like Tashkent's record (2006–2017).
    const stops = monthly(0.05).filter((m) => m.month < "2017");
    const comparison = compareWithStations(nasaTrend(0.05), [station("Tashkent", 5, stops)], all);
    expect(comparison).toMatchObject({ sharedYears: 12, span: [2005, 2016], whole: false });
    expect(comparison?.nasaTrend.years).toBe(12);
    expect(groundCheckText(comparison!, "°C", 1)).toMatch(/^Over 2005–2016, the years its record covers, the Tashkent, UZ weather station/);
    // A station with most of NASA's years wins over a nearer one with fewer.
    expect(compareWithStations(nasaTrend(0.05), [station("Tashkent", 5, stops), station("Far", 60, monthly(0.05))], all)?.station.id).toBe("Far");
  });
});
