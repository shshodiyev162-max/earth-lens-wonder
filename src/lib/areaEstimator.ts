import type { MapLayer } from "./map-layers";

export type AreaMetric = {
  layerId: string;
  layerName: string;
  label: string;
  value: number;
  unit: string;
  formatted: string;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function getLayerMetricLabel(layer: MapLayer): string {
  switch (layer.theme) {
    case "temperature": return layer.id.includes("Sea") ? "Est. sea temp" : "Est. land temp";
    case "vegetation": return "Est. NDVI";
    case "atmosphere": return layer.id.includes("Carbon") ? "Est. CO (ppbv)" : "Est. AOD (dust)";
    case "weather": return "Est. precip rate";
    case "ocean": return layer.id.includes("Chlorophyll") ? "Est. chlorophyll-a" : "Est. sea temp";
    case "cryosphere": return "Est. snow cover";
    case "human": return "Est. night radiance";
    default: return null as unknown as string;
  }
}

export function estimateLayerValue(layer: MapLayer, center: [number, number]): number | null {
  const [lat, lng] = center;
  const absLat = Math.abs(lat);

  if (layer.theme === "temperature") {
    const base = 35 - absLat * 0.62;
    return clamp(Math.round((base + Math.sin(lng * 0.08) * 4) * 10) / 10, -35, 50);
  }
  if (layer.theme === "vegetation" || layer.id === "ndvi") {
    const isArid = lng > -20 && lng < 55 && ((lat > 5 && lat < 35) || (lat < -5 && lat > -35));
    const band = absLat > 66 ? 0.25 : absLat > 55 ? 0.5 : absLat > 35 ? 0.65 : absLat > 20 ? 0.55 : absLat > 5 ? 0.8 : 0.35;
    return clamp(Math.round(band * (isArid ? 0.45 : 1) * 100) / 100, 0.05, 0.95);
  }
  if (layer.theme === "atmosphere") {
    if (layer.id.includes("Carbon")) return clamp(Math.round(60 + Math.sin(lng * 0.12) * 10 + (absLat < 40 ? 18 : -12)), 30, 220);
    const dust = (lat > 8 && lat < 35 && lng > -20 && lng < 60) || (lat > 35 && lat < 45 && lng > 85 && lng < 120);
    return clamp(Math.round(((dust ? 0.6 : 0.13) + Math.sin(lat * 0.25) * 0.07) * 100) / 100, 0.02, 1.1);
  }
  if (layer.theme === "weather") {
    const itcz = Math.exp(-(lat * lat) / 250) * 3.2;
    return clamp(Math.round((itcz + (absLat > 35 && absLat < 60 ? 2 : 0.3)) * 10) / 10, 0, 12);
  }
  if (layer.theme === "ocean") {
    if (layer.id.includes("Chlorophyll")) {
      const productive = absLat > 35 ? 3.8 : absLat > 20 ? 1.5 : 0.8;
      return clamp(Math.round((productive + Math.sin(lng * 0.1) * 0.3) * 100) / 100, 0.01, 12);
    }
    return clamp(Math.round((28 - absLat * 0.45) * 10) / 10, -2, 32);
  }
  if (layer.theme === "cryosphere") {
    const cover = absLat > 65 ? 85 : absLat > 50 ? 35 : absLat > 40 ? 12 : absLat > 30 ? 3 : 0;
    return clamp(Math.round(cover + Math.sin(lng * 0.2) * 5), 0, 100);
  }
  if (layer.theme === "human") {
    return clamp(Math.round((8 + Math.abs(Math.sin(lat * 0.5 + lng * 0.3)) * 25) * 10) / 10, 0, 500);
  }
  return null;
}

export function formatMetricValue(value: number, unit: string): string {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${unit}`.trim();
}

export function estimateAreaMetrics(layers: MapLayer[], center: [number, number]): AreaMetric[] {
  const metrics: AreaMetric[] = [];
  for (const layer of layers) {
    const value = estimateLayerValue(layer, center);
    if (value === null) continue;
    metrics.push({
      layerId: layer.id,
      layerName: layer.name,
      label: getLayerMetricLabel(layer),
      value,
      unit: layer.unit ?? "",
      formatted: formatMetricValue(value, layer.unit ?? ""),
    });
  }
  return metrics;
}