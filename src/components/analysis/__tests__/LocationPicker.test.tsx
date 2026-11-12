import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationPicker, { type PartRow } from "../LocationPicker";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { areaKm2, bboxPolygon } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";

const geometry = bboxPolygon([56, 37, 73, 46]);
const target: AnalysisTarget = {
  name: "Uzbekistan + Turkmenistan",
  context: "2 places together",
  geometry,
  bbox: [56, 37, 73, 46],
  center: [41, 64],
  areaKm2: 918_000,
  kind: "place",
  ref: { type: "country", id: "UZB" },
  parts: [
    { key: "country:UZB", name: "Uzbekistan", geometry, areaKm2: 447_000 },
    { key: "country:TKM", name: "Turkmenistan", geometry, areaKm2: 471_000 },
  ],
};

const ROWS: PartRow[] = [
  { key: "country:UZB", label: "Uzbekistan", areaKm2: 447_000 },
  { key: "country:TKM", label: "Turkmenistan", areaKm2: 471_000 },
];

function show(props: { target?: AnalysisTarget | null; parts?: PartRow[]; adding?: boolean }) {
  const handlers = {
    onAddingChange: vi.fn(),
    onPlace: vi.fn(),
    onPoint: vi.fn(),
    onRadius: vi.fn(),
    onArea: vi.fn(),
    onRemovePart: vi.fn(),
    onShowMap: vi.fn(),
  };
  render(
    <WorkspaceProvider>
      <LocationPicker target={props.target ?? null} loading={false} parts={props.parts ?? []} adding={props.adding ?? false} {...handlers} />
    </WorkspaceProvider>,
  );
  return handlers;
}

describe("choosing several places on the Analysis page", () => {
  beforeEach(() => {
    const field = bboxPolygon([60, 40, 61, 41]);
    localStorage.setItem(
      "terrascope.areas.v1",
      JSON.stringify([{ id: "a1", name: "Cotton field", kind: "rectangle", geometry: field, bbox: [60, 40, 61, 41], center: [40.5, 60.5], areaKm2: areaKm2(field), createdAt: "2026-11-10T00:00:00Z" }]),
    );
  });

  it("lists each place with its size, the size together, and lets any be taken out", () => {
    const { onRemovePart } = show({ target, parts: ROWS });
    const list = screen.getByRole("list", { name: "Places in this area" });
    expect(list).toHaveTextContent("Uzbekistan");
    expect(list).toHaveTextContent("471k km²");
    expect(list).toHaveTextContent("Together, shared land counted once");
    expect(list).toHaveTextContent("918k km²");
    fireEvent.click(screen.getByRole("button", { name: "Take Uzbekistan out of the area" }));
    expect(onRemovePart).toHaveBeenCalledWith(0);
  });

  it("has nothing to add to before a place is chosen", () => {
    show({});
    expect(screen.queryByRole("button", { name: "Add another place" })).not.toBeInTheDocument();
  });

  it("turns on adding, and says how it works", () => {
    const { onAddingChange } = show({ target: { ...target, parts: undefined }, parts: ROWS.slice(0, 1) });
    expect(screen.queryByRole("list", { name: "Places in this area" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another place" }));
    expect(onAddingChange).toHaveBeenCalledWith(true);
  });

  it("while adding, offers places and saved areas to add, then stops when done", () => {
    const { onArea, onAddingChange } = show({ target, parts: ROWS, adding: true });
    expect(screen.getByRole("status")).toHaveTextContent("Adding places.");
    expect(screen.getByRole("combobox", { name: "Search a place to add to the area" })).toBeInTheDocument();
    expect(screen.getByText("Add one of your areas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cotton field/ }));
    expect(onArea).toHaveBeenCalledWith("a1");
    fireEvent.click(screen.getByRole("button", { name: "Done adding" }));
    expect(onAddingChange).toHaveBeenCalledWith(false);
  });

  it("shows a saved area already in the area as chosen", () => {
    show({ target, parts: [...ROWS, { key: "area:a1", label: "Cotton field" }] });
    expect(screen.getByRole("button", { name: /^Cotton field/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("changes the circle around the first point, keeping the places added to it", () => {
    const point: AnalysisTarget = { ...target, ref: { type: "point", lat: 39.77, lon: 64.42, radiusKm: 10 } };
    const { onRadius, onPoint } = show({ target: point, parts: ROWS });
    expect(screen.getByText("Area around the first point")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "25 km" }));
    expect(onRadius).toHaveBeenCalledWith(25);
    expect(onPoint).not.toHaveBeenCalled();
  });

  it("sends you to the page's map to click, draw or pick a place", () => {
    const { onShowMap } = show({});
    fireEvent.click(screen.getByRole("button", { name: "Pick on the map" }));
    expect(onShowMap).toHaveBeenCalled();
  });
});
