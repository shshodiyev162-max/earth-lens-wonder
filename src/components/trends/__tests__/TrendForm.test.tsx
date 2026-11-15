import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryFromParams } from "@/lib/trends/query";
import TrendForm from "../TrendForm";

function show(search: string) {
  const onEdit = vi.fn();
  render(
    <TrendForm
      query={queryFromParams(new URLSearchParams(search))}
      where={<div />}
      years={{ first: 2000, last: 2025 }}
      onEdit={onEdit}
      onRun={vi.fn()}
      dirty
      current={false}
      busy={false}
      estimate={null}
    />,
  );
  return onEdit;
}

describe("the When step", () => {
  it("shows the span on a timeline, with the years the change compares", () => {
    show("ind=vegetation&dir=any&place=Uzbekistan&t=since-2005");
    expect(screen.getByRole("slider", { name: "First year" })).toHaveValue("2005");
    expect(screen.getByRole("slider", { name: "Last year" })).toHaveValue("2025");
    expect(screen.getByText(/2005–2025 · 21 years\./)).toBeInTheDocument();
    expect(screen.getByText(/the change compares 2005–2009 with 2021–2025/)).toBeInTheDocument();
  });

  it("sets a span by dragging: to the latest year it reads as 'since', otherwise as a range", () => {
    const onEdit = show("ind=vegetation&dir=any&place=Uzbekistan&t=since-2005");
    const from = screen.getByRole("slider", { name: "First year" });
    fireEvent.change(from, { target: { value: "2010" } });
    fireEvent.pointerUp(from);
    expect(onEdit).toHaveBeenLastCalledWith({ time: { kind: "since", start: 2010 } });
    const to = screen.getByRole("slider", { name: "Last year" });
    fireEvent.change(to, { target: { value: "2018" } });
    fireEvent.pointerUp(to);
    expect(onEdit).toHaveBeenLastCalledWith({ time: { kind: "range", start: 2010, end: 2018 } });
  });

  it("offers quick choices", () => {
    const onEdit = show("ind=vegetation&dir=any&place=Uzbekistan");
    expect(screen.getByRole("button", { name: "Last 20" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "All since 2000" }));
    expect(onEdit).toHaveBeenLastCalledWith({ time: { kind: "since", start: 2000 } });
  });

  it("says a short span is compared with the years before it", () => {
    show("ind=vegetation&dir=any&place=Uzbekistan&t=range-2021-2023");
    expect(screen.getByText(/against the years before, 2011–2020/)).toBeInTheDocument();
  });

  it("marks a chosen measure whose record is shorter than the timeline", () => {
    show("ind=vegetation,salinity&dir=any&place=Mediterranean+Sea");
    expect(screen.getByRole("list", { name: "Records shorter than the timeline" })).toHaveTextContent("Sea salinity · 2015–2025");
  });

  it("compares two single years, then vs now", () => {
    const onEdit = show("ind=vegetation&dir=any&place=Uzbekistan&t=since-2005");
    fireEvent.click(screen.getByRole("radio", { name: "Two years, then vs now" }));
    expect(onEdit).toHaveBeenLastCalledWith({ time: { kind: "versus", baseline: 2015, recent: 2025 } });
  });

  it("shows a then-vs-now link as two years", () => {
    show("ind=vegetation&dir=any&place=Uzbekistan&t=vs-2005-2024");
    expect(screen.getByRole("radio", { name: "Two years, then vs now" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("slider", { name: "Then" })).toHaveValue("2005");
    expect(screen.getByRole("slider", { name: "Now" })).toHaveValue("2024");
    expect(screen.getByText(/no trend test/)).toBeInTheDocument();
  });
});
