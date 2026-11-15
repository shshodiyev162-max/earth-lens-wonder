import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { clampSpan, timelineTicks } from "@/lib/timeline";
import YearTimeline from "../YearTimeline";

describe("timeline arithmetic", () => {
  it("labels the ends and round years that don't crowd them", () => {
    expect(timelineTicks(2000, 2025)).toEqual([2000, 2005, 2010, 2015, 2020, 2025]);
    expect(timelineTicks(2000, 2026)).toEqual([2000, 2005, 2010, 2015, 2020, 2026]);
    expect(timelineTicks(1980, 2026)).toEqual([1980, 1990, 2000, 2010, 2020, 2026]);
    // Even years between, leaving out those right next to the ends.
    expect(timelineTicks(2015, 2025)).toEqual([2015, 2018, 2020, 2022, 2025]);
  });

  it("keeps a span on the track, in order, and long enough", () => {
    expect(clampSpan([1990, 2040], 2000, 2025)).toEqual([2000, 2025]);
    // Two years apart at least: the handle being moved pushes the other one.
    expect(clampSpan([2010, 2010], 2000, 2025, 2, 0)).toEqual([2009, 2010]);
    expect(clampSpan([2010, 2010], 2000, 2025, 2, 1)).toEqual([2010, 2011]);
    // At the end of the track the other handle gives way instead.
    expect(clampSpan([2025, 2025], 2000, 2025, 2, 1)).toEqual([2024, 2025]);
  });
});

describe("YearTimeline", () => {
  it("has a handle for each end, said in words, and applies a change when the key is let go", () => {
    const onChange = vi.fn();
    render(<YearTimeline first={2000} last={2025} value={[2010, 2025]} onChange={onChange} labels={["First year", "Last year"]} />);
    const from = screen.getByRole("slider", { name: "First year" });
    expect(screen.getByRole("slider", { name: "Last year" })).toHaveAttribute("aria-valuetext", "2025");
    fireEvent.change(from, { target: { value: "2012" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyUp(from, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith([2012, 2025]);
  });

  it("won't let the start pass the end", () => {
    const onChange = vi.fn();
    render(<YearTimeline first={2000} last={2025} value={[2010, 2015]} onChange={onChange} minYears={2} />);
    const [from] = screen.getAllByRole("slider");
    fireEvent.change(from, { target: { value: "2020" } });
    fireEvent.pointerUp(from);
    expect(onChange).toHaveBeenCalledWith([2014, 2015]);
  });

  it("can be a single year", () => {
    const onChange = vi.fn();
    render(<YearTimeline first={2000} last={2025} value={[2021, 2021]} onChange={onChange} single labels={["Year", "Year"]} />);
    const year = screen.getByRole("slider", { name: "Year" });
    fireEvent.change(year, { target: { value: "2018" } });
    fireEvent.blur(year);
    expect(onChange).toHaveBeenCalledWith([2018, 2018]);
  });

  it("shows records shorter than the track under it", () => {
    render(<YearTimeline first={2000} last={2025} value={[2005, 2025]} onChange={vi.fn()} records={[{ label: "Sea salinity", span: [2015, 2025] }]} />);
    expect(screen.getByRole("list", { name: "Records shorter than the timeline" })).toHaveTextContent("Sea salinity · 2015–2025");
  });
});
