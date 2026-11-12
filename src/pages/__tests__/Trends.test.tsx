import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import type { TrendQuery } from "@/lib/trends/query";
import Trends from "../Trends";

// The map needs a real browser, and the scan needs NASA: this test is about the panel beside them.
vi.mock("@/components/map/BaseMap", () => ({ default: () => <div data-testid="map" /> }));
vi.mock("@/hooks/useExactAreaGeometry", () => ({ useExactAreaGeometry: () => null }));
vi.mock("@/hooks/usePlaceArea", () => ({ usePlaceArea: () => ({ area: null, error: null, loading: false }) }));
vi.mock("@/hooks/useLandCover", () => ({ useLandCover: () => ({ status: "idle", cover: null, first: null }) }));
vi.mock("@/hooks/useFrames", () => ({ useFrames: () => ({ frames: [], layer: null, loading: false }) }));

const useTrendScans = vi.fn();
vi.mock("@/hooks/useTrendScans", async (original) => ({
  ...((await original()) as object),
  useTrendScans: (query: TrendQuery | null) => useTrendScans(query),
}));

const SEARCH = "/trends?ind=vegetation&dir=vegetation:any&place=Uzbekistan&t=since-2015&season=usual";

function show(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <WorkspaceProvider>
        <TooltipProvider>
          <Trends />
        </TooltipProvider>
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTrendScans.mockReset();
  useTrendScans.mockImplementation((query: TrendQuery | null) => ({
    status: query ? "scanning" : "idle",
    area: null,
    error: null,
    measures: {},
    indicators: query?.indicators ?? [],
    cover: null,
    totalMaps: 0,
    labels: {},
    cancel: vi.fn(),
    retry: vi.fn(),
    requestNames: vi.fn(),
  }));
});

describe("the Trends panel", () => {
  it("starts on the form when nothing has been searched for", () => {
    show("/trends");
    expect(screen.getByRole("button", { name: /Find changes/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change search" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back to the results/ })).not.toBeInTheDocument();
  });

  it("opens on the results for a search in the page address, and folds the page title away", () => {
    show(SEARCH);
    expect(screen.getByRole("button", { name: "Change search" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Find changes/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Where is Earth changing?" })).toHaveClass("sr-only");
  });

  it("goes to the form and back without running the search again", () => {
    show(SEARCH);
    const searched = useTrendScans.mock.lastCall?.[0];

    fireEvent.click(screen.getByRole("button", { name: "Change search" }));
    expect(screen.getByRole("button", { name: /Find changes/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change search" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back to the results/ }));
    expect(screen.getByRole("button", { name: "Change search" })).toBeInTheDocument();
    expect(useTrendScans.mock.lastCall?.[0]).toBe(searched);
  });

  it("shows the results once a search runs from the form", () => {
    show(SEARCH);
    fireEvent.click(screen.getByRole("button", { name: "Change search" }));
    fireEvent.click(screen.getByRole("button", { name: /^Rainfall/ }));
    fireEvent.click(screen.getByRole("button", { name: /Find changes/ }));
    expect(screen.getByRole("button", { name: "Change search" })).toBeInTheDocument();
    expect(useTrendScans.mock.lastCall?.[0].indicators).toContain("rainfall");
  });

  it("adds places to the chosen one and lists them, without replacing it", async () => {
    show("/trends?ind=vegetation&dir=vegetation:any&place=Uzbekistan&add=region:Aral+Sea&t=since-2015&season=usual");
    expect(useTrendScans.mock.lastCall?.[0].extra).toEqual([{ kind: "region", label: "Aral Sea" }]);
    fireEvent.click(screen.getByRole("button", { name: "Change search" }));
    expect(screen.getByText(/Vegetation change in Uzbekistan \+ Aral Sea since 2015/)).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Places in this area" });
    expect(list).toHaveTextContent("Uzbekistan");
    expect(list).toHaveTextContent("Aral Sea");

    fireEvent.click(screen.getByRole("button", { name: "Add another place" }));
    fireEvent.change(screen.getByLabelText("Or add a known region, sea or ocean"), { target: { value: "Caspian Sea" } });
    expect(await screen.findByText(/Vegetation change in Uzbekistan \+ Aral Sea \+ Caspian Sea since 2015/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Take Uzbekistan out of the area" }));
    expect(await screen.findByText(/Vegetation change in Aral Sea \+ Caspian Sea since 2015/)).toBeInTheDocument();
  });
});
