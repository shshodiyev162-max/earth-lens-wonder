// Weather stations: NOAA's Climate Data Online, global summary of the month (from GHCN), one of the
// resources NASA lists for trend detection. Air temperature and rainfall measured at the ground, a
// value a month, free and without a key. Used to check NASA's climate record for a place against
// what the nearest weather station measured.

import { withRetry } from "../async";
import { cachedValue, TTL } from "../cache/store";
import type { MonthlyValue } from "../analysis/stats";
import { haversineKm, type LatLng } from "../geo/geometry";

const SEARCH = "https://www.ncei.noaa.gov/access/services/search/v1/data";
const DATA = "https://www.ncei.noaa.gov/access/services/data/v1";
const DATASET = "global-summary-of-the-month";

/** How far a station may be from the place: a station further away measures somewhere else. */
export const STATION_RADIUS_KM = 75;
/** Stations whose records are read, nearest first. */
const MAX_STATIONS = 5;

export interface Station {
  /** GHCN station id, e.g. "UZM00038696". */
  id: string;
  /** "Bukhara, UZ" */
  name: string;
  center: LatLng;
  distanceKm: number;
}

export interface StationRecord {
  station: Station;
  /** Monthly mean air temperature, °C. */
  temperature: MonthlyValue[];
  /** Monthly rainfall total, mm. */
  rainfall: MonthlyValue[];
}

/** "BUHARA, UZ" → "Buhara, UZ": words in title case, the country code kept. */
export function stationName(raw: string): string {
  const [place, ...rest] = raw.split(",");
  const words = place
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'(/])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
  return [words, ...rest.map((part) => part.trim())].filter(Boolean).join(", ");
}

/** The search for stations within `radiusKm` of a point that have monthly temperature or rainfall in the years asked. */
export function stationSearchUrl(center: LatLng, radiusKm: number, startYear: number, endYear: number): string {
  const [lat, lon] = center;
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const north = Math.min(90, lat + dLat);
  const south = Math.max(-90, lat - dLat);
  const west = Math.max(-180, lon - dLon);
  const east = Math.min(180, lon + dLon);
  const params = new URLSearchParams({
    dataset: DATASET,
    // NOAA's order: north, west, south, east.
    bbox: [north, west, south, east].map((v) => v.toFixed(3)).join(","),
    dataTypes: "TAVG,PRCP",
    startDate: `${startYear}-01-01T00:00:00`,
    endDate: `${endYear}-12-31T23:59:59`,
    limit: "25",
  });
  return `${SEARCH}?${params}`;
}

interface SearchResponse {
  results?: {
    location?: { coordinates?: number[] };
    stations?: { id?: string; name?: string; dataTypes?: { id?: string }[] }[];
  }[];
}

/** Stations from a search, nearest first, within the radius and with temperature or rainfall. */
export function parseStationSearch(json: SearchResponse, center: LatLng, radiusKm = STATION_RADIUS_KM): Station[] {
  const seen = new Set<string>();
  const stations: Station[] = [];
  for (const result of json.results ?? []) {
    const coordinates = result.location?.coordinates;
    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) continue;
    const point: LatLng = [coordinates[1], coordinates[0]];
    for (const station of result.stations ?? []) {
      if (!station.id || seen.has(station.id)) continue;
      const types = new Set((station.dataTypes ?? []).map((type) => type.id));
      if (!types.has("TAVG") && !types.has("PRCP")) continue;
      const distanceKm = haversineKm(center, point);
      if (distanceKm > radiusKm) continue;
      seen.add(station.id);
      stations.push({ id: station.id, name: stationName(station.name ?? station.id), center: point, distanceKm });
    }
  }
  return stations.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** The request for the stations' monthly temperature and rainfall, in °C and mm. */
export function stationDataUrl(ids: string[], startYear: number, endYear: number): string {
  const params = new URLSearchParams({
    dataset: DATASET,
    stations: ids.join(","),
    startDate: `${startYear}-01-01`,
    endDate: `${endYear}-12-31`,
    dataTypes: "TAVG,PRCP",
    format: "json",
    units: "metric",
  });
  return `${DATA}?${params}`;
}

interface DataRow {
  DATE?: string;
  STATION?: string;
  TAVG?: string;
  PRCP?: string;
}

const reading = (text: string | undefined): number | null => {
  if (text === undefined || text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

/** Each station's months, in time order. */
export function parseStationData(rows: DataRow[]): Map<string, { temperature: MonthlyValue[]; rainfall: MonthlyValue[] }> {
  const out = new Map<string, { temperature: MonthlyValue[]; rainfall: MonthlyValue[] }>();
  for (const row of rows) {
    if (!row.STATION || !row.DATE || !/^\d{4}-\d{2}$/.test(row.DATE)) continue;
    const entry = out.get(row.STATION) ?? { temperature: [], rainfall: [] };
    entry.temperature.push({ month: row.DATE, value: reading(row.TAVG) });
    entry.rainfall.push({ month: row.DATE, value: reading(row.PRCP) });
    out.set(row.STATION, entry);
  }
  for (const entry of out.values()) {
    entry.temperature.sort((a, b) => a.month.localeCompare(b.month));
    entry.rainfall.sort((a, b) => a.month.localeCompare(b.month));
  }
  return out;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return withRetry(
    async () => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw Object.assign(new Error(`NOAA's station archive answered ${response.status}`), { status: response.status });
      return (await response.json()) as T;
    },
    { signal, retries: 2 },
  );
}

/**
 * The nearest stations' records for the years asked (up to five, nearest first). Kept on the device
 * for a week, so a second look at the same place asks NOAA nothing.
 */
export function nearbyStationRecords(center: LatLng, startYear: number, endYear: number, signal?: AbortSignal): Promise<StationRecord[]> {
  const key = `stations:${center[0].toFixed(2)},${center[1].toFixed(2)}|${startYear}-${endYear}`;
  return cachedValue(key, TTL.series, async () => {
    const stations = parseStationSearch(await getJson<SearchResponse>(stationSearchUrl(center, STATION_RADIUS_KM, startYear, endYear), signal), center).slice(0, MAX_STATIONS);
    if (!stations.length) return [];
    const data = parseStationData(await getJson<DataRow[]>(stationDataUrl(stations.map((s) => s.id), startYear, endYear), signal));
    return stations.flatMap((station) => {
      const record = data.get(station.id);
      return record ? [{ station, ...record }] : [];
    });
  });
}
