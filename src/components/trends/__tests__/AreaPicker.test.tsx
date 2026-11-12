import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import AreaPicker from "../AreaPicker";
import { usePlaceArea } from "@/hooks/usePlaceArea";
import { queryFromParams } from "@/lib/trends/query";

const query = (params: string) => queryFromParams(new URLSearchParams(params));

function setup(params: string, placeError: string | null = null) {
  const onEdit = vi.fn();
  const onDraw = vi.fn();
  render(<AreaPicker query={query(params)} foundName={null} savedAreas={[]} drawMode={null} onDraw={onDraw} onEdit={onEdit} placeError={placeError} />);
  return { onEdit, onDraw };
}

describe("AreaPicker", () => {
  it("lists known regions, seas and oceans, and picks one by name", () => {
    const { onEdit } = setup("ind=dust&place=");
    const list = screen.getByLabelText("Or choose a known region, sea or ocean");
    for (const name of ["Aral Sea", "Pamirs", "Central Asia", "Mediterranean Sea", "Black Sea", "North Atlantic", "Western Pacific", "Eastern Pacific"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
    fireEvent.change(list, { target: { value: "Aral Sea" } });
    expect(onEdit).toHaveBeenCalledWith({ place: "Aral Sea" });
  });

  it("shows a chosen sea as a sea, selected in the list", () => {
    setup("ind=sst&place=Mediterranean+Sea");
    expect(screen.getByText("Sea: its water only")).toBeInTheDocument();
    expect((screen.getByLabelText("Or choose a known region, sea or ocean") as HTMLSelectElement).value).toBe("Mediterranean Sea");
  });

  it("offers to click a country or a sea on the map", () => {
    const { onDraw } = setup("ind=sst&place=");
    fireEvent.click(screen.getByRole("button", { name: "Country or sea" }));
    expect(onDraw).toHaveBeenCalledWith("country");
  });

  it("says why a place couldn't be found", () => {
    setup("ind=sst&place=Pacific", "The Pacific crosses the 180° line.");
    expect(screen.getByRole("alert")).toHaveTextContent("180° line");
  });
});

describe("usePlaceArea", () => {
  it("finds a named sea straight away, marked as water", async () => {
    const { result } = renderHook(() => usePlaceArea("Mediterranean Sea", false));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.area).toMatchObject({ name: "Mediterranean Sea", water: "sea" });
  });

  it("explains a place that can't be scanned", async () => {
    const { result } = renderHook(() => usePlaceArea("the Pacific", false));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/western or the eastern Pacific/);
  });

  it("does nothing without a place", () => {
    const { result } = renderHook(() => usePlaceArea(null, false));
    expect(result.current).toMatchObject({ status: "idle", area: null });
  });
});

describe("AreaPicker with places added together", () => {
  const rows = [
    { key: "country:UZB", label: "Uzbekistan", areaKm2: 447_000 },
    { key: "country:TKM", label: "Turkmenistan", areaKm2: 471_000 },
  ];

  function adding(params: string, on: boolean, parts = rows) {
    const handlers = { onEdit: vi.fn(), onDraw: vi.fn(), onAdd: vi.fn(), onAddingChange: vi.fn(), onRemovePart: vi.fn() };
    render(
      <AreaPicker
        query={query(params)}
        foundName={null}
        savedAreas={[]}
        drawMode={null}
        placeError={null}
        parts={parts}
        togetherKm2={918_000}
        adding={on}
        {...handlers}
      />,
    );
    return handlers;
  }

  it("names the places together and lists each with its size", () => {
    const { onRemovePart } = adding("ind=vegetation&place=Uzbekistan&add=country:TKM!Turkmenistan", false);
    expect(screen.getByText("Uzbekistan + Turkmenistan")).toBeInTheDocument();
    expect(screen.getByText("2 places together")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Places in this area" });
    expect(list).toHaveTextContent("447k km²");
    expect(list).toHaveTextContent("918k km²");
    fireEvent.click(screen.getByRole("button", { name: "Take Turkmenistan out of the area" }));
    expect(onRemovePart).toHaveBeenCalledWith(1);
  });

  it("offers to add another place once one is chosen", () => {
    const { onAddingChange } = adding("ind=vegetation&place=Uzbekistan", false, rows.slice(0, 1));
    expect(screen.queryByRole("list", { name: "Places in this area" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another place" }));
    expect(onAddingChange).toHaveBeenCalledWith(true);
  });

  it("doesn't offer it for the map view", () => {
    adding("ind=vegetation&place=", false, []);
    expect(screen.queryByRole("button", { name: "Add another place" })).not.toBeInTheDocument();
  });

  it("adds a listed sea or a typed place instead of replacing the area", () => {
    const { onAdd, onEdit } = adding("ind=vegetation&place=Uzbekistan", true, rows.slice(0, 1));
    expect(screen.getByRole("status")).toHaveTextContent("Adding places.");
    fireEvent.change(screen.getByLabelText("Or add a known region, sea or ocean"), { target: { value: "Aral Sea" } });
    expect(onAdd).toHaveBeenCalledWith({ kind: "region", label: "Aral Sea" });
    const typed = screen.getByPlaceholderText("Or type a place to add");
    fireEvent.change(typed, { target: { value: "Bukhara Region" } });
    fireEvent.keyDown(typed, { key: "Enter" });
    expect(onAdd).toHaveBeenLastCalledWith({ kind: "place", text: "Bukhara Region" });
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Map view" })).not.toBeInTheDocument();
  });

  it("stops adding when done", () => {
    const { onAddingChange } = adding("ind=vegetation&place=Uzbekistan", true, rows.slice(0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Done adding" }));
    expect(onAddingChange).toHaveBeenCalledWith(false);
  });
});
