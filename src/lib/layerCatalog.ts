import { LayerInfo } from "@/context/RegionContext";
import { MAP_LAYERS, getLayerById, getTileUrl } from "./map-layers";

// Compatibility view derived from the verified map catalog; no duplicate layer IDs.
export const LAYER_CATALOG: LayerInfo[] = MAP_LAYERS
  .filter((layer) => layer.world === "earth")
  .map((layer) => ({
    id: layer.id,
    name: layer.name,
    unit: layer.unit ?? "NASA",
    cadence: layer.cadence === "daily" ? "daily" : layer.cadence === "8-day" ? "weekly" : "monthly",
    description: layer.description,
    supportsTime: Boolean(layer.dateDependent),
    colorScheme: layer.colorScheme ?? "natural",
  }));

// Build tile URL for a layer
export function buildTileUrl(layerId: string, date: string): string {
  return getTileUrl(getLayerById(layerId), date);
}

// Get layer info by ID
export function getLayerInfo(layerId: string): LayerInfo | undefined {
  return LAYER_CATALOG.find((l) => l.id === layerId);
}

// Legend definitions for different color schemes
export const LEGENDS: Record<string, { title: string; colors: { color: string; label: string }[] }> = {
  vegetation: {
    title: "Vegetation Density",
    colors: [
      { color: "#004400", label: "Dense" },
      { color: "#00FF00", label: "Moderate" },
      { color: "#AAFFAA", label: "Sparse" },
      { color: "#FFAA00", label: "Bare/Dry" },
      { color: "#FF0000", label: "Urban" },
    ],
  },
  aerosol: {
    title: "Aerosol Optical Depth",
    colors: [
      { color: "#FFFFE0", label: "Clean (<0.1)" },
      { color: "#FFD700", label: "Low (0.1-0.2)" },
      { color: "#FF8C00", label: "Moderate (0.2-0.5)" },
      { color: "#FF0000", label: "High (0.5-1.0)" },
      { color: "#4A148C", label: "Very High (>1.0)" },
    ],
  },
  temperature: {
    title: "Surface Temperature",
    colors: [
      { color: "#0000FF", label: "<10°C" },
      { color: "#00FFFF", label: "10-20°C" },
      { color: "#00FF00", label: "20-30°C" },
      { color: "#FFFF00", label: "30-40°C" },
      { color: "#FF0000", label: ">40°C" },
    ],
  },
  chlorophyll: {
    title: "Chlorophyll-a",
    colors: [
      { color: "#001970", label: ">10 mg/m³" },
      { color: "#0066FF", label: "5-10" },
      { color: "#00FF00", label: "1-5" },
      { color: "#FFFF00", label: "0.1-1" },
      { color: "#FF6600", label: "<0.1" },
    ],
  },
  natural: {
    title: "Natural Color",
    colors: [
      { color: "#1a4461", label: "Deep Ocean" },
      { color: "#2d8aa8", label: "Shallow Water" },
      { color: "#3d6b2f", label: "Forest" },
      { color: "#8fbc8f", label: "Grassland" },
      { color: "#c2b280", label: "Desert" },
      { color: "#808080", label: "Urban" },
    ],
  },
};

// Quick jump regions
export const QUICK_REGIONS = [
  { id: "world", name: "World", center: [20, 0] as [number, number], zoom: 2 },
  { id: "uzbekistan", name: "Uzbekistan", center: [41.5, 64] as [number, number], zoom: 5 },
  { id: "central-asia", name: "Central Asia", center: [42, 65] as [number, number], zoom: 4 },
  { id: "amazon", name: "Amazon", center: [-4, -62] as [number, number], zoom: 4 },
  { id: "himalayas", name: "Himalayas", center: [28, 84] as [number, number], zoom: 5 },
];

// Date presets
export const DATE_PRESETS = [
  { label: "Latest safe", getValue: () => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split("T")[0]!; }},
  { label: "1 week ago", getValue: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]!; }},
  { label: "1 month ago", getValue: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split("T")[0]!; }},
  { label: "1 year ago", getValue: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]!; }},
];




