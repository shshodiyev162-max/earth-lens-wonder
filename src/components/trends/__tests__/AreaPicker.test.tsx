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
    expect(screen.getByText("Sea, rough outline")).toBeInTheDocument();
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
