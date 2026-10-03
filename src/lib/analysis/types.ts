import type { BBox, LatLng, PolygonGeometry } from "../geo/geometry";

export type DatasetId = "vegetation" | "surfaceHeat" | "climate" | "air" | "snow";

export interface DatasetInfo {
  id: DatasetId;
  label: string;
  description: string;
  source: string;
  /** GIBS layer decoded for satellite datasets. */
  layerId?: string;
  unit: string;
  decimals: number;
  color: string;
}

export type TargetRef =
  | { type: "osm"; osm: string }
  | { type: "country"; id: string }
  | { type: "point"; lat: number; lon: number; radiusKm: number }
  | { type: "area"; id: string }
  | { type: "bbox"; bbox: BBox };

export interface AnalysisTarget {
  name: string;
  context?: string;
  geometry: PolygonGeometry;
  bbox: BBox;
  center: LatLng;
  areaKm2: number;
  kind: "place" | "drawn" | "point";
  ref: TargetRef;
}

export interface AnalysisRequest {
  target: AnalysisTarget;
  /** YYYY-MM inclusive */
  start: string;
  end: string;
  datasets: DatasetId[];
}

export interface SatellitePoint {
  month: string;
  value: number | null;
  p10: number | null;
  p90: number | null;
  /** Share (0–1) of the area with a valid measurement that month. */
  coverage: number;
}

export interface SatelliteSeries {
  dataset: DatasetId;
  layerId: string;
  label: string;
  unit: string;
  decimals: number;
  source: string;
  points: SatellitePoint[];
  /** Latest month the product has been published for (YYYY-MM). */
  latestAvailable: string | null;
  status: "ok" | "empty" | "error";
  error?: string;
}

export interface ClimatePoint {
  month: string;
  temp: number | null;
  tempMax: number | null;
  tempMin: number | null;
  tempNormal: number | null;
  tempAnomaly: number | null;
  /** Monthly total, mm */
  precip: number | null;
  precipNormal: number | null;
  /** kWh/m²/day */
  solar: number | null;
  solarNormal: number | null;
  humidity: number | null;
  wind: number | null;
  /** Root-zone soil wetness, % */
  soil: number | null;
  soilNormal: number | null;
}

export interface ClimateSeries {
  status: "ok" | "empty" | "error";
  error?: string;
  points: ClimatePoint[];
  samplePoints: LatLng[];
}

export interface AnalysisResult {
  target: AnalysisTarget;
  start: string;
  end: string;
  datasets: DatasetId[];
  generatedAt: string;
  satellite: Partial<Record<Exclude<DatasetId, "climate">, SatelliteSeries>>;
  climate?: ClimateSeries;
}

export interface AnalysisProgress {
  done: number;
  total: number;
  label: string;
}
