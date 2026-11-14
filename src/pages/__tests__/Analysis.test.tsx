import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analysis from "../Analysis";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import type { AnalysisRequest, AnalysisResult } from "@/lib/analysis/types";
import { monthRange } from "@/lib/gibs/time";

vi.mock("@/components/analysis/LocationPicker", () => ({ default: () => <div data-testid="location-picker" /> }));
// The map needs a real browser: here it is a button that picks Samarkand, with the card shown over it.
vi.mock("@/components/analysis/AnalysisMap", () => ({
  default: ({ children, onPoint }: { children?: React.ReactNode; onPoint: (point: [number, number], radiusKm: number) => void }) => (
    <div data-testid="analysis-map">
      <button type="button" onClick={() => onPoint([39.65, 66.96], 10)}>
        Click Samarkand on the map
      </button>
      {children}
    </div>
  ),
}));

vi.mock("@/lib/geo/geocode", async (original) => {
  const actual = (await original()) as object;
  return { ...actual, reverseGeocode: vi.fn().mockResolvedValue(null) };
});

type RunOptions = { onPartial?: (result: AnalysisResult) => void; signal?: AbortSignal };

const runAnalysis = vi.fn(async (request: AnalysisRequest, _options?: RunOptions): Promise<AnalysisResult> => {
  const months = request.months ?? monthRange(request.start, request.end);
  return {
    target: request.target,
    start: request.start,
    end: request.end,
    datasets: request.datasets,
    months,
    period: request.period,
    generatedAt: new Date().toISOString(),
    satellite: {
      vegetation: {
        dataset: "vegetation",
        layerId: "MODIS_Terra_L3_NDVI_Monthly",
        label: "Vegetation health",
        unit: "NDVI",
        decimals: 2,
        source: "test",
        latestAvailable: request.end,
        status: "ok",
        points: months.map((month) => ({ month, value: 0.42, p10: 0.3, p90: 0.55, coverage: 0.95 })),
      },
    },
    climate: {
      status: "ok",
      samplePoints: [request.target.center],
      points: months.map((month) => ({
        month,
        temp: 21,
        tempMax: 28,
        tempMin: 14,
        tempNormal: 20,
        tempAnomaly: 1,
        precip: 20,
        precipNormal: 25,
        solar: 5.2,
        solarNormal: 5.1,
        humidity: 45,
        wind: 3,
        soil: 40,
        soilNormal: 41,
      })),
    },
  };
});

// The nearest weather station, without asking NOAA: twenty years of steady 20 °C and 30 mm a month.
const stationRecords = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stations/ncei", async (original) => ({ ...((await original()) as object), nearbyStationRecords: stationRecords }));

vi.mock("@/lib/analysis/run", async (original) => {
  const actual = (await original()) as object;
  return { ...actual, runAnalysis: (request: AnalysisRequest, options?: RunOptions) => runAnalysis(request, options) };
});

function renderAt(url: string) {
  return render(
    <WorkspaceProvider>
      <MemoryRouter initialEntries={[url]}>
        <Analysis />
      </MemoryRouter>
    </WorkspaceProvider>,
  );
}

const BUKHARA = "/analysis?lat=39.77&lon=64.42&r=10&name=Bukhara";
const board = () => screen.getByRole("region", { name: "Every measure tested" });
/** Nothing is read until this is pressed. */
const start = async (name: RegExp = /^Start the analysis$/) => fireEvent.click(await screen.findByRole("button", { name }));
const pause = () => new Promise((resolve) => setTimeout(resolve, 450));

describe("Analysis page", () => {
  beforeEach(() => {
    runAnalysis.mockClear();
    stationRecords.mockReset();
    const months = Array.from({ length: 26 * 12 }, (_, i) => `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    stationRecords.mockResolvedValue([
      {
        station: { id: "UZM00038683", name: "Buhara, UZ", center: [39.717, 64.617], distanceKm: 17 },
        temperature: months.map((month) => ({ month, value: 20 })),
        rainfall: months.map((month) => ({ month, value: 30 })),
      },
    ]);
  });

  it("checks NASA's temperature and rainfall against the nearest weather station", async () => {
    renderAt(BUKHARA);
    await start();
    expect(await screen.findByRole("heading", { name: "Checked against the ground" })).toBeInTheDocument();
    const ground = screen.getByRole("region", { name: "Checked against the ground" });
    await waitFor(() => expect(within(ground).getAllByText("Agrees")).toHaveLength(2));
    expect(within(ground).getAllByText(/Over \d{4}–\d{4}, the Buhara, UZ weather station, 17 km away/)).toHaveLength(2);
    expect(stationRecords).toHaveBeenCalledTimes(1);
    expect(stationRecords.mock.calls[0][0]).toEqual([39.77, 64.42]);
  });

  it("asks for a place instead of showing preset regions", () => {
    renderAt("/analysis");
    expect(screen.getByText(/Pick a place to start/i)).toBeInTheDocument();
    expect(screen.queryByText(/North America/i)).not.toBeInTheDocument();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("opens on the map, shows the report once a place is picked there, and switches between them", async () => {
    renderAt("/analysis");
    expect(screen.getByTestId("analysis-map")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Report/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Click Samarkand on the map" }));
    expect(await screen.findByRole("heading", { name: "39.650°N, 66.960°E" })).toBeInTheDocument();
    expect(screen.queryByTestId("analysis-map")).not.toBeInTheDocument();
    // Picking a place reads nothing: the report says what will be read, with the button that starts it.
    expect(screen.getByText("Ready to start")).toBeInTheDocument();
    await pause();
    expect(runAnalysis).not.toHaveBeenCalled();
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Map/ }));
    expect(screen.getByTestId("analysis-map")).toBeInTheDocument();
    expect(screen.getByText("Chosen area")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See the report/ }));
    expect(screen.getByRole("heading", { name: "39.650°N, 66.960°E" })).toBeInTheDocument();
    // Switching views never reads the data again.
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });

  it("adds places on the map, and reads nothing until adding is done", async () => {
    renderAt(BUKHARA);
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Map/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add another place" }));
    expect(screen.getByText("Adding places")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Click Samarkand on the map" }));
    expect(await screen.findByText("Bukhara + 39.65°N, 66.96°E")).toBeInTheDocument();
    // Still on the map, and nothing read for the area being built.
    expect(screen.getByTestId("analysis-map")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runAnalysis).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Done adding" }));
    expect(await screen.findByRole("heading", { name: "Bukhara + 39.65°N, 66.96°E" })).toBeInTheDocument();
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(2));
    expect(runAnalysis.mock.calls[1][0].target.parts).toHaveLength(2);
  });

  it("reads the place in the URL only once started, and answers from the tests", async () => {
    renderAt(BUKHARA);
    expect(screen.getByRole("heading", { name: "Bukhara" })).toBeInTheDocument();
    await pause();
    expect(runAnalysis).not.toHaveBeenCalled();
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    const request = runAnalysis.mock.calls[0][0];
    expect(request.target.center).toEqual([39.77, 64.42]);
    expect(request.target.areaKm2).toBeGreaterThan(300);
    expect(await screen.findByRole("heading", { name: "Is it changing?" })).toBeInTheDocument();
    expect(screen.getByText(/No clear trend in any of the \d+ measures tested/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download CSV/i })).toBeEnabled();
  });

  it("reads places added together as one area, named together", async () => {
    renderAt("/analysis?bbox=60,40,64,44&name=West&add=bbox:62,42,66,46!East&ds=climate");
    expect(await screen.findByRole("heading", { name: "West + East" })).toBeInTheDocument();
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    const { target } = runAnalysis.mock.calls[0][0];
    expect(target.parts?.map((part) => part.name)).toEqual(["West", "East"]);
    expect(target.bbox).toEqual([60, 40, 66, 46]);
    expect(screen.getByText(/2 places together/)).toBeInTheDocument();
  });

  it("starts with twenty years, climate and the two land measures", async () => {
    renderAt(BUKHARA);
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    const request = runAnalysis.mock.calls[0][0];
    expect(request.datasets).toEqual(["climate", "vegetation", "surfaceHeat"]);
    expect(request.months?.length).toBe(240);
    expect(screen.getByText(/480 monthly NASA maps to read/)).toBeInTheDocument();
  });

  it("puts every measure on one line, with all six climate measures from one request", async () => {
    renderAt(BUKHARA);
    await start();
    await screen.findByRole("heading", { name: "Is it changing?" });
    for (const label of ["Air temperature", "Rainfall", "Soil moisture", "Humidity", "Wind", "Sunshine", "Vegetation (NDVI)"]) {
      expect(within(board()).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("No clear trend").length).toBeGreaterThanOrEqual(7);
    expect(screen.getAllByText(/95% range/).length).toBeGreaterThanOrEqual(7);
  });

  it("opens one measure's details at a time, in place", async () => {
    renderAt(BUKHARA);
    await start();
    await screen.findByRole("heading", { name: "Is it changing?" });
    // The top row starts open; the others keep their definitions out of the way.
    expect(screen.getByText(/What a thermometer in the shade would read/i)).toBeInTheDocument();
    expect(screen.queryByText(/How close the air 2 metres above the ground/)).not.toBeInTheDocument();
    const humidity = within(board()).getByText("Humidity").closest("details") as HTMLDetailsElement;
    humidity.open = true;
    fireEvent(humidity, new Event("toggle"));
    expect(await screen.findByText(/How close the air 2 metres above the ground/)).toBeInTheDocument();
  });

  it("offers the whole record once when there's no clear trend", async () => {
    renderAt(BUKHARA);
    await start();
    await screen.findByRole("heading", { name: "Is it changing?" });
    const buttons = screen.getAllByRole("button", { name: /Test every year since 2000/ });
    expect(buttons).toHaveLength(1);
    // The button says it tests, so it starts straight away.
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(2));
    expect(runAnalysis.mock.calls[1][0].start).toBe("2000-03");
  });

  it("shows results as they arrive and says it isn't finished", async () => {
    let finish: (result: AnalysisResult) => void = () => {};
    runAnalysis.mockImplementationOnce(async (request, options) => {
      const months = request.months ?? [];
      options?.onPartial?.({
        target: request.target,
        start: request.start,
        end: request.end,
        datasets: request.datasets,
        months,
        period: request.period,
        generatedAt: "2026-11-09T00:00:00Z",
        satellite: {},
        climate: {
          status: "ok",
          samplePoints: [request.target.center],
          points: months.map((month) => ({ month, temp: 21, tempMax: 28, tempMin: 14, tempNormal: 20, tempAnomaly: 1, precip: 20, precipNormal: 25, solar: 5.2, solarNormal: 5.1, humidity: 45, wind: 3, soil: 40, soilNormal: 41 })),
        },
      });
      return new Promise<AnalysisResult>((resolve) => (finish = resolve));
    });
    renderAt(BUKHARA);
    await start();
    expect(await screen.findByText("So far:")).toBeInTheDocument();
    expect(within(board()).getByText("Air temperature")).toBeInTheDocument();
    // What's still being read has its own line, and the data can't be downloaded half done.
    expect(within(board()).getByText("Vegetation (NDVI)")).toBeInTheDocument();
    expect(within(board()).getByText("Surface heat (day)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download CSV/i })).toBeDisabled();
    expect(finish).toBeTruthy();
  });

  it("explains a measure that has nothing to read here", async () => {
    runAnalysis.mockImplementationOnce(async (request) => ({
      target: request.target,
      start: request.start,
      end: request.end,
      datasets: request.datasets,
      months: request.months ?? [],
      period: request.period,
      generatedAt: "2026-11-09T00:00:00Z",
      satellite: {
        salinity: { dataset: "salinity", layerId: "x", label: "Sea salinity", unit: "PSU", decimals: 2, source: "test", latestAvailable: null, status: "empty", points: [] },
      },
    }));
    renderAt(`${BUKHARA}&ds=salinity`);
    await start();
    expect(await screen.findByText(/This area has no sea/)).toBeInTheDocument();
    expect(screen.getByText("No NASA readings for this area and period.")).toBeInTheDocument();
  });

  it("no longer gives a concern score", async () => {
    renderAt(BUKHARA);
    await start();
    await screen.findByRole("heading", { name: "Is it changing?" });
    expect(screen.queryByText(/concern/i)).not.toBeInTheDocument();
  });

  it("compares the latest months with the normal, as a figure apart from the trend", async () => {
    renderAt(BUKHARA);
    await start();
    expect(await screen.findByRole("heading", { name: /Latest 12 months vs the 2001–2020 normal/ })).toBeInTheDocument();
    expect(screen.getByText("+1.0 °C")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("reads only the chosen months", async () => {
    renderAt(`${BUKHARA}&season=summer`);
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    const months = runAnalysis.mock.calls[0][0].months ?? [];
    expect(months.length).toBeGreaterThan(20);
    expect(new Set(months.map((m) => m.slice(5)))).toEqual(new Set(["06", "07", "08"]));
    expect(runAnalysis.mock.calls[0][0].period?.calendarMonths).toEqual([6, 7, 8]);
  });

  it("compares two periods with a t-test", async () => {
    renderAt(`${BUKHARA}&period=compare&base=2001-2010&recent=2016-2025&ds=vegetation,climate`);
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    const request = runAnalysis.mock.calls[0][0];
    expect(request.period?.compare).toEqual({ baseline: [2001, 2010], recent: [2016, 2025] });
    expect(request.months?.some((m) => m.startsWith("2012"))).toBe(false);
    expect(await screen.findByText(/No clear difference in any of the \d+ measures tested/)).toBeInTheDocument();
    expect(within(board()).getByText("t-test")).toBeInTheDocument();
    expect(screen.getAllByText("Welch's t-test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No clear difference").length).toBeGreaterThan(0);
  });

  it("says when a request is big, and still waits for the click", async () => {
    renderAt(`${BUKHARA}&period=all`);
    expect(await screen.findByText("A big request")).toBeInTheDocument();
    expect(screen.getByText(/Fewer years, months or measures make it faster/)).toBeInTheDocument();
    await pause();
    expect(runAnalysis).not.toHaveBeenCalled();
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
  });

  it("keeps the report faded when the choices change, until it is started again", async () => {
    renderAt(BUKHARA);
    await start();
    await screen.findByRole("heading", { name: "Is it changing?" });
    fireEvent.click(screen.getByRole("radio", { name: "5 years" }));
    expect(await screen.findByText("Your choices changed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Is it changing?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download CSV/i })).toBeDisabled();
    await pause();
    expect(runAnalysis).toHaveBeenCalledTimes(1);
    await start(/^Start the analysis again$/);
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(2));
    expect(runAnalysis.mock.calls[1][0].months?.length).toBe(60);
  });

  it("stops a run when asked, and can start it again", async () => {
    let signal: AbortSignal | undefined;
    runAnalysis.mockImplementationOnce((_request, options) => {
      signal = options?.signal;
      return new Promise<AnalysisResult>(() => {});
    });
    renderAt(BUKHARA);
    await start();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText("Stopped before the end.")).toBeInTheDocument();
    await start(/^Start the analysis again$/);
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(2));
  });
});
