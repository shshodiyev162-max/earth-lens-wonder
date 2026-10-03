import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analysis from "../Analysis";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import type { AnalysisRequest, AnalysisResult } from "@/lib/analysis/types";
import { monthRange } from "@/lib/gibs/time";

vi.mock("@/components/analysis/LocationPicker", () => ({ default: () => <div data-testid="location-picker" /> }));

vi.mock("@/lib/geo/geocode", async (original) => {
  const actual = (await original()) as object;
  return { ...actual, reverseGeocode: vi.fn().mockResolvedValue(null) };
});

const runAnalysis = vi.fn(async (request: AnalysisRequest): Promise<AnalysisResult> => {
  const months = monthRange(request.start, request.end);
  return {
    target: request.target,
    start: request.start,
    end: request.end,
    datasets: request.datasets,
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

vi.mock("@/lib/analysis/run", async (original) => {
  const actual = (await original()) as object;
  return { ...actual, runAnalysis: (request: AnalysisRequest) => runAnalysis(request) };
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

describe("Analysis page", () => {
  it("asks for a place instead of showing preset regions", () => {
    renderAt("/analysis");
    expect(screen.getByText(/Pick a place to start/i)).toBeInTheDocument();
    expect(screen.queryByText(/North America/i)).not.toBeInTheDocument();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("runs a real analysis for the place in the URL and shows the findings", async () => {
    renderAt("/analysis?lat=39.77&lon=64.42&r=10&name=Bukhara");
    expect(screen.getByRole("heading", { name: "Bukhara" })).toBeInTheDocument();
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1));
    const request = runAnalysis.mock.calls[0][0];
    expect(request.target.center).toEqual([39.77, 64.42]);
    expect(request.target.areaKm2).toBeGreaterThan(300);
    expect((await screen.findAllByText(/Air temperature \+1\.0 °C warmer than the 2001–2020 normal/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Vegetation (NDVI)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download CSV/i })).toBeEnabled();
  });
});
