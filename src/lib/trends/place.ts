// Where to scan: a named region, a country (from the bundled outlines, no network), any other
// place found through OpenStreetMap search (with its real boundary when it has one), or the
// current map view when the question names no place.

import { findCountry, loadCountries, type Country, type CountryIndex } from "../geo/countries";
import { defaultRadiusKm, fetchBoundary, hasBoundary, nominatimSearch, searchPlaces, type PlaceResult } from "../geo/geocode";
import { bboxOf, bboxPolygon, centroidOf, circlePolygon, clampBBox, padBBox, type BBox, type LatLng, type PolygonGeometry } from "../geo/geometry";

export interface ScanArea {
  name: string;
  context?: string;
  geometry: PolygonGeometry;
  bbox: BBox;
  center: LatLng;
  kind: "region" | "country" | "place" | "view";
  /** The country's code, when the area is a whole country (for exact links to other pages). */
  countryId?: string;
}

export class AreaError extends Error {}

interface NamedRegion {
  names: string[];
  label: string;
  context: string;
  countries?: string[];
  bbox?: BBox;
}

/** Regions people search for that aren't single places in OpenStreetMap. */
export const NAMED_REGIONS: NamedRegion[] = [
  { names: ["central asia"], label: "Central Asia", context: "Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Uzbekistan", countries: ["KAZ", "KGZ", "TJK", "TKM", "UZB"] },
  { names: ["pamirs", "pamir", "pamir mountains", "the pamirs"], label: "Pamirs", context: "Tajikistan, Afghanistan, China, Kyrgyzstan", bbox: [70.5, 36.6, 75.4, 39.7] },
  { names: ["aral sea", "the aral sea", "aral"], label: "Aral Sea", context: "Kazakhstan / Uzbekistan", bbox: [57.8, 43.3, 62.0, 47.2] },
  { names: ["fergana valley", "ferghana valley", "fergana"], label: "Fergana Valley", context: "Uzbekistan, Kyrgyzstan, Tajikistan", bbox: [70.3, 40.0, 73.6, 41.6] },
  { names: ["kyzylkum", "kyzylkum desert", "kyzyl kum", "kyzyl-kum"], label: "Kyzylkum Desert", context: "Uzbekistan / Kazakhstan", bbox: [60.5, 40.0, 66.8, 44.2] },
  { names: ["karakum", "karakum desert", "kara kum", "garagum"], label: "Karakum Desert", context: "Turkmenistan", bbox: [54.5, 36.5, 65.0, 41.8] },
  { names: ["sahel", "the sahel"], label: "Sahel", context: "Africa", bbox: [-17.5, 10.5, 38.5, 20.5] },
  { names: ["amazon", "amazon basin", "amazon rainforest", "amazonia"], label: "Amazon", context: "South America", bbox: [-79.5, -17.5, -45.5, 5.5] },
  { names: ["himalayas", "himalaya", "the himalayas"], label: "Himalayas", context: "Asia", bbox: [72.5, 26.5, 95.5, 36.5] },
  { names: ["tibetan plateau", "tibet plateau", "qinghai-tibet plateau"], label: "Tibetan Plateau", context: "China", bbox: [78.0, 27.5, 103.0, 39.5] },
  { names: ["middle east", "the middle east"], label: "Middle East", context: "Western Asia", countries: ["IRQ", "IRN", "SYR", "JOR", "ISR", "LBN", "SAU", "YEM", "OMN", "ARE", "QAT", "BHR", "KWT"] },
  { names: ["horn of africa"], label: "Horn of Africa", context: "East Africa", countries: ["ETH", "SOM", "SOL", "DJI", "ERI"] },
  { names: ["east africa", "eastern africa"], label: "East Africa", context: "Africa", countries: ["KEN", "TZA", "UGA", "ETH", "SOM", "SOL", "RWA", "BDI", "SDS", "ERI", "DJI"] },
  { names: ["alps", "the alps"], label: "Alps", context: "Europe", bbox: [5.0, 43.6, 16.5, 48.4] },
];

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

const normalize = (text: string) => text.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

export function findNamedRegion(text: string): NamedRegion | null {
  const key = normalize(text);
  return NAMED_REGIONS.find((region) => region.names.some((name) => normalize(name) === key)) ?? null;
}

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

function merge(geometries: PolygonGeometry[]): PolygonGeometry {
  const polygons = geometries.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

function area(name: string, context: string | undefined, geometry: PolygonGeometry, kind: ScanArea["kind"]): ScanArea {
  return { name, context, geometry, bbox: bboxOf(geometry), center: centroidOf(geometry), kind };
}

/** "near X": a box around the place, widened so its surroundings are included. */
export function widen(target: ScanArea): ScanArea {
  const bbox = clampBBox(padBBox(target.bbox, 0.6, 0.5));
  // A box around the place, no longer the country itself.
  return { ...target, name: `Around ${target.name}`, geometry: bboxPolygon(bbox), bbox, kind: target.kind === "country" ? "region" : target.kind, countryId: undefined };
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

/** Resolves the place part of a question into an area to scan. Throws AreaError with a friendly message. */
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
    if (region.bbox) return finish(area(region.label, region.context, bboxPolygon(region.bbox), "region"));
    const members = (region.countries ?? []).map((id) => (countries ? findCountry(countries, id) : null)).filter((c): c is Country => Boolean(c));
    if (members.length) return finish(area(region.label, region.context, merge(members.map((c) => c.geometry)), "region"));
  }

  const country = countries ? matchCountry(countries, text) : null;
  if (country) return finish({ ...area(country.name, "Country", country.geometry, "country"), countryId: country.id });

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
  return finish({ name: place.name, context: place.context, geometry, bbox: bboxOf(geometry), center: place.center, kind: "place" });
}
