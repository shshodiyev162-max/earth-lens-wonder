import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import AreaPicker from "../AreaPicker";
import { usePlaceArea } from "@/hooks/usePlaceArea";
import { queryFromParams } from "@/lib/trends/query";

const { SAMARKAND } = vi.hoisted(() => ({
  SAMARKAND: {
    id: "R15589846",
    name: "Samarkand",
    context: "Samarkand Province, Uzbekistan",
    kind: "city" as const,
    center: [39.65, 66.96] as [number, number],
    osm: { type: "R" as const, id: 15589846 },
    source: "photon" as const,
  },
}));

// Place search answers without the network.
vi.mock("@/lib/geo/geocode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geo/geocode")>();
  return { ...actual, searchPlaces: vi.fn(async (text: string) => (text.toLowerCase().startsWith("samar") ? [SAMARKAND] : [])) };
});

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

  it("lists continents on their own, and says how a continent's land was drawn", () => {
    setup("ind=dust&place=Europe");
    const continents = screen.getByRole("group", { name: "Continents" });
    expect(within(continents).getByRole("option", { name: "Europe" })).toBeInTheDocument();
    expect(within(continents).getByRole("option", { name: "Asia" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Regions" })).getByRole("option", { name: "Western Europe" })).toBeInTheDocument();
    expect(screen.getByText("Continent")).toBeInTheDocument();
    expect(screen.getByText(/only west of the Ural Mountains, the Ural River and the Bosporus/)).toBeInTheDocument();
    expect((screen.getByLabelText("Or choose a known region, sea or ocean") as HTMLSelectElement).value).toBe("Europe");
  });

  it("drops the note when the region's surroundings are added", () => {
    setup("ind=dust&place=Europe&near=1");
    expect(screen.getByText("Continent, with its surroundings")).toBeInTheDocument();
    expect(screen.queryByText(/Ural Mountains/)).toBeNull();
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

  it("suggests places as you type, and picks the one chosen with its real outline", async () => {
    const { onEdit } = setup("ind=vegetation&place=");
    fireEvent.change(screen.getByRole("combobox", { name: "Search a place to scan" }), { target: { value: "Samarkand" } });
    const option = await screen.findByRole("option", { name: /Samarkand/ });
    expect(option).toHaveTextContent("City · Samarkand Province, Uzbekistan");
    fireEvent.click(option);
    expect(onEdit).toHaveBeenCalledWith({ place: null, area: { osm: "R15589846", name: "Samarkand" }, near: false, extra: [] });
  });

  it("says that a region drawn as a box takes in land at its edges", () => {
    setup("ind=dust&place=Sahara");
    expect(screen.getByText("Region: North Africa")).toBeInTheDocument();
    expect(screen.getByText(/box around it/)).toBeInTheDocument();
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

  it("adds a listed sea or a searched place instead of replacing the area", async () => {
    const { onAdd, onEdit } = adding("ind=vegetation&place=Uzbekistan", true, rows.slice(0, 1));
    expect(screen.getByText("Adding places.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Or add a known region, sea or ocean"), { target: { value: "Aral Sea" } });
    expect(onAdd).toHaveBeenCalledWith({ kind: "region", label: "Aral Sea" });
    fireEvent.change(screen.getByRole("combobox", { name: "Search a place to add to the area" }), { target: { value: "Samarkand" } });
    fireEvent.click(await screen.findByRole("option", { name: /Samarkand/ }));
    expect(onAdd).toHaveBeenLastCalledWith({ kind: "osm", osm: "R15589846", name: "Samarkand", context: "Samarkand Province, Uzbekistan" });
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Map view" })).not.toBeInTheDocument();
  });

  it("stops adding when done", () => {
    const { onAddingChange } = adding("ind=vegetation&place=Uzbekistan", true, rows.slice(0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Done adding" }));
    expect(onAddingChange).toHaveBeenCalledWith(false);
  });
});
