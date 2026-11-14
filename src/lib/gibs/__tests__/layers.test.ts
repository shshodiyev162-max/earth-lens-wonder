import { describe, expect, it } from "vitest";
import { COARSE_PIXEL_KM, getLayer, LAYERS, layerSubtitle, MAP_LAYERS, pixelSize, type GibsLayer } from "../catalog";
import { parseClassLegend } from "../colormap";

const layer = (id: string) => getLayer(id) as GibsLayer;

describe("the layer list on the map pages", () => {
  it("offers the monthly records too, except copies of layers already listed", () => {
    expect(MAP_LAYERS).toHaveLength(40);
    for (const id of [
      "MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly",
      "MERRA2_Precipitation_Bias_Corrected_Monthly",
      "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
      "SMAP_L3_Sea_Surface_Salinity_CAP_Monthly",
      "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day",
      "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
    ]) {
      expect(MAP_LAYERS.map((item) => item.id), id).toContain(id);
    }
  });

  it("leaves out only monthly copies of a listed layer, each with its listed twin", () => {
    const twins: Record<string, string> = {
      MODIS_Terra_L3_NDVI_Monthly: "MODIS_Terra_L3_NDVI_16Day",
      MODIS_Terra_L3_EVI_Monthly: "MODIS_Terra_L3_NDVI_16Day",
      MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day: "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
      MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct: "MODIS_Terra_L3_NDSI_Snow_Cover_Daily",
      MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly: "MODIS_Terra_Aerosol",
      AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Monthly_Day: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day",
      MODIS_Terra_L3_SST_Thermal_4km_Night_Monthly: "GHRSST_L4_MUR_Sea_Surface_Temperature",
    };
    const hidden = LAYERS.filter((item) => item.hidden).map((item) => item.id);
    expect(hidden.sort()).toEqual(Object.keys(twins).sort());
    for (const [id, twin] of Object.entries(twins)) {
      expect(layer(twin).hidden, twin).toBeFalsy();
      expect(layer(twin).category, id).toBe(layer(id).category);
    }
  });

  it("says how big a pixel is for every monthly or yearly record listed", () => {
    for (const item of MAP_LAYERS.filter((entry) => entry.period === "monthly" || entry.id.includes("Land_Cover"))) {
      expect(item.pixelKm, item.id).toBeGreaterThan(0);
    }
    expect(layer("MERRA2_2m_Air_Temperature_Assimilated_Monthly").pixelKm).toBeGreaterThanOrEqual(COARSE_PIXEL_KM);
    expect(layer("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual").pixelKm).toBeLessThan(COARSE_PIXEL_KM);
    expect(pixelSize(50)).toBe("about 50 km");
    expect(pixelSize(0.5)).toBe("about 500 m");
  });

  it("gives every listed layer a way to read it: a colour scale, named categories, or a photo", () => {
    for (const item of MAP_LAYERS) {
      const readable = Boolean(item.colormap || item.classes || item.category === "imagery" || item.category === "night");
      expect(readable, item.id).toBe(true);
    }
    expect(layer("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual").classes).toBe("MODIS_IGBP_Land_Cover_Type");
  });
});

describe("parseClassLegend", () => {
  // From NASA's land cover legend (MODIS_IGBP_Land_Cover_Type.xml), shortened.
  const XML = `<ColorMaps><ColorMap title="Classifications"><Legend type="classification">
    <LegendEntry rgb="33,138,33" tooltip="Evergreen Needleleaf Forests" id="0"/>
    <LegendEntry rgb="250,239,115" tooltip="Croplands" id="11"/>
    <LegendEntry rgb="255,0,0" tooltip="Urban and Built-up Lands" id="12"/>
    <LegendEntry rgb="100,100,100" tooltip="Unclassified" id="17"/>
  </Legend></ColorMap></ColorMaps>`;

  it("reads each colour and what it stands for, leaving out unclassified pixels", () => {
    expect(parseClassLegend(XML)).toEqual([
      { color: "rgb(33,138,33)", name: "Evergreen Needleleaf Forests" },
      { color: "rgb(250,239,115)", name: "Croplands" },
      { color: "rgb(255,0,0)", name: "Urban and Built-up Lands" },
    ]);
  });
});

describe("layerSubtitle", () => {
  it("says how often a layer updates once, and how coarse it is when that matters", () => {
    expect(layerSubtitle(layer("MODIS_Terra_Aerosol"))).toBe("MODIS · Terra · daily");
    expect(layerSubtitle(layer("MODIS_Terra_L3_NDVI_16Day"))).toBe("MODIS · Terra · 16-day");
    expect(layerSubtitle(layer("MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly"))).toBe("MERRA-2 reanalysis · monthly · 50 km pixels");
    expect(layerSubtitle(layer("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual"))).toBe("MODIS · Terra + Aqua · yearly");
    expect(layerSubtitle(layer("VIIRS_Black_Marble"))).toBe("VIIRS Black Marble · annual");
    expect(layerSubtitle(layer("GHRSST_L4_MUR_Sea_Surface_Temperature"))).toBe("GHRSST MUR · daily");
  });
});
