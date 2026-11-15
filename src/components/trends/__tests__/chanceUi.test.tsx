import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { annualTrendVerdict } from "@/lib/analysis/stats";
import { INDICATORS } from "@/lib/query/indicators";
import type { PeriodPlan } from "@/lib/query/period";
import type { ChanceCheck } from "@/lib/trends/chance";
import type { HotspotDetail } from "@/lib/trends/scan";
import ChanceNote from "../ChanceNote";
import HotspotCard from "../HotspotCard";
import HotspotList from "../HotspotList";
import ResultFilters from "../ResultFilters";

const YEARS = Array.from({ length: 12 }, (_, i) => 2013 + i);
const PLAN: PeriodPlan = { kind: "trend", startYear: 2013, endYear: 2024, baseline: [2013, 2015], recent: [2022, 2024], years: YEARS, months: [4, 5, 6, 7, 8, 9], notes: [] };
const series = YEARS.map((year, k) => ({ year, value: 0.3 - 0.004 * k + (k % 2) * 0.002 }));

function hotspot(rank: number, score: number): HotspotDetail {
  return {
    id: `d${rank}`,
    rank,
    sign: -1,
    pixels: [1, 2, 3, 4],
    areaKm2: 1200,
    center: [43.5, 59.3],
    bbox: [59, 43, 60, 44],
    geometry: { type: "Polygon", coordinates: [] },
    meanChange: -0.04,
    meanSlope: -0.004,
    significantShare: 1,
    score,
    series,
    verdict: annualTrendVerdict(
      series.map((p) => p.year),
      series.map((p) => p.value),
    ),
    refined: false,
  };
}

// Chance made patches in 2 of 19 shuffles, the strongest of them scoring 50.
const CHECK: ChanceCheck = { runs: 19, topScores: [50, 20, ...Array(17).fill(0)], runsWithPatches: 2 };

describe("the chance check on the Trends panel", () => {
  it("says it is running, then what it found", () => {
    const { rerender } = render(<ChanceNote state={{ status: "running", done: 4, total: 19 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Chance check: shuffling the years and testing every pixel again (4 of 19)");
    rerender(<ChanceNote state={{ status: "done", check: CHECK }} />);
    expect(screen.getByRole("status")).toHaveTextContent("patches passed in 2 of them, so some of these could be chance");
    rerender(<ChanceNote state={{ status: "none" }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("marks only the listed patches chance could have made", () => {
    render(
      <HotspotList hotspots={[hotspot(1, 80), hotspot(2, 30)]} labels={{ d1: "Muynoq", d2: "Kungrad" }} indicator={INDICATORS.vegetation} plan={PLAN} selectedId={null} onSelect={vi.fn()} chance={CHECK} />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).not.toHaveTextContent("could be chance");
    expect(rows[1]).toHaveTextContent("could be chance");
  });

  it("gives a patch's rate and range, and the chance check rather than its own p-value as the evidence", () => {
    const show = (score: number) =>
      render(
        <MemoryRouter>
          <HotspotCard hotspot={hotspot(1, score)} title="Muynoq" indicator={INDICATORS.vegetation} plan={PLAN} analysisHref="/analysis" compareHref="/split" chance={{ status: "done", check: CHECK }} onClose={vi.fn()} />
        </MemoryRouter>,
      );
    const strong = show(80);
    expect(screen.getByText("Falling, beyond chance.")).toBeInTheDocument();
    expect(screen.getByText(/95% range/)).toBeInTheDocument();
    expect(screen.getByText(/Beyond chance: with the years shuffled 19 times, no patch came out this strong/)).toBeInTheDocument();
    expect(screen.queryByText(/p [<=]/)).not.toBeInTheDocument();
    strong.unmount();

    show(30);
    expect(screen.getByText("Falling, but this could be chance.")).toBeInTheDocument();
    expect(screen.getByText(/a patch at least this strong came out once/)).toBeInTheDocument();
  });
});

describe("the result filters", () => {
  it("show clear trends only, with weaker patches as an opt-in that warns about chance", () => {
    const onChange = vi.fn();
    const filter = { direction: "any" as const, minFactor: 1, minAreaKm2: 0, strict: true };
    const { rerender } = render(<ResultFilters indicator={INDICATORS.vegetation} filter={filter} tested onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Also show weaker patches" });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/Only clear trends/)).toBeInTheDocument();
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith({ ...filter, strict: false });
    rerender(<ResultFilters indicator={INDICATORS.vegetation} filter={{ ...filter, strict: false }} tested onChange={onChange} />);
    expect(screen.getByText(/Some of these may be chance/)).toBeInTheDocument();
  });
});
