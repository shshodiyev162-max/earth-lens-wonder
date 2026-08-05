// Curated NASA GIBS catalog. URLs, formats, and matrix sets are taken from
// NASA's live EPSG:3857 WMTS capabilities document.
export interface MapLayer {
  id: string;
  name: string;
  description: string;
  tileUrl: string;
  category: 'base' | 'overlay';
  legend?: LegendItem[];
  dateDependent?: boolean;
  maxZoom: number;
  world?: 'earth' | 'moon' | 'mars';
  cadence?: 'static' | 'daily' | '8-day';
  unit?: string;
  colorScheme?: string;
  safeLagDays?: number;
  theme?: LayerTheme;
}

export type LayerTheme =
  | 'imagery'
  | 'vegetation'
  | 'atmosphere'
  | 'temperature'
  | 'ocean'
  | 'weather'
  | 'cryosphere'
  | 'human';

export interface LegendItem {
  color: string;
  label: string;
}

// Curated layers that work with NASA GIBS / Trek tiles (matching project_hackaton)
export const MAP_LAYERS: MapLayer[] = [
  // Earth layers
  {
    id: 'blue-marble',
    name: 'Blue Marble',
    description: 'True color imagery of Earth',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: false,
    maxZoom: 8,
    world: 'earth',
    cadence: 'static',
    unit: 'RGB',
    colorScheme: 'natural',
    safeLagDays: 0,
    theme: 'imagery',
  },
  {
    id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    name: 'VIIRS NOAA-20 True Color',
    description: 'Daily true color satellite imagery (Optical)',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: true,
    maxZoom: 9,
    world: 'earth',
    cadence: 'daily',
    unit: 'RGB',
    colorScheme: 'natural',
    safeLagDays: 2,
    theme: 'imagery',
  },
  {
    id: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
    name: 'VIIRS NOAA-21 True Color',
    description: 'Latest-generation daily natural-color imagery from NOAA-21',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: true,
    maxZoom: 9,
    world: 'earth',
    cadence: 'daily',
    unit: 'RGB',
    colorScheme: 'natural',
    safeLagDays: 1,
    theme: 'imagery',
  },
  {
    id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    name: 'VIIRS SNPP True Color',
    description: 'Daily true color satellite imagery',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: true,
    maxZoom: 9,
    world: 'earth',
    cadence: 'daily',
    unit: 'RGB',
    colorScheme: 'natural',
    safeLagDays: 2,
    theme: 'imagery',
  },
  {
    id: 'MODIS_Terra_CorrectedReflectance_Bands721',
    name: 'False Color (Vegetation)',
    description: 'MODIS Terra Bands 7-2-1 - Shows vegetation in red',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_Bands721/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: true,
    maxZoom: 9,
    world: 'earth',
    cadence: 'daily',
    unit: 'RGB',
    colorScheme: 'vegetation',
    safeLagDays: 2,
    theme: 'imagery',
  },
  {
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    name: 'True Color (MODIS Terra)',
    description: 'MODIS Terra corrected reflectance',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: true,
    maxZoom: 9,
    world: 'earth',
    cadence: 'daily',
    unit: 'RGB',
    colorScheme: 'natural',
    safeLagDays: 2,
    theme: 'imagery',
  },
  {
    id: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
    name: 'MODIS Aqua True Color',
    description: 'Afternoon-orbit natural-color imagery from MODIS Aqua',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    category: 'base',
    dateDependent: true,
    maxZoom: 9,
    world: 'earth',
    cadence: 'daily',
    unit: 'RGB',
    colorScheme: 'natural',
    safeLagDays: 2,
    theme: 'imagery',
  },
  {
    id: 'MODIS_Terra_Aerosol',
    name: 'Atmosphere Dust (Aerosol)',
    description: 'Aerosol Optical Depth, MODIS Terra',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Aerosol/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 6,
    world: 'earth',
    cadence: 'daily',
    unit: 'AOD',
    colorScheme: 'aerosol',
    safeLagDays: 3,
    theme: 'atmosphere',
  },
  {
    id: 'ndvi',
    name: 'Vegetation Index (NDVI)',
    description: 'Normalized Difference Vegetation Index',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 8,
    world: 'earth',
    cadence: '8-day',
    unit: 'index',
    colorScheme: 'vegetation',
    safeLagDays: 9,
    theme: 'vegetation',
    legend: [
      { color: '#8B4513', label: 'Bare soil' },
      { color: '#D2691E', label: 'Very low' },
      { color: '#F4A460', label: 'Low' },
      { color: '#ADFF2F', label: 'Moderate' },
      { color: '#228B22', label: 'High' },
      { color: '#006400', label: 'Very high' },
    ],
  },
  {
    id: 'land-surface-temp',
    name: 'Land Surface Temperature',
    description: 'Daytime temperature of the land surface',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 7,
    world: 'earth',
    cadence: 'daily',
    unit: '°C',
    colorScheme: 'temperature',
    safeLagDays: 3,
    theme: 'temperature',
    legend: [
      { color: '#00008B', label: '-2°C (Cold)' },
      { color: '#0000FF', label: '5°C' },
      { color: '#00CED1', label: '15°C' },
      { color: '#FFD700', label: '25°C' },
      { color: '#FF4500', label: '32°C' },
      { color: '#8B0000', label: '35°C (Hot)' },
    ],
  },
  {
    id: 'aerosol',
    name: 'Aerosol / Dust',
    description: 'Atmospheric aerosol optical depth',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Aerosol/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 6,
    world: 'earth',
    cadence: 'daily',
    unit: 'AOD',
    colorScheme: 'aerosol',
    safeLagDays: 3,
    theme: 'atmosphere',
    legend: [
      { color: '#E0F7FA', label: 'Clean air' },
      { color: '#FFEB3B', label: 'Moderate' },
      { color: '#FF9800', label: 'High' },
      { color: '#F44336', label: 'Very high' },
      { color: '#4A148C', label: 'Extreme' },
    ],
  },
  {
    id: 'VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance',
    name: 'Night Lights',
    description: 'Daily low-light radiance revealing cities, infrastructure, fires, and auroras',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 8,
    world: 'earth',
    cadence: 'daily',
    unit: 'radiance',
    colorScheme: 'nightlights',
    safeLagDays: 1,
    theme: 'human',
    legend: [
      { color: '#05070b', label: 'Dark' },
      { color: '#64748b', label: 'Faint' },
      { color: '#f8fafc', label: 'Bright' },
    ],
  },
  {
    id: 'MODIS_Aqua_L2_Chlorophyll_A',
    name: 'Ocean Chlorophyll',
    description: 'Daily chlorophyll-a concentration indicating marine biological activity',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_L2_Chlorophyll_A/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 7,
    world: 'earth',
    cadence: 'daily',
    unit: 'mg/m³',
    colorScheme: 'chlorophyll',
    safeLagDays: 2,
    theme: 'ocean',
    legend: [
      { color: '#001970', label: 'Very low' },
      { color: '#0066ff', label: 'Low' },
      { color: '#00c853', label: 'Moderate' },
      { color: '#ffea00', label: 'High' },
      { color: '#ff3d00', label: 'Very high' },
    ],
  },
  {
    id: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
    name: 'Sea Surface Temperature',
    description: 'Daily global ocean surface temperature from the MUR analysis',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 7,
    world: 'earth',
    cadence: 'daily',
    unit: '°C',
    colorScheme: 'temperature',
    safeLagDays: 3,
    theme: 'ocean',
    legend: [
      { color: '#312e81', label: 'Cold' },
      { color: '#0284c7', label: 'Cool' },
      { color: '#22c55e', label: 'Mild' },
      { color: '#facc15', label: 'Warm' },
      { color: '#dc2626', label: 'Hot' },
    ],
  },
  {
    id: 'IMERG_Precipitation_Rate',
    name: 'Precipitation Rate',
    description: 'Daily global precipitation-rate estimate from the GPM IMERG mission',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 6,
    world: 'earth',
    cadence: 'daily',
    unit: 'mm/hr',
    colorScheme: 'precipitation',
    safeLagDays: 3,
    theme: 'weather',
    legend: [
      { color: '#dbeafe', label: 'Light' },
      { color: '#38bdf8', label: 'Moderate' },
      { color: '#2563eb', label: 'Heavy' },
      { color: '#7c3aed', label: 'Extreme' },
    ],
  },
  {
    id: 'MODIS_Terra_L3_NDSI_Snow_Cover_Daily',
    name: 'Snow Cover',
    description: 'Daily MODIS Terra snow-cover extent derived from NDSI',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDSI_Snow_Cover_Daily/default/{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 8,
    world: 'earth',
    cadence: 'daily',
    unit: '% cover',
    colorScheme: 'snow',
    safeLagDays: 4,
    theme: 'cryosphere',
    legend: [
      { color: '#334155', label: 'No snow' },
      { color: '#93c5fd', label: 'Partial' },
      { color: '#f8fafc', label: 'Snow covered' },
    ],
  },
  {
    id: 'AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day',
    name: 'Carbon Monoxide',
    description: 'Daily daytime carbon-monoxide concentration in the mid-troposphere',
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    category: 'overlay',
    dateDependent: true,
    maxZoom: 6,
    world: 'earth',
    cadence: 'daily',
    unit: 'ppbv',
    colorScheme: 'carbon-monoxide',
    safeLagDays: 5,
    theme: 'atmosphere',
    legend: [
      { color: '#172554', label: 'Low' },
      { color: '#06b6d4', label: 'Moderate' },
      { color: '#facc15', label: 'High' },
      { color: '#dc2626', label: 'Very high' },
    ],
  },
  // Moon layers
  {
    id: 'LROC_WAC_Mosaic_Global_303ppd',
    name: 'Moon - LROC WAC Mosaic',
    description: 'Lunar Reconnaissance Orbiter Wide Angle Camera',
    tileUrl: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd/{z}/{x}/{y}.jpg',
    category: 'base',
    dateDependent: false,
    maxZoom: 9,
    world: 'moon',
  },
  {
    id: 'LRO_WAC_Mosaic_Global_100ppd',
    name: 'Moon - LRO Color Shaded Relief',
    description: 'LRO Color Shaded Relief Global',
    tileUrl: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_100ppd/{z}/{x}/{y}.jpg',
    category: 'base',
    dateDependent: false,
    maxZoom: 9,
    world: 'moon',
  },
  // Mars layers
  {
    id: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
    name: 'Mars - Viking Global Mosaic',
    description: 'Viking Mars Global Mosaic',
    tileUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/{z}/{x}/{y}.jpg',
    category: 'base',
    dateDependent: false,
    maxZoom: 9,
    world: 'mars',
  },
  {
    id: 'Mars_MGS_MOLA_Hillshade_global_463m',
    name: 'Mars - MOLA Hillshade',
    description: 'Mars MOLA Hillshade Global',
    tileUrl: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_Hillshade_global_463m/{z}/{x}/{y}.jpg',
    category: 'base',
    dateDependent: false,
    maxZoom: 9,
    world: 'mars',
  },
];

// Layer scales for legend (matching project_hackaton) — expanded to cover every
// map type in the catalog so all maps can display an accurate color scale.
export type LayerScale = {
  name: string;
  unit: string;
  colors: string[];
  values: (string | number)[];
};

export const LAYER_SCALES: Record<string, LayerScale> = {
  'blue-marble': {
    name: 'Natural Color',
    unit: 'RGB',
    colors: ['#0b3d74', '#1a6fb5', '#3d9b6a', '#90be6d', '#c9b37e', '#b0b0b0'],
    values: ['Deep water', 'Coastal', 'Forest', 'Vegetation', 'Desert', 'Urban'],
  },
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor': {
    name: 'True Color',
    unit: 'RGB',
    colors: ['#0b3d74', '#1a6fb5', '#3d9b6a', '#90be6d', '#c9b37e', '#b0b0b0'],
    values: ['Deep water', 'Coastal', 'Forest', 'Vegetation', 'Desert', 'Urban'],
  },
  'VIIRS_NOAA21_CorrectedReflectance_TrueColor': {
    name: 'True Color',
    unit: 'RGB',
    colors: ['#0b3d74', '#1a6fb5', '#3d9b6a', '#90be6d', '#c9b37e', '#b0b0b0'],
    values: ['Deep water', 'Coastal', 'Forest', 'Vegetation', 'Desert', 'Urban'],
  },
  'VIIRS_SNPP_CorrectedReflectance_TrueColor': {
    name: 'True Color',
    unit: 'RGB',
    colors: ['#0b3d74', '#1a6fb5', '#3d9b6a', '#90be6d', '#c9b37e', '#b0b0b0'],
    values: ['Deep water', 'Coastal', 'Forest', 'Vegetation', 'Desert', 'Urban'],
  },
  'MODIS_Terra_CorrectedReflectance_Bands721': {
    name: 'False Color (Vegetation)',
    unit: 'index',
    colors: ['#1a1a1a', '#4d1f00', '#b3541e', '#f0a05a', '#6fbf4b', '#006400'],
    values: ['Bare', 'Sparse', 'Moderate', 'Active', 'Dense', 'Very dense'],
  },
  'MODIS_Terra_CorrectedReflectance_TrueColor': {
    name: 'True Color',
    unit: 'RGB',
    colors: ['#0b3d74', '#1a6fb5', '#3d9b6a', '#90be6d', '#c9b37e', '#b0b0b0'],
    values: ['Deep water', 'Coastal', 'Forest', 'Vegetation', 'Desert', 'Urban'],
  },
  'MODIS_Aqua_CorrectedReflectance_TrueColor': {
    name: 'True Color',
    unit: 'RGB',
    colors: ['#0b3d74', '#1a6fb5', '#3d9b6a', '#90be6d', '#c9b37e', '#b0b0b0'],
    values: ['Deep water', 'Coastal', 'Forest', 'Vegetation', 'Desert', 'Urban'],
  },
  'MODIS_Terra_Aerosol': {
    name: 'Dust & Aerosols (AOD)',
    unit: 'AOD',
    colors: ['#e0f7fa', '#fff9c4', '#ffeb3b', '#ff9800', '#f44336', '#4a148c'],
    values: [0, 0.1, 0.2, 0.4, 0.7, 1.0],
  },
  'aerosol': {
    name: 'Dust & Aerosols (AOD)',
    unit: 'AOD',
    colors: ['#e0f7fa', '#fff9c4', '#ffeb3b', '#ff9800', '#f44336', '#4a148c'],
    values: [0, 0.1, 0.2, 0.4, 0.7, 1.0],
  },
  'ndvi': {
    name: 'NDVI (Plant Greenness)',
    unit: 'index',
    colors: ['#8B4513', '#D2691E', '#F4A460', '#ADFF2F', '#228B22', '#006400'],
    values: [-0.2, 0.0, 0.2, 0.4, 0.6, 0.8],
  },
  'land-surface-temp': {
    name: 'Land Surface Temperature',
    unit: '°C',
    colors: ['#00008B', '#0000FF', '#00CED1', '#FFD700', '#FF4500', '#8B0000'],
    values: [-25, -10, 0, 15, 30, 45],
  },
  'GHRSST_L4_MUR_Sea_Surface_Temperature': {
    name: 'Sea Surface Temperature',
    unit: '°C',
    colors: ['#312e81', '#0284c7', '#22c55e', '#facc15', '#f97316', '#dc2626'],
    values: [-2, 5, 12, 20, 28, 35],
  },
  'VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance': {
    name: 'Night Lights (Radiance)',
    unit: 'nW/cm²/sr',
    colors: ['#000000', '#1f2937', '#64748b', '#cbd5e1', '#f8fafc'],
    values: [0, 1, 10, 100, 1000],
  },
  'MODIS_Aqua_L2_Chlorophyll_A': {
    name: 'Ocean Chlorophyll-a',
    unit: 'mg/m³',
    colors: ['#001970', '#0066ff', '#00c853', '#ffea00', '#ff3d00', '#8b0000'],
    values: [0.01, 0.1, 0.5, 1, 5, 10],
  },
  'IMERG_Precipitation_Rate': {
    name: 'Precipitation Rate',
    unit: 'mm/hr',
    colors: ['#dbeafe', '#38bdf8', '#2563eb', '#7c3aed', '#dc2626'],
    values: [0, 0.5, 2, 5, 10],
  },
  'MODIS_Terra_L3_NDSI_Snow_Cover_Daily': {
    name: 'Snow Cover',
    unit: '%',
    colors: ['#334155', '#93c5fd', '#e0f2fe', '#f8fafc'],
    values: [0, 25, 60, 100],
  },
  'AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day': {
    name: 'Carbon Monoxide',
    unit: 'ppbv',
    colors: ['#172554', '#0369a1', '#06b6d4', '#facc15', '#f97316', '#dc2626'],
    values: [30, 50, 80, 120, 160, 200],
  },
};

export function getLayerScale(layer: MapLayer): LayerScale | undefined {
  // True-color / Blue Marble layers are natural RGB imagery, not scientific
  // measurements - displaying a measurement scale on them would be misleading.
  if (layer.id === 'blue-marble' || layer.id.endsWith('TrueColor')) return undefined;
  return LAYER_SCALES[layer.id];
}

export const COUNTRY_BORDERS_URL = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';
export const COUNTRY_GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

export function getTileUrl(layer: MapLayer, date: string): string {
  if (!layer.dateDependent) return layer.tileUrl;
  return layer.tileUrl.replace('{date}', getSafeDate(layer, date));
}

export function getLayersByWorld(world: 'earth' | 'moon' | 'mars'): MapLayer[] {
  return MAP_LAYERS.filter((l) => l.world === world);
}

export function searchLayers(query: string): MapLayer[] {
  const q = query.toLowerCase();
  return MAP_LAYERS.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q)
  );
}

export function formatDateForGIBS(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getDefaultDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3);
  return formatDateForGIBS(d);
}

export function getSafeDate(layer: MapLayer, requestedDate?: string): string {
  if (!layer.dateDependent) return '';
  const latest = new Date();
  latest.setUTCDate(latest.getUTCDate() - (layer.safeLagDays ?? 3));
  const latestString = formatDateForGIBS(latest);
  return !requestedDate || requestedDate > latestString ? latestString : requestedDate;
}

const availabilityCache = new Map<string, boolean>();

function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDateForGIBS(next);
}

export function getAvailabilityProbeUrl(layer: MapLayer, date: string): string {
  return layer.tileUrl
    .replace('{date}', date)
    .replace('{z}', '0')
    .replace('{x}', '0')
    .replace('{y}', '0');
}

async function isDateAvailable(layer: MapLayer, date: string, signal?: AbortSignal): Promise<boolean> {
  const key = `${layer.id}:${date}`;
  const cached = availabilityCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(getAvailabilityProbeUrl(layer, date), {
      method: 'HEAD',
      mode: 'cors',
      cache: 'force-cache',
      signal,
    });
    const available = response.ok;
    availabilityCache.set(key, available);
    return available;
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') throw error;

    // If a browser or network blocks the availability probe, retain the safe
    // date instead of making the imagery unusable.
    return true;
  }
}

export interface ResolvedMapDate {
  requestedDate: string;
  resolvedDate: string;
  usedFallback: boolean;
}

export async function resolveClosestAvailableDate(
  layer: MapLayer,
  requestedDate: string,
  options: { maxSearchDays?: number; signal?: AbortSignal } = {},
): Promise<ResolvedMapDate> {
  const safeRequestedDate = getSafeDate(layer, requestedDate);
  if (!layer.dateDependent) {
    return { requestedDate, resolvedDate: '', usedFallback: false };
  }

  if (await isDateAvailable(layer, safeRequestedDate, options.signal)) {
    return {
      requestedDate,
      resolvedDate: safeRequestedDate,
      usedFallback: requestedDate !== safeRequestedDate,
    };
  }

  const latest = getSafeDate(layer);
  const maxSearchDays = options.maxSearchDays ?? (layer.cadence === '8-day' ? 20 : 10);

  for (let distance = 1; distance <= maxSearchDays; distance += 1) {
    const earlier = shiftDate(safeRequestedDate, -distance);
    const later = shiftDate(safeRequestedDate, distance);
    const candidates = later <= latest ? [earlier, later] : [earlier];

    for (const candidate of candidates) {
      if (await isDateAvailable(layer, candidate, options.signal)) {
        return { requestedDate, resolvedDate: candidate, usedFallback: true };
      }
    }
  }

  return {
    requestedDate,
    resolvedDate: safeRequestedDate,
    usedFallback: requestedDate !== safeRequestedDate,
  };
}

export function getLayerById(id?: string): MapLayer {
  return MAP_LAYERS.find((layer) => layer.id === id) ?? MAP_LAYERS[1];
}

