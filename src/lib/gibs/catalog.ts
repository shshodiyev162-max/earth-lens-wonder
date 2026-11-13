// Curated NASA GIBS layers. Every identifier, tile matrix set, image format and
// colormap below was checked against NASA's live WMTS capabilities
// (https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml).
// Using the wrong matrix set or zooming past it makes GIBS answer HTTP 400, so
// each layer carries its own native zoom limit and Leaflet upsamples beyond it.

import type { ValueTransform } from "./colormap";

export const GIBS_WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const GIBS_WMS_4326 = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
export const GIBS_COLORMAPS = "https://gibs.earthdata.nasa.gov/colormaps/v1.3";

export type LayerCategory = "imagery" | "vegetation" | "heat" | "air" | "water" | "ocean" | "snow" | "night";

export type LayerPeriod = "daily" | "8-day" | "16-day" | "monthly" | "yearly" | "static";

export interface GibsLayer {
  /** GIBS layer identifier. */
  id: string;
  name: string;
  /** Instrument · platform. */
  source: string;
  description: string;
  category: LayerCategory;
  format: "jpg" | "png";
  matrixSet: string;
  /** Highest zoom level GIBS serves tiles for (from the matrix set). */
  maxNativeZoom: number;
  period: LayerPeriod;
  /** Colormap file for science layers; enables legends, area statistics and value probing. */
  colormap?: string;
  /** Display unit after transforms. */
  unit?: string;
  transform?: ValueTransform;
  decimals?: number;
  /** Near-real-time lag used for the default date (today's swaths are incomplete). */
  defaultLagDays?: number;
  /** Science layers are transparent where there is no data; draw Blue Marble underneath. */
  needsBase?: boolean;
  /** Short explanation of how to read the layer. */
  howToRead?: string;
  /** Hidden from the layer picker (analysis-only products). */
  hidden?: boolean;
  /**
   * GIBS lists stray daily dates in some MERRA-2 monthly domains; treat the record as
   * continuous between its first and last month instead.
   */
  continuousDomain?: boolean;
  /** Published on uneven dates rather than the 1st of each month (GRACE): ask for the date NASA lists in each month. */
  irregularDates?: boolean;
  /** Last month with real data, when NASA's list of dates runs on past it (YYYY-MM). */
  recordEnd?: string;
}

const matrixZoom = (matrixSet: string) => Number(matrixSet.replace(/\D+/g, ""));

function layer(definition: Omit<GibsLayer, "maxNativeZoom">): GibsLayer {
  return { ...definition, maxNativeZoom: matrixZoom(definition.matrixSet) };
}

export const LAYERS: GibsLayer[] = [
  // ── Imagery ────────────────────────────────────────────────────────────
  layer({
    id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    name: "True Color",
    source: "VIIRS · NOAA-20",
    description: "Daily natural-color view of the whole planet, as a person in orbit would see it.",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "daily",
    defaultLagDays: 2,
    howToRead: "Clouds are white, vegetation green, deserts tan, water dark blue. Black wedges are gaps between satellite passes.",
  }),
  layer({
    id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor",
    name: "True Color",
    source: "VIIRS · NOAA-21",
    description: "Natural color from NOAA's newest polar orbiter (from February 2023).",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "daily",
    defaultLagDays: 1,
  }),
  layer({
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    name: "True Color",
    source: "VIIRS · Suomi NPP",
    description: "Natural color from Suomi NPP (from November 2015).",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "daily",
    defaultLagDays: 2,
  }),
  layer({
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    name: "True Color",
    source: "MODIS · Terra",
    description: "The longest daily true-color record — every day since February 2000.",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "daily",
    defaultLagDays: 2,
  }),
  layer({
    id: "MODIS_Aqua_CorrectedReflectance_TrueColor",
    name: "True Color",
    source: "MODIS · Aqua",
    description: "Afternoon-orbit true color, daily since July 2002.",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "daily",
    defaultLagDays: 2,
  }),
  layer({
    id: "MODIS_Terra_CorrectedReflectance_Bands721",
    name: "False Color (Bands 7-2-1)",
    source: "MODIS · Terra",
    description: "Shortwave-infrared composite that separates burn scars, water, snow and vegetation.",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "daily",
    defaultLagDays: 2,
    howToRead: "Vegetation is bright green, bare soil pink-brown, burn scars red-brown, water black, snow and ice cyan.",
  }),
  layer({
    id: "BlueMarble_ShadedRelief_Bathymetry",
    name: "Blue Marble",
    source: "MODIS composite · static",
    description: "Cloud-free composite of Earth with shaded relief and ocean depth.",
    category: "imagery",
    format: "jpg",
    matrixSet: "GoogleMapsCompatible_Level8",
    period: "static",
  }),
  layer({
    id: "VIIRS_Black_Marble",
    name: "Earth at Night",
    source: "VIIRS Black Marble · annual",
    description: "Cloud-free composite of city lights (2012 and 2016 editions).",
    category: "night",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level8",
    period: "yearly",
  }),

  // ── Science layers (decodable with a colormap) ─────────────────────────
  layer({
    id: "MODIS_Terra_L3_NDVI_16Day",
    name: "Vegetation (NDVI)",
    source: "MODIS · Terra · 16-day",
    description: "How green and dense plants are, from 16-day cloud-free composites (since 2000).",
    category: "vegetation",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level9",
    period: "16-day",
    colormap: "MODIS_L3_NDVI",
    unit: "NDVI",
    decimals: 2,
    needsBase: true,
    howToRead: "Above 0.6 is dense vegetation, 0.2–0.5 crops and grassland, below 0.2 bare soil or desert. Water is not shown.",
  }),
  layer({
    id: "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
    name: "Land Surface Temperature",
    source: "MODIS · Terra · 8-day daytime",
    description: "How hot the ground itself gets in the daytime — often far hotter than the air.",
    category: "heat",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level7",
    period: "8-day",
    colormap: "MODIS_Land_Surface_Temp",
    unit: "°C",
    transform: "kelvinToCelsius",
    decimals: 1,
    needsBase: true,
    howToRead: "Purple and blue are cold, green mild, yellow to red hot. Gaps are persistent clouds.",
  }),
  layer({
    id: "MODIS_Terra_Aerosol",
    name: "Aerosol Optical Depth",
    source: "MODIS · Terra · daily",
    description: "Haze from dust, smoke and pollution in the whole column of air.",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "daily",
    colormap: "MODIS_VIIRS_AOD",
    unit: "AOD",
    decimals: 2,
    defaultLagDays: 3,
    needsBase: true,
    howToRead: "Below 0.1 is clean air, 0.1–0.3 hazy, above 0.5 thick dust or smoke. Clouds hide the retrieval.",
  }),
  layer({
    id: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day",
    name: "Carbon Monoxide",
    source: "AIRS · Aqua · daily",
    description: "Carbon monoxide in the mid-troposphere, a tracer of fires and pollution plumes.",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "daily",
    colormap: "AIRS_Carbon_Monoxide_Volume_Mixing_Ratio",
    unit: "ppbv",
    decimals: 0,
    defaultLagDays: 5,
    needsBase: true,
  }),
  layer({
    id: "IMERG_Precipitation_Rate",
    name: "Precipitation Rate",
    source: "GPM IMERG · daily",
    description: "Rain and snowfall rate estimated from the Global Precipitation Measurement constellation.",
    category: "water",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "daily",
    colormap: "GPM_Precipitation_Rate",
    unit: "mm/h",
    decimals: 1,
    defaultLagDays: 3,
    needsBase: true,
    howToRead: "Green to yellow is light to moderate rain, red heavy rain; cyan-to-purple shades are snowfall.",
  }),
  layer({
    id: "GHRSST_L4_MUR_Sea_Surface_Temperature",
    name: "Sea Surface Temperature",
    source: "GHRSST MUR · daily",
    description: "Gap-free ocean surface temperature blended from many satellites.",
    category: "ocean",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level7",
    period: "daily",
    colormap: "GHRSST_Sea_Surface_Temperature",
    unit: "°C",
    decimals: 1,
    defaultLagDays: 3,
    needsBase: true,
  }),
  layer({
    id: "MODIS_Aqua_L2_Chlorophyll_A",
    name: "Ocean Chlorophyll-a",
    source: "MODIS · Aqua · daily swaths",
    description: "Phytoplankton concentration — the base of the ocean food web.",
    category: "ocean",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level7",
    period: "daily",
    colormap: "MODIS_Chlorophyll",
    unit: "mg/m³",
    decimals: 2,
    defaultLagDays: 2,
    needsBase: true,
  }),
  layer({
    id: "MODIS_Terra_L3_NDSI_Snow_Cover_Daily",
    name: "Snow Cover",
    source: "MODIS · Terra · daily",
    description: "Fraction of each pixel covered by snow (Normalized Difference Snow Index).",
    category: "snow",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level8",
    period: "daily",
    colormap: "MODIS_NDSI_Snow_Cover",
    unit: "%",
    decimals: 0,
    defaultLagDays: 4,
    needsBase: true,
  }),
  layer({
    id: "VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance",
    name: "Night-time Radiance",
    source: "VIIRS Day/Night Band · NOAA-20 · daily",
    description: "Light seen at night: cities, gas flares, fires, fishing fleets and moonlit clouds.",
    category: "night",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level8",
    period: "daily",
    colormap: "VIIRS_DayNightBand_At_Sensor_Radiance",
    unit: "nW/cm²/sr",
    decimals: 1,
    // Yesterday's night passes are often still incomplete; two days back is
    // reliably full-coverage (checked against GIBS on 2 Oct 2026).
    defaultLagDays: 1,
  }),

  // ── Monthly products used by the Analysis page ─────────────────────────
  layer({
    id: "MODIS_Terra_L3_NDVI_Monthly",
    name: "Vegetation (NDVI, monthly)",
    source: "MODIS · Terra · monthly",
    description: "Monthly vegetation index at ~1 km.",
    category: "vegetation",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level7",
    period: "monthly",
    colormap: "MODIS_L3_NDVI",
    unit: "NDVI",
    decimals: 2,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    name: "Land Surface Temperature (monthly)",
    source: "MODIS · Terra · monthly daytime",
    description: "Monthly mean daytime land surface temperature.",
    category: "heat",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MODIS_Land_Surface_Temp",
    unit: "°C",
    transform: "kelvinToCelsius",
    decimals: 1,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
    name: "Snow Cover (monthly)",
    source: "MODIS · Terra · monthly",
    description: "Monthly average snow cover.",
    category: "snow",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MODIS_NDSI_Snow_Cover",
    unit: "%",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    name: "Aerosol Optical Depth (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly aerosol optical thickness at 550 nm from NASA's MERRA-2 reanalysis.",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    unit: "AOD",
    decimals: 2,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),

  // ── Monthly MERRA-2 products used by the trend scan (rainfall, soil moisture, dust) ──
  layer({
    id: "MERRA2_Precipitation_Bias_Corrected_Monthly",
    name: "Rainfall (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly bias-corrected precipitation from NASA's MERRA-2 reanalysis (~50 km).",
    category: "water",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Precipitation_Bias_Corrected_Monthly",
    unit: "mm/month",
    transform: "kgm2sToMmPerMonth",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Soil_Water_Root_Zone_Monthly",
    name: "Root-zone soil moisture (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly water content of the root-zone soil layer from NASA's MERRA-2 reanalysis (~50 km).",
    category: "water",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Soil_Water_Root_Zone_Monthly",
    unit: "% vol",
    transform: "fractionToPercent",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Dust_Surface_Mass_Concentration_Monthly",
    name: "Surface dust (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly dust concentration near the ground from NASA's MERRA-2 reanalysis (~50 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Dust_Surface_Mass_Concentration_Monthly",
    unit: "µg/m³",
    transform: "kgm3ToUgm3",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),

  // ── More monthly products for the trend scan (checked against GIBS capabilities, Nov 2026) ──
  layer({
    id: "MERRA2_2m_Air_Temperature_Assimilated_Monthly",
    name: "Air temperature at 2 m (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly air temperature 2 metres above the surface from NASA's MERRA-2 reanalysis (~50 km).",
    category: "heat",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_2m_Air_Temperature_Assimilated_Monthly",
    unit: "°C",
    transform: "kelvinToCelsius",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Evaporation_Land_Monthly",
    name: "Evaporation from land (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly evaporation from land from NASA's MERRA-2 reanalysis (~50 km).",
    category: "water",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Evaporation_Land_Monthly",
    unit: "mm/month",
    transform: "kgm2sToMmPerMonth",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Air_Temperature_250hPa_Monthly",
    name: "Air temperature at 250 hPa (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly air temperature about 10 km up from NASA's MERRA-2 reanalysis (~50 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Air_Temperature_250hPa_Monthly",
    unit: "°C",
    transform: "kelvinToCelsius",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly",
    name: "Ozone at 50 hPa (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly ozone about 20 km up, in the ozone layer, from NASA's MERRA-2 reanalysis (~50 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Ozone_Mixing_Ratio_50hPa_Monthly",
    unit: "ppm",
    transform: "ozoneMassToPpmv",
    decimals: 2,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_SO2_Column_Mass_Density_Monthly",
    name: "Sulphur dioxide column (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly sulphur dioxide in the whole air column from NASA's MERRA-2 reanalysis (~50 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_SO2_Column_Mass_Density_Monthly",
    unit: "mg/m²",
    transform: "kgm2ToMgm2",
    decimals: 2,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Monthly_Day",
    name: "Carbon monoxide at 500 hPa (monthly)",
    source: "AIRS · Aqua · monthly daytime",
    description: "Monthly carbon monoxide about 5 km up, measured by the AIRS instrument on NASA's Aqua satellite.",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "AIRS_Carbon_Monoxide_Volume_Mixing_Ratio",
    unit: "ppb",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MODIS_Terra_L3_SST_Thermal_4km_Night_Monthly",
    name: "Sea surface temperature (monthly, night)",
    source: "MODIS · Terra · monthly night-time",
    description: "Monthly night-time sea surface temperature at ~4 km from MODIS on NASA's Terra satellite.",
    category: "ocean",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MODIS_Sea_Surface_Temperature",
    unit: "°C",
    decimals: 1,
    needsBase: true,
    hidden: true,
  }),

  // ── Measures added Nov 2026: each was decoded for a real month over test areas before being listed ──
  layer({
    id: "MODIS_Terra_L3_EVI_Monthly",
    name: "Leaf density (EVI, monthly)",
    source: "MODIS · Terra · monthly",
    description: "Monthly enhanced vegetation index at ~1 km; stays sensitive over dense forest, where NDVI levels off.",
    category: "vegetation",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level7",
    period: "monthly",
    colormap: "MODIS_L3_EVI",
    unit: "EVI",
    decimals: 2,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night",
    name: "Land Surface Temperature (monthly, night)",
    source: "MODIS · Terra · monthly night-time",
    description: "Monthly mean night-time land surface temperature at ~5 km.",
    category: "heat",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MODIS_Land_Surface_Temp",
    unit: "°C",
    transform: "kelvinToCelsius",
    decimals: 1,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "GLDAS_Underground_Soil_Moisture_Monthly",
    name: "Topsoil moisture (monthly)",
    source: "GLDAS · Noah land model · monthly",
    description: "Monthly water in the top 10 cm of soil from NASA's GLDAS land model (~25 km). 1 kg/m² of water in a 10 cm layer is 1% of its volume, so NASA's values read directly as % by volume.",
    category: "water",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "GLDAS_Underground_Soil_Moisture_Monthly",
    unit: "% vol",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
    name: "Water storage (monthly)",
    source: "GRACE and GRACE-FO · monthly",
    description: "Monthly change in all the water held on and under the land (ice, snow, lakes, soil, groundwater), from gravity measured by the GRACE and GRACE-FO satellites (~300 km).",
    category: "water",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
    unit: "cm",
    decimals: 1,
    needsBase: true,
    hidden: true,
    irregularDates: true,
    recordEnd: "2022-07",
  }),
  layer({
    id: "AMSRU2_Snow_Water_Equivalent_Monthly",
    name: "Snow water (monthly)",
    source: "AMSR2 · GCOM-W1 · monthly",
    description: "Monthly water held in the snowpack, measured by microwave from the AMSR2 instrument (~25 km).",
    category: "snow",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "AMSR_Snow_Water_Equivalent",
    unit: "mm",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MERRA2_Snowfall_Monthly",
    name: "Snowfall (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly snowfall from NASA's MERRA-2 reanalysis (~50 km).",
    category: "snow",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Snowfall_Monthly",
    unit: "mm/month",
    transform: "snowfallToMmPerMonth",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Incident_Shortwave_Over_Land_Monthly",
    name: "Sunlight at the ground (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly sunlight reaching the land, after clouds and haze, from NASA's MERRA-2 reanalysis (~50 km).",
    category: "heat",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Incident_Shortwave_Over_Land_Monthly",
    unit: "W/m²",
    decimals: 0,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "AIRS_L3_Surface_Relative_Humidity_Monthly_Day",
    name: "Humidity near the surface (monthly)",
    source: "AIRS · Aqua · monthly daytime",
    description: "Monthly daytime relative humidity near the surface, measured by the AIRS instrument on NASA's Aqua satellite (~100 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "AIRS_Surface_Relative_Humidity_Monthly_Day",
    unit: "%",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MERRA2_Total_Precipitable_Water_Vapor_Monthly",
    name: "Water vapour (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly water vapour in the whole column of air from NASA's MERRA-2 reanalysis (~50 km). 1 kg/m² is a 1 mm layer of water.",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Total_Precipitable_Water_Vapor_Monthly",
    unit: "mm",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "MERRA2_Surface_Wind_Speed_Monthly",
    name: "Wind speed near the surface (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly wind speed near the surface from NASA's MERRA-2 reanalysis (~50 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Surface_Wind_Speed_Monthly",
    unit: "m/s",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "AIRS_L3_All_Sky_Outgoing_Longwave_Radiation_Monthly_Day",
    name: "Heat leaving for space (monthly)",
    source: "AIRS · Aqua · monthly daytime",
    description: "Monthly heat radiated out to space, measured by the AIRS instrument on NASA's Aqua satellite (~100 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "AIRS_All_Sky_Outgoing_Longwave_Radiation",
    unit: "W/m²",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly",
    name: "Fine dust PM2.5 (monthly)",
    source: "MERRA-2 reanalysis · monthly",
    description: "Monthly fine dust near the ground, small enough to reach the lungs, from NASA's MERRA-2 reanalysis (~50 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MERRA2_Dust_Surface_Mass_Concentration_PM25_Monthly",
    unit: "µg/m³",
    transform: "kgm3ToUgm3",
    decimals: 1,
    needsBase: true,
    hidden: true,
    continuousDomain: true,
  }),
  layer({
    id: "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day",
    name: "Methane at 400 hPa (monthly)",
    source: "AIRS · Aqua · monthly daytime",
    description: "Monthly methane about 7 km up, measured by the AIRS instrument on NASA's Aqua satellite (~100 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "AIRS_Methane_Volume_Mixing_Ratio",
    unit: "ppb",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "MOPITT_CO_Monthly_Surface_Mixing_Ratio_Day",
    name: "Carbon monoxide near the ground (monthly)",
    source: "MOPITT · Terra · monthly daytime",
    description: "Monthly carbon monoxide near the ground, measured by the MOPITT instrument on NASA's Terra satellite (~100 km).",
    category: "air",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "MOPITT_CO_Surface_Mixing_Ratio",
    unit: "ppb",
    decimals: 0,
    needsBase: true,
    hidden: true,
  }),
  layer({
    id: "SMAP_L3_Sea_Surface_Salinity_CAP_Monthly",
    name: "Sea surface salinity (monthly)",
    source: "SMAP · monthly",
    description: "Monthly saltiness of the sea surface, measured by the SMAP satellite (~70 km).",
    category: "ocean",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level6",
    period: "monthly",
    colormap: "SMAP_Sea_Surface_Salinity",
    unit: "PSU",
    decimals: 1,
    needsBase: true,
    hidden: true,
  }),
];

/** Yearly land cover (17 classes, 2001 onwards): what an area is like, to suggest measures for it. */
LAYERS.push(
  layer({
    id: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
    name: "Land cover (yearly)",
    source: "MODIS · Terra + Aqua · yearly",
    description: "Yearly land cover type (IGBP classes) at ~500 m from MODIS.",
    category: "vegetation",
    format: "png",
    matrixSet: "GoogleMapsCompatible_Level8",
    period: "yearly",
    needsBase: true,
    hidden: true,
  }),
);

/** Static land/water map used to leave lakes and seas out of the trend scan. */
export const LAND_WATER_LAYER_ID = "OSM_Land_Water_Map";

export const MAP_LAYERS = LAYERS.filter((item) => !item.hidden);

export const CATEGORY_LABELS: Record<LayerCategory, string> = {
  imagery: "Satellite imagery",
  vegetation: "Vegetation",
  heat: "Heat",
  air: "Air & atmosphere",
  water: "Rain & snowfall",
  ocean: "Oceans",
  snow: "Snow & ice",
  night: "Night lights",
};

export const CATEGORY_ORDER: LayerCategory[] = ["imagery", "vegetation", "heat", "air", "water", "ocean", "snow", "night"];

export const DEFAULT_LAYER_ID = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
export const DEFAULT_COMPARE_LAYER_ID = "MODIS_Terra_L3_NDVI_16Day";
export const BASE_LAYER_ID = "BlueMarble_ShadedRelief_Bathymetry";

const BY_ID = new Map(LAYERS.map((item) => [item.id, item]));

export function getLayer(id: string | null | undefined): GibsLayer | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function getLayerOrDefault(id: string | null | undefined, fallback = DEFAULT_LAYER_ID): GibsLayer {
  return getLayer(id) ?? (BY_ID.get(fallback) as GibsLayer);
}

export function isTimeEnabled(item: GibsLayer): boolean {
  return item.period !== "static";
}

export function isScienceLayer(item: GibsLayer): boolean {
  return Boolean(item.colormap);
}

/** WMTS tile URL template for Leaflet ({z}/{y}/{x}). */
export function tileUrlTemplate(item: GibsLayer, date: string | null): string {
  const time = isTimeEnabled(item) && date ? `${date}/` : "";
  return `${GIBS_WMTS}/${item.id}/default/${time}${item.matrixSet}/{z}/{y}/{x}.${item.format}`;
}

export function layerLabel(item: GibsLayer): string {
  return `${item.name} · ${item.source.split(" · ").slice(0, 2).join(" · ")}`;
}

/**
 * How well a layer matches the typed words: 0 when a word of its name starts with them ("temp" →
 * Land Surface Temperature, "ndvi" → Vegetation (NDVI)), 1 anywhere in its name, 2 in its source,
 * group or id, 3 only in its description, and -1 not at all.
 */
export function layerMatchScore(item: GibsLayer, query: string): number {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return 0;
  const name = item.name.toLowerCase();
  if (name.startsWith(q) || name.split(/[^a-z0-9.₂]+/).some((word, index, words) => word.startsWith(q) || words.slice(index).join(" ").startsWith(q))) return 0;
  if (name.includes(q)) return 1;
  if ([item.source, CATEGORY_LABELS[item.category], item.id].some((text) => text.toLowerCase().includes(q))) return 2;
  return item.description.toLowerCase().includes(q) ? 3 : -1;
}

/** Layers matching the typed words, the closest matches first. */
export function searchLayers(query: string, layers: GibsLayer[] = MAP_LAYERS): GibsLayer[] {
  if (!query.trim()) return layers;
  return layers
    .map((item, index) => ({ item, index, score: layerMatchScore(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function periodLabel(period: LayerPeriod): string {
  switch (period) {
    case "daily":
      return "Daily";
    case "8-day":
      return "8-day composite";
    case "16-day":
      return "16-day composite";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Annual";
    default:
      return "Static";
  }
}

/** Approximate ground size of one tile pixel at the layer's native zoom, in degrees. */
export function nativeResolutionDeg(item: GibsLayer): number {
  return 360 / (256 * 2 ** item.maxNativeZoom);
}
