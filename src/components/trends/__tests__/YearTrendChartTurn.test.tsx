import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import YearTrendChart from "../YearTrendChart";

const series = Array.from({ length: 19 }, (_, i) => ({ year: 2007 + i, value: 0.4 + 0.01 * (9 - Math.abs(2007 + i - 2016)) }));
const trendLines = (container: HTMLElement) => container.querySelectorAll("line");

describe("the yearly chart of a rise and a fall", () => {
  it("draws the trend before and after the turn, meeting at it, instead of one flat line", () => {
    const { container } = render(<YearTrendChart series={series} unit="" decimals={2} showRange breaks={[2016]} label="Greenness" />);
    const lines = [...trendLines(container)];
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("x2")).toBe(lines[1].getAttribute("x1"));
    // No single 95% range is shaded across both stretches.
    expect(container.querySelector("path[clip-path]")).toBeNull();
  });

  it("keeps one line and its range without a turn", () => {
    const { container } = render(<YearTrendChart series={series} unit="" decimals={2} showRange label="Greenness" />);
    expect(trendLines(container)).toHaveLength(1);
    expect(container.querySelector("path[clip-path]")).not.toBeNull();
  });
});

describe("the yearly chart of one jump", () => {
  it("draws the two flat levels either side of it", () => {
    const { container } = render(<YearTrendChart series={series} unit="" decimals={2} showRange levels={{ before: 2015, after: 2016, levelBefore: 0.4, levelAfter: 0.5 }} label="Water" />);
    const lines = [...container.querySelectorAll("line")];
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("y1")).toBe(lines[0].getAttribute("y2"));
  });
});
