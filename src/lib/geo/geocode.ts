// Place search. Typing uses Photon (komoot, OpenStreetMap data), which is built
// for search-as-you-type. Explicit searches, boundaries and reverse lookups use
// Nominatim, throttled to its 1 request/second usage policy.

import { isPolygonGeometry, type BBox, type LatLng, type PolygonGeometry } from "./geometry";
import { countryAlias, matchCountry } from "./countryNames";
import { loadCountries } from "./countries";
import { findNamedRegion, normalizeName, regionPlace, searchNamedRegions } from "./regions";
import { readCache, TTL, writeCache } from "../cache/store";

export type PlaceKind =
  | "coordinates"
  | "country"
  | "state"
  | "region"
  | "county"
  | "city"
  | "district"
  | "locality"
  | "water"
  | "nature"
  | "poi"
  | "other";

export interface PlaceResult {
  id: string;
  name: string;
  /** Secondary line, e.g. "Bukhara Region, Uzbekistan". */
  context: string;
  kind: PlaceKind;
  /** A closer word for what it is than the kind ("Village", "Lake", "Airport"), when known. */
  typeLabel?: string;
  center: LatLng;
  bbox?: BBox;
  osm?: { type: "N" | "W" | "R"; id: number };
  /** A named region, sea or ocean TerraScope knows the shape of (see lib/geo/regions). */
  region?: string;
  /** A country's code in TerraScope's own outlines (its land, without the sea OpenStreetMap includes). */
  country?: string;
  source: "photon" | "nominatim" | "coordinates" | "terrascope";
}

const PHOTON_URL = "https://photon.komoot.io/api/";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

// ---------------------------------------------------------------------------
// Coordinates

const DECIMAL = String.raw`[-+]?\d{1,3}(?:[.,]\d+)?`;

function parseHemisphere(value: string, hemisphere?: string): number {
  const number = parseFloat(value.replace(",", "."));
  if (!hemisphere) return number;
  return /[SW]/i.test(hemisphere) ? -Math.abs(number) : Math.abs(number);
}

// Degrees, minutes and seconds: 39°46'30"N 64°25'E, N39°46.5' E64°25', -33°55', 18°25'.
const DMS_NUMBER = String.raw`([-+]?\d{1,3}(?:[.,]\d+)?)\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*["″”]\s*)?`;
/** Hemisphere letters after the numbers (or none). */
const DMS_AFTER = new RegExp(String.raw`^${DMS_NUMBER}([NSEW])?\s*[,;]?\s*${DMS_NUMBER}([NSEW])?$`, "i");
/** Hemisphere letters before the numbers. */
const DMS_BEFORE = new RegExp(String.raw`^([NSEW])\s*${DMS_NUMBER}[,;]?\s*([NSEW])\s*${DMS_NUMBER}$`, "i");

interface DmsValue {
  value: number;
  hemisphere?: string;
}

function dmsValue(degrees: string, minutes?: string, seconds?: string, letter?: string): DmsValue | null {
  const number = (text?: string) => (text ? parseFloat(text.replace(",", ".")) : 0);
  const [d, m, s] = [number(degrees), number(minutes), number(seconds)];
  if (m >= 60 || s >= 60) return null;
  const size = Math.abs(d) + m / 60 + s / 3600;
  const hemisphere = letter?.toUpperCase();
  const negative = hemisphere ? /[SW]/.test(hemisphere) : degrees.trim().startsWith("-");
  return { value: negative ? -size : size, hemisphere };
}

function parseDms(text: string): { lat: number; lon: number } | null {
  const after = text.match(DMS_AFTER);
  const before = after ? null : text.match(DMS_BEFORE);
  let a: DmsValue | null = null;
  let b: DmsValue | null = null;
  if (after) {
    a = dmsValue(after[1], after[2], after[3], after[4]);
    b = dmsValue(after[5], after[6], after[7], after[8]);
  } else if (before) {
    a = dmsValue(before[2], before[3], before[4], before[1]);
    b = dmsValue(before[6], before[7], before[8], before[5]);
  }
  if (!a || !b) return null;
  const aIsLat = a.hemisphere ? /[NS]/.test(a.hemisphere) : b.hemisphere ? /[EW]/.test(b.hemisphere) : true;
  const bIsLat = b.hemisphere ? /[NS]/.test(b.hemisphere) : !aIsLat;
  if (aIsLat === bIsLat) return null;
  return aIsLat ? { lat: a.value, lon: b.value } : { lat: b.value, lon: a.value };
}

/**
 * Accepts "39.77, 64.42", "39.77 64.42", "39.77N 64.42E", "64.42E 39.77N", "lat: 39.77 lon: 64.42"
 * and degrees with minutes and seconds ("39°46'30"N 64°25'E"). Returns null when the text is not a
 * coordinate pair.
 */
export function parseCoordinates(input: string): PlaceResult | null {
  const raw = input.trim().replace(/\s+/g, " ");
  const text = raw.replace(/[()°]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const dms = /°/.test(raw) ? parseDms(raw.replace(/[()]/g, "").trim()) : null;
  const labelled = text.match(new RegExp(String.raw`^lat(?:itude)?\s*[:=]?\s*(${DECIMAL})[\s,;]+lo?ng?(?:itude)?\s*[:=]?\s*(${DECIMAL})$`, "i"));
  const hemi = text.match(new RegExp(String.raw`^(${DECIMAL})\s*([NSEW])[\s,;]+(${DECIMAL})\s*([NSEW])$`, "i"));
  const plain = text.match(new RegExp(String.raw`^(${DECIMAL})\s*[,;\s]\s*(${DECIMAL})$`));

  let lat: number | null = null;
  let lon: number | null = null;

  if (dms) {
    ({ lat, lon } = dms);
  } else if (labelled) {
    lat = parseFloat(labelled[1].replace(",", "."));
    lon = parseFloat(labelled[2].replace(",", "."));
  } else if (hemi) {
    const a = parseHemisphere(hemi[1], hemi[2]);
    const b = parseHemisphere(hemi[3], hemi[4]);
    const aIsLat = /[NS]/i.test(hemi[2]);
    const bIsLat = /[NS]/i.test(hemi[4]);
    if (aIsLat === bIsLat) return null;
    lat = aIsLat ? a : b;
    lon = aIsLat ? b : a;
  } else if (plain) {
    // "39,77 64,42" (comma decimals) is ambiguous with "39,77" → only accept dots or a clear separator.
    lat = parseFloat(plain[1].replace(",", "."));
    lon = parseFloat(plain[2].replace(",", "."));
  }

  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return {
    id: `coords:${lat.toFixed(5)},${lon.toFixed(5)}`,
    name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    context: "Coordinates",
    kind: "coordinates",
    center: [lat, lon],
    source: "coordinates",
  };
}

// ---------------------------------------------------------------------------
// Photon (search as you type)

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: "N" | "W" | "R";
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    extent?: [number, number, number, number]; // [minLon, maxLat, maxLon, minLat]
  };
}

// Large geographic features (the Sahara, the Himalayas, an island) that are not
// administrative areas. They are often mapped as a single point, so they need
// a wide zoom and a wide analysis radius.
const REGION_PLACES = /^(region|island|archipelago|peninsula|continent)$/;
const REGION_NATURE = /^(desert|mountain_range|peninsula|plateau|massif|steppe|plain)$/;
const WATER_PLACES = /^(sea|ocean)$/;

const TOWNS = /^(city|town)$/;
const VILLAGES = /^(village|hamlet|isolated_dwelling|farm)$/;
const NEIGHBOURHOODS = /^(suburb|quarter|neighbourhood|borough)$/;

/** What a place is, in a word, from its OpenStreetMap tag (place=village → "Village"). */
const TYPE_LABELS: Record<string, string> = {
  town: "Town",
  village: "Village",
  hamlet: "Hamlet",
  isolated_dwelling: "Hamlet",
  farm: "Farm",
  suburb: "Neighbourhood",
  quarter: "Neighbourhood",
  neighbourhood: "Neighbourhood",
  borough: "Borough",
  island: "Island",
  islet: "Island",
  archipelago: "Islands",
  peninsula: "Peninsula",
  sea: "Sea",
  ocean: "Ocean",
  bay: "Bay",
  strait: "Strait",
  lake: "Lake",
  lagoon: "Lagoon",
  reservoir: "Reservoir",
  pond: "Pond",
  river: "River",
  stream: "Stream",
  canal: "Canal",
  desert: "Desert",
  mountain_range: "Mountains",
  massif: "Mountains",
  peak: "Mountain",
  volcano: "Volcano",
  glacier: "Glacier",
  plateau: "Plateau",
  valley: "Valley",
  steppe: "Steppe",
  plain: "Plain",
  wetland: "Wetland",
  wood: "Forest",
  forest: "Forest",
  beach: "Beach",
  cape: "Cape",
  national_park: "National park",
  protected_area: "Protected area",
  nature_reserve: "Nature reserve",
  aerodrome: "Airport",
};

function typeLabel(value: string | undefined): string | undefined {
  return value ? TYPE_LABELS[value] : undefined;
}

function photonKind(props: PhotonFeature["properties"]): PlaceKind {
  const type = props.type ?? "";
  const key = props.osm_key ?? "";
  const value = props.osm_value ?? "";
  if (type === "country") return "country";
  if (type === "state") return "state";
  // Photon files villages under "city" (the level of the address), so the tag decides.
  if (key === "place" && TOWNS.test(value)) return "city";
  if (key === "place" && VILLAGES.test(value)) return "locality";
  if (key === "place" && NEIGHBOURHOODS.test(value)) return "district";
  if (type === "county") return "county";
  if (type === "city") return "city";
  if (type === "district") return "district";
  if (type === "locality") return "locality";
  if (key === "place" && WATER_PLACES.test(value)) return "water";
  if (key === "place" && REGION_PLACES.test(value)) return "region";
  if (key === "natural" && REGION_NATURE.test(value)) return "region";
  if (key === "natural" && /water|bay|strait/.test(value)) return "water";
  if (key === "waterway" || key === "water") return "water";
  // Time zones and postcode areas are lines on a map, not places.
  if (key === "boundary" && /^(timezone|postal_code)$/.test(value)) return "poi";
  if (key === "natural" || key === "boundary" || /protected_area|national_park|forest|nature_reserve/.test(value)) return "nature";
  if (key === "place") return "locality";
  if (type === "house" || type === "street") return "poi";
  return "other";
}

// Lakes, rivers, forests and parks matter as much as towns here: they are what changes.
const KIND_RANK: Record<PlaceKind, number> = {
  coordinates: 0,
  country: 1,
  state: 2,
  region: 2,
  city: 3,
  water: 3,
  county: 4,
  nature: 4,
  district: 5,
  locality: 6,
  other: 8,
  poi: 10,
};

function joinContext(parts: (string | undefined)[], name?: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === name || seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(", ");
}

export function normalizePhotonFeature(feature: PhotonFeature): PlaceResult | null {
  const props = feature.properties ?? {};
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const kind = photonKind(props);
  const name = props.name ?? ([props.street, props.housenumber].filter(Boolean).join(" ") || props.city || props.state || props.country);
  if (!name) return null;
  const context = joinContext([props.district, props.city, props.county, props.state, props.country], name);
  const extent = props.extent;
  const bbox: BBox | undefined = extent ? [Math.min(extent[0], extent[2]), Math.min(extent[1], extent[3]), Math.max(extent[0], extent[2]), Math.max(extent[1], extent[3])] : undefined;
  const label = props.osm_key === "boundary" && props.osm_value === "administrative" ? undefined : typeLabel(props.osm_value);
  return {
    id: props.osm_type && props.osm_id ? `${props.osm_type}${props.osm_id}` : `photon:${lat},${lon}`,
    name,
    context,
    kind,
    ...(label ? { typeLabel: label } : {}),
    center: [lat, lon],
    bbox,
    osm: props.osm_type && props.osm_id ? { type: props.osm_type, id: props.osm_id } : undefined,
    source: "photon",
  };
}

export async function photonSearch(
  query: string,
  options: { signal?: AbortSignal; limit?: number; near?: LatLng } = {},
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(options.limit ?? 8), lang: "en" });
  if (options.near) {
    params.set("lat", options.near[0].toFixed(3));
    params.set("lon", options.near[1].toFixed(3));
    params.set("location_bias_scale", "0.2");
  }
  const response = await fetch(`${PHOTON_URL}?${params}`, { signal: options.signal });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  const data = (await response.json()) as { features?: PhotonFeature[] };
  const results = (data.features ?? []).map(normalizePhotonFeature).filter((r): r is PlaceResult => r !== null);
  return dedupe(results);
}

function dedupe(results: PlaceResult[]): PlaceResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.osm ? `${result.osm.type}${result.osm.id}` : `${result.name}|${result.context}|${result.kind}`;
    const nameKey = `${result.name.toLowerCase()}|${result.context.toLowerCase()}|${result.kind}`;
    if (seen.has(key) || seen.has(nameKey)) return false;
    seen.add(key);
    seen.add(nameKey);
    return true;
  });
}

/**
 * Gentle re-ranking: a place named exactly what was typed first ("Dead Sea" before "Dead Sea
 * Industries"), then countries, regions, towns and lakes before villages, and those before shops.
 */
export function rankResults(results: PlaceResult[], query = ""): PlaceResult[] {
  const key = normalizeName(query);
  const exact = (result: PlaceResult) => Boolean(key) && normalizeName(result.name) === key;
  return results
    .map((result, index) => ({ result, score: index + KIND_RANK[result.kind] * 0.6 - (exact(result) ? 2.5 : 0) }))
    .sort((a, b) => a.score - b.score)
    .map((item) => item.result);
}

// ---------------------------------------------------------------------------
// Nominatim (explicit search, boundaries, reverse)

let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimCall = 0;

/** Serialises Nominatim calls to at most one per second (usage policy). */
function throttledNominatim<T>(run: () => Promise<T>): Promise<T> {
  const next = nominatimQueue.then(async () => {
    const wait = Math.max(0, lastNominatimCall + 1050 - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimCall = Date.now();
    return run();
  });
  nominatimQueue = next.catch(() => undefined);
  return next;
}

interface NominatimPlace {
  osm_type?: "node" | "way" | "relation";
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  addresstype?: string;
  category?: string;
  type?: string;
  boundingbox?: [string, string, string, string]; // [south, north, west, east]
  geojson?: unknown;
}

function nominatimKind(place: NominatimPlace): PlaceKind {
  const type = place.addresstype ?? place.type ?? "";
  const category = place.category ?? "";
  const value = place.type ?? "";
  if (type === "country") return "country";
  if (type === "state" || type === "province") return "state";
  if (type === "region") return category === "boundary" ? "state" : "region";
  if (type === "county") return "county";
  if (type === "city" || type === "town") return "city";
  if (type === "village" || type === "hamlet" || type === "suburb") return "locality";
  if (category === "place" && WATER_PLACES.test(value)) return "water";
  if (category === "place" && REGION_PLACES.test(value)) return "region";
  if (category === "natural" && REGION_NATURE.test(value)) return "region";
  if (category === "natural" && /water|bay|strait/.test(value)) return "water";
  if (category === "waterway" || category === "water") return "water";
  if (category === "natural" || category === "boundary" || category === "leisure") return "nature";
  return "other";
}

const OSM_TYPE: Record<string, "N" | "W" | "R"> = { node: "N", way: "W", relation: "R" };

function normalizeNominatim(place: NominatimPlace): PlaceResult | null {
  const lat = parseFloat(place.lat);
  const lon = parseFloat(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const parts = (place.display_name ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const name = place.name || parts[0] || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const context = joinContext(parts.slice(1).filter((p) => !/^\d{3,}/.test(p)).slice(-3), name);
  const bb = place.boundingbox?.map(Number);
  const bbox: BBox | undefined = bb && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : undefined;
  const osmType = place.osm_type ? OSM_TYPE[place.osm_type] : undefined;
  const address = place.addresstype ?? "";
  const label = /^(town|village|hamlet)$/.test(address) ? typeLabel(address) : place.category === "boundary" && place.type === "administrative" ? undefined : typeLabel(place.type);
  return {
    id: osmType && place.osm_id ? `${osmType}${place.osm_id}` : `nominatim:${lat},${lon}`,
    name,
    context,
    kind: nominatimKind(place),
    ...(label ? { typeLabel: label } : {}),
    center: [lat, lon],
    bbox,
    osm: osmType && place.osm_id ? { type: osmType, id: place.osm_id } : undefined,
    source: "nominatim",
  };
}

export function nominatimSearch(query: string, options: { signal?: AbortSignal; limit?: number } = {}): Promise<PlaceResult[]> {
  return throttledNominatim(async () => {
    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: String(options.limit ?? 8), "accept-language": "en" });
    const response = await fetch(`${NOMINATIM_URL}/search?${params}`, { signal: options.signal });
    if (!response.ok) throw new Error(`Place search failed (${response.status})`);
    const data = (await response.json()) as NominatimPlace[];
    return dedupe(data.map(normalizeNominatim).filter((r): r is PlaceResult => r !== null));
  });
}

const boundaryCache = new Map<string, PolygonGeometry | null>();

/** Administrative or natural boundary polygon for an OSM way/relation, simplified. */
export function fetchBoundary(
  osm: { type: "N" | "W" | "R"; id: number },
  options: { signal?: AbortSignal; kind?: PlaceKind } = {},
): Promise<PolygonGeometry | null> {
  if (osm.type === "N") return Promise.resolve(null);
  const key = `${osm.type}${osm.id}`;
  if (boundaryCache.has(key)) return Promise.resolve(boundaryCache.get(key) ?? null);
  const threshold = options.kind === "country" || options.kind === "region" ? "0.01" : options.kind === "state" ? "0.005" : "0.001";
  return throttledNominatim(async () => {
    const params = new URLSearchParams({ osm_ids: key, format: "jsonv2", polygon_geojson: "1", polygon_threshold: threshold });
    const response = await fetch(`${NOMINATIM_URL}/lookup?${params}`, { signal: options.signal });
    if (!response.ok) throw new Error(`Boundary lookup failed (${response.status})`);
    const data = (await response.json()) as NominatimPlace[];
    const geometry = data[0]?.geojson;
    const result = isPolygonGeometry(geometry) ? geometry : null;
    boundaryCache.set(key, result);
    return result;
  });
}

export interface OsmPlaceDetails {
  place: PlaceResult;
  geometry: PolygonGeometry | null;
}

/** Full details for an OSM id like "R13070474": name, centre, bbox and boundary. */
export function lookupOsm(osmId: string, options: { signal?: AbortSignal } = {}): Promise<OsmPlaceDetails | null> {
  const match = osmId.match(/^([NWR])(\d+)$/);
  if (!match) return Promise.resolve(null);
  return throttledNominatim(async () => {
    const params = new URLSearchParams({
      osm_ids: osmId,
      format: "jsonv2",
      polygon_geojson: "1",
      polygon_threshold: "0.005",
      "accept-language": "en",
    });
    const response = await fetch(`${NOMINATIM_URL}/lookup?${params}`, { signal: options.signal });
    if (!response.ok) throw new Error(`Place lookup failed (${response.status})`);
    const data = (await response.json()) as NominatimPlace[];
    if (!data[0]) return null;
    const place = normalizeNominatim(data[0]);
    if (!place) return null;
    const geometry = isPolygonGeometry(data[0].geojson) ? data[0].geojson : null;
    if (geometry) boundaryCache.set(osmId, geometry);
    return { place, geometry };
  });
}

export async function reverseGeocode(center: LatLng, options: { signal?: AbortSignal; zoom?: number } = {}): Promise<string | null> {
  const key = `place:${center[0].toFixed(3)},${center[1].toFixed(3)}|${options.zoom ?? 10}`;
  const known = await readCache<string>(key);
  if (known) return known;
  const name = await reverseGeocodeLive(center, options);
  if (name) void writeCache(key, name, TTL.place);
  return name;
}

function reverseGeocodeLive(center: LatLng, options: { signal?: AbortSignal; zoom?: number }): Promise<string | null> {
  return throttledNominatim(async () => {
    const params = new URLSearchParams({
      lat: center[0].toFixed(5),
      lon: center[1].toFixed(5),
      format: "jsonv2",
      zoom: String(options.zoom ?? 10),
      "accept-language": "en",
    });
    const response = await fetch(`${NOMINATIM_URL}/reverse?${params}`, { signal: options.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as NominatimPlace & { error?: string; address?: Record<string, string> };
    if (data.error) return null;
    const address = data.address ?? {};
    const local = data.name || address.city || address.town || address.village || address.county || address.state;
    const country = address.country;
    return [local, country].filter(Boolean).join(", ") || data.display_name || null;
  });
}

// ---------------------------------------------------------------------------
// Public helpers

const ADMIN_KINDS: PlaceKind[] = ["country", "state", "county", "city", "district"];
/** An island, a landmass or its nature area: the same land as a country of that name. */
const LANDMASS_KINDS: PlaceKind[] = ["region", "nature", "other"];

/**
 * TerraScope's own regions first, then what OpenStreetMap found, without repeats:
 * - OpenStreetMap's copy of a region TerraScope knows ("Aral Sea" as a point) is left out, unless
 *   it is a town or an administrative area of that name;
 * - so is an island or a landmass named like a country found with it (Greenland);
 * - shops, buildings and streets are kept only when nothing else is found.
 * A country or state named exactly what was typed ("Congo") comes before regions that only start
 * with it (Congo Basin).
 */
export function mergePlaceResults(query: string, known: PlaceResult[], found: PlaceResult[]): PlaceResult[] {
  const key = normalizeName(query);
  const exactRegion = findNamedRegion(query)?.label;
  const regionNames = new Set(known.map((p) => normalizeName(p.name)));
  const countryNames = new Set(found.filter((p) => p.kind === "country").map((p) => normalizeName(p.name)));
  const kept = found.filter((p) => {
    const name = normalizeName(p.name);
    const admin = ADMIN_KINDS.includes(p.kind) && hasBoundary(p);
    if (regionNames.has(name) && !admin) return false;
    if (countryNames.has(name) && LANDMASS_KINDS.includes(p.kind)) return false;
    return true;
  });
  const places = kept.filter((p) => p.kind !== "poi");
  const rest = places.length || known.length ? places : kept;
  const named = rest.filter((p) => (p.kind === "country" || p.kind === "state") && normalizeName(p.name) === key);
  const first = known.filter((p) => p.name === exactRegion);
  return dedupe([...first, ...named, ...known, ...rest]);
}

/**
 * Search-as-you-type: coordinates first; then the seas, oceans and regions TerraScope knows the
 * shape of (OpenStreetMap only has a point for "Mediterranean Sea"); then Photon, with Nominatim
 * as fallback. A short country name ("USA", "UK") also looks for the country by its full name.
 */
export async function searchPlaces(
  query: string,
  options: { signal?: AbortSignal; near?: LatLng; limit?: number } = {},
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const coords = parseCoordinates(trimmed);
  if (coords) return [coords];
  const known = (await Promise.all(searchNamedRegions(trimmed).map(regionPlace))).filter((p): p is PlaceResult => p !== null);
  const alias = countryAlias(trimmed);
  const fullName = alias && normalizeName(alias.name) !== normalizeName(trimmed) && !findNamedRegion(trimmed) ? alias.name : null;
  let found: PlaceResult[];
  try {
    const [direct, country] = await Promise.all([
      photonSearch(trimmed, options),
      fullName ? photonSearch(fullName, { signal: options.signal, limit: 3 }).then((r) => r.filter((p) => p.kind === "country").slice(0, 1)) : Promise.resolve([]),
    ]);
    found = [...country, ...rankResults(direct, trimmed)];
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") throw error;
    found = known.length ? [] : await nominatimSearch(fullName ?? trimmed, options);
  }
  return withCountryCodes(mergePlaceResults(trimmed, known, found));
}

/**
 * Countries found by search are read from TerraScope's own outlines, like a country clicked on the
 * map: their land, the same everywhere, and nothing more to download. OpenStreetMap's boundary also
 * takes in the sea along the coast.
 */
export async function withCountryCodes(results: PlaceResult[]): Promise<PlaceResult[]> {
  if (!results.some((place) => place.kind === "country" && !place.country)) return results;
  const index = await loadCountries();
  if (!index) return results;
  return results.map((place) => {
    if (place.kind !== "country" || place.country) return place;
    const country = matchCountry(index, place.name);
    return country ? { ...place, country: country.id } : place;
  });
}

/** Sensible zoom when a result has no bounding box. */
export function zoomForKind(kind: PlaceKind): number {
  switch (kind) {
    case "country":
    case "region":
      return 5;
    case "state":
      return 7;
    case "county":
      return 9;
    case "city":
      return 11;
    case "district":
    case "locality":
      return 12;
    case "coordinates":
      return 10;
    default:
      return 11;
  }
}

export function kindLabel(kind: PlaceKind): string {
  switch (kind) {
    case "coordinates":
      return "Coordinates";
    case "country":
      return "Country";
    case "state":
      return "State / province";
    case "region":
      return "Region";
    case "county":
      return "County";
    case "city":
      return "City";
    case "district":
      return "District";
    case "locality":
      return "Place";
    case "water":
      return "Water";
    case "nature":
      return "Nature";
    case "poi":
      return "Point of interest";
    default:
      return "Place";
  }
}

/** What a found place is, in a word: "Village", "Lake", "Airport", or else its kind ("City"). */
export function placeTypeLabel(place: Pick<PlaceResult, "kind" | "typeLabel">): string {
  return place.typeLabel ?? kindLabel(place.kind);
}

/** Whether a place represents an area whose boundary is worth loading (named regions and seas always). */
export function hasBoundary(place: PlaceResult): boolean {
  if (place.region || place.country) return true;
  return Boolean(place.osm && place.osm.type !== "N" && ["country", "state", "region", "county", "city", "district", "nature", "water", "locality"].includes(place.kind));
}

/** Analysis radius for a place that has no boundary polygon (only a point). */
export function defaultRadiusKm(kind: PlaceKind): number {
  switch (kind) {
    case "country":
    case "state":
    case "region":
      return 50;
    case "county":
      return 25;
    default:
      return 10;
  }
}
