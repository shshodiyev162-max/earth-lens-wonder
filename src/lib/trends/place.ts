// Where to scan: a named region, sea or ocean, a country (from the bundled outlines, no network),
// any other place found through OpenStreetMap search (with its real boundary when it has one), or
// the current map view when no place is chosen.

import { createSharedCache } from "../async";
import { findCountry, loadCountries, type Country, type CountryIndex } from "../geo/countries";
import { defaultRadiusKm, fetchBoundary, hasBoundary, nominatimSearch, searchPlaces, type PlaceResult } from "../geo/geocode";
import { bboxOf, bboxPolygon, centroidOf, circlePolygon, clampBBox, padBBox, type BBox, type LatLng, type PolygonGeometry } from "../geo/geometry";
import { findNamedRegion, normalizeName, regionBBox, regionGeometry } from "../geo/regions";
import { WHOLE_PACIFIC, type WaterKind } from "../geo/waters";

export { findNamedRegion, NAMED_REGIONS, type NamedRegion } from "../geo/regions";

export interface ScanArea {
  name: string;
  context?: string;
  geometry: PolygonGeometry;
  bbox: BBox;
  center: LatLng;
  kind: "region" | "country" | "place" | "view";
  /** The country's code, when the area is a whole country (for exact links to other pages). */
  countryId?: string;
  /** A named sea or ocean (its water only): land measures can't be read there. */
  water?: WaterKind;
  /** The named region, sea or ocean this is (for exact links to other pages). */
  region?: string;
}

export class AreaError extends Error {}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "USA",
  us: "USA",
  "u.s.": "USA",
  "united states": "USA",
  america: "USA",
  uk: "GBR",
  britain: "GBR",
  "great britain": "GBR",
  "united kingdom": "GBR",
  russia: "RUS",
  "russian federation": "RUS",
  drc: "COD",
  "dr congo": "COD",
  "congo kinshasa": "COD",
  "ivory coast": "CIV",
  "czech republic": "CZE",
  "south korea": "KOR",
  korea: "KOR",
  "north korea": "PRK",
  uae: "ARE",
  burma: "MMR",
  holland: "NLD",
  "the netherlands": "NLD",
  turkey: "TUR",
  turkiye: "TUR",
  "türkiye": "TUR",
  swaziland: "SWZ",
  "east timor": "TLS",
};

const normalize = normalizeName;

/** A country from the bundled outlines by name, alias or 3-letter code. */
export function matchCountry(index: CountryIndex, text: string): Country | null {
  const key = normalize(text);
  const alias = COUNTRY_ALIASES[key];
  if (alias) return findCountry(index, alias);
  if (/^[a-z]{3}$/.test(key)) {
    const byCode = findCountry(index, key);
    if (byCode) return byCode;
  }
  return index.countries.find((country) => normalize(country.name) === key) ?? null;
}

function area(name: string, context: string | undefined, geometry: PolygonGeometry, kind: ScanArea["kind"]): ScanArea {
  return { name, context, geometry, bbox: bboxOf(geometry), center: centroidOf(geometry), kind };
}

/** "near X": a box around the place, widened so its surroundings are included. */
export function widen(target: ScanArea): ScanArea {
  const bbox = clampBBox(padBBox(target.bbox, 0.6, 0.5));
  // A box around the place, no longer the country itself.
  return { ...target, name: `Around ${target.name}`, geometry: bboxPolygon(bbox), bbox, kind: target.kind === "country" ? "region" : target.kind, countryId: undefined, water: undefined, region: undefined };
}

export interface ResolveOptions {
  near?: boolean;
  /** The map view, used when no place is named. */
  view?: BBox;
  signal?: AbortSignal;
  countries?: CountryIndex | null;
  search?: (text: string, signal?: AbortSignal) => Promise<PlaceResult[]>;
  boundary?: (place: PlaceResult, signal?: AbortSignal) => Promise<PolygonGeometry | null>;
}

const defaultBoundary = (place: PlaceResult, signal?: AbortSignal) => (place.osm ? fetchBoundary(place.osm, { signal, kind: place.kind }) : Promise.resolve(null));

const AREA_RANK: Record<PlaceResult["kind"], number> = {
  country: 0,
  state: 1,
  region: 2,
  county: 3,
  water: 4,
  nature: 4,
  city: 5,
  district: 6,
  locality: 7,
  coordinates: 8,
  other: 9,
  poi: 10,
};

/**
 * Nominatim first: it knows administrative areas ("Bukhara region" → Buxoro Viloyati), while the
 * search-as-you-type service favours buildings and shops. Falls back to it when Nominatim is busy.
 */
async function defaultSearch(text: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  try {
    const found = await nominatimSearch(text, { signal, limit: 6 });
    if (found.length) return found;
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw error;
  }
  return searchPlaces(text, { signal, limit: 6 });
}

/** Resolves the chosen place into an area to scan. Throws AreaError with a friendly message. */
export async function resolveArea(text: string | null, options: ResolveOptions = {}): Promise<ScanArea> {
  const { near = false, view, signal } = options;
  if (!text) {
    if (!view) throw new AreaError("Name a place, or move the map to the area you want to scan.");
    const bbox = clampBBox(view);
    return { name: "Map view", geometry: bboxPolygon(bbox), bbox, center: [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2], kind: "view" };
  }

  const finish = (found: ScanArea) => (near ? widen(found) : found);
  const countries = options.countries === undefined ? await loadCountries() : options.countries;

  const region = findNamedRegion(text);
  if (region) {
    const geometry = await regionGeometry(region, countries);
    if (geometry) {
      // A sea keeps the extent of its outline, so its scans read the same map tiles whatever its exact shape.
      const bbox = regionBBox(region, countries) ?? bboxOf(geometry);
      return finish({ ...area(region.label, region.context, geometry, "region"), bbox, water: region.water, region: region.label });
    }
  }

  const country = countries ? matchCountry(countries, text) : null;
  if (country) return finish({ ...area(country.name, "Country", country.geometry, "country"), countryId: country.id });

  if (WHOLE_PACIFIC.test(normalize(text))) {
    throw new AreaError("The Pacific crosses the 180° line, so it can't be scanned as one area. Choose the western or the eastern Pacific, or draw a box on the map.");
  }

  // Found places are kept for the session, so showing a place and then scanning it asks only once.
  if (!options.search && !options.boundary) return finish(await foundPlaces(normalize(text), (inner) => findPlace(text, { signal: inner }), signal));
  return finish(await findPlace(text, options));
}

const foundPlaces = createSharedCache<ScanArea>();

/** A place from OpenStreetMap search, with its real boundary when it has one. */
async function findPlace(text: string, options: Pick<ResolveOptions, "search" | "boundary" | "signal">): Promise<ScanArea> {
  const { signal } = options;
  const search = options.search ?? defaultSearch;
  const results = (await search(text, signal)).filter((r) => r.kind !== "poi");
  if (!results.length) throw new AreaError(`Couldn't find “${text}” on the map. Try a country, a region or a city.`);
  // Areas are scanned, so administrative areas beat towns, and towns beat single buildings.
  const place = [...results].sort((a, b) => AREA_RANK[a.kind] - AREA_RANK[b.kind] || Number(hasBoundary(b)) - Number(hasBoundary(a)))[0];
  let geometry: PolygonGeometry | null = null;
  if (hasBoundary(place)) {
    try {
      geometry = await (options.boundary ?? defaultBoundary)(place, signal);
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") throw error;
    }
  }
  if (!geometry) geometry = place.bbox ? bboxPolygon(place.bbox) : circlePolygon(place.center, Math.max(25, defaultRadiusKm(place.kind)));
  return { name: place.name, context: place.context, geometry, bbox: bboxOf(geometry), center: place.center, kind: "place" };
}
