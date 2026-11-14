import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerInfoCard } from "../LayerInfo";
import { getLayer, type GibsLayer } from "@/lib/gibs/catalog";

const layer = (id: string) => getLayer(id) as GibsLayer;

const LAND_COVER_LEGEND = `<ColorMaps><ColorMap title="Classifications"><Legend type="classification">
  <LegendEntry rgb="33,138,33" tooltip="Evergreen Needleleaf Forests" id="0"/>
  <LegendEntry rgb="250,239,115" tooltip="Croplands" id="11"/>
  <LegendEntry rgb="100,100,100" tooltip="Unclassified" id="17"/>
</Legend></ColorMap></ColorMaps>`;

afterEach(() => vi.unstubAllGlobals());

describe("LayerInfoCard", () => {
  it("says how coarse a weather-model layer is, and what that means close up", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<ColorMaps/>")));
    render(<LayerInfoCard layer={layer("MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly")} />);
    expect(screen.getByText("Pixel size").nextElementSibling).toHaveTextContent("about 50 km");
    expect(screen.getByText(/close up it shows as large squares/)).toBeInTheDocument();
  });

  it("names each colour of the land cover map, and calls its 500 m pixels fine", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(LAND_COVER_LEGEND)));
    render(<LayerInfoCard layer={layer("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual")} />);
    const legend = await screen.findByRole("list", { name: "Land cover (yearly) legend" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Evergreen Needleleaf Forests", "Croplands"]);
    expect(screen.getByText("Pixel size").nextElementSibling).toHaveTextContent("about 500 m");
    expect(screen.queryByText(/large squares/)).toBeNull();
  });

  it("adds nothing about pixels to the daily photos", () => {
    render(<LayerInfoCard layer={layer("VIIRS_NOAA20_CorrectedReflectance_TrueColor")} />);
    expect(screen.queryByText("Pixel size")).toBeNull();
  });
});
