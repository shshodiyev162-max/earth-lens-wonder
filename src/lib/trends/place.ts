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
  /** A rough outline (longitude, latitude) when a box would take in other seas. */
  outline?: [number, number][];
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
  // Seas and oceans: place search returns them as a single point, so their extent is kept here.
  {
    names: ["mediterranean", "mediterranean sea", "the mediterranean"],
    label: "Mediterranean Sea",
    context: "Sea",
    // From the Strait of Gibraltar to the Dardanelles: leaves out the Bay of Biscay and the Black Sea.
    outline: [
      [-5.8, 35.0],
      [-5.8, 36.6],
      [-1.5, 39.5],
      [3.0, 43.6],
      [8.5, 44.6],
      [12.6, 45.9],
      [14.5, 45.9],
      [19.7, 42.0],
      [22.8, 40.8],
      [26.6, 41.0],
      [26.9, 40.3],
      [29.0, 41.1],
      [29.5, 40.6],
      [27.2, 39.8],
      [36.4, 37.0],
      [36.4, 31.0],
      [30.0, 30.6],
      [19.5, 29.9],
      [10.0, 33.0],
      [9.5, 37.4],
      [-1.0, 35.0],
      [-5.8, 35.0],
    ],
  },
  { names: ["black sea"], label: "Black Sea", context: "Sea", bbox: [27.2, 40.6, 41.9, 47.0] },
  { names: ["caspian sea", "caspian"], label: "Caspian Sea", context: "Sea", bbox: [46.5, 36.5, 55.0, 47.3] },
  { names: ["red sea"], label: "Red Sea", context: "Sea", bbox: [32.3, 12.4, 43.6, 30.0] },
  { names: ["persian gulf", "arabian gulf", "the gulf"], label: "Persian Gulf", context: "Sea", bbox: [47.7, 23.8, 56.6, 30.5] },
  { names: ["arabian sea"], label: "Arabian Sea", context: "Sea", bbox: [51.0, 5.0, 77.0, 25.5] },
  { names: ["bay of bengal"], label: "Bay of Bengal", context: "Sea", bbox: [79.5, 5.0, 99.0, 23.0] },
  { names: ["south china sea"], label: "South China Sea", context: "Sea", bbox: [99.0, 0.0, 121.5, 24.0] },
  { names: ["sea of japan", "east sea"], label: "Sea of Japan", context: "Sea", bbox: [127.5, 33.5, 142.5, 52.0] },
  { names: ["baltic sea", "baltic"], label: "Baltic Sea", context: "Sea", bbox: [9.5, 53.5, 30.5, 66.0] },
  { names: ["north sea"], label: "North Sea", context: "Sea", bbox: [-4.5, 51.0, 9.5, 61.5] },
  { names: ["caribbean sea", "caribbean"], label: "Caribbean Sea", context: "Sea", bbox: [-88.5, 9.0, -59.5, 22.5] },
  { names: ["gulf of mexico"], label: "Gulf of Mexico", context: "Sea", bbox: [-98.0, 18.0, -80.5, 31.0] },
  { names: ["coral sea", "great barrier reef"], label: "Coral Sea", context: "Sea", bbox: [142.0, -25.0, 158.0, -9.0] },
  { names: ["gulf of guinea"], label: "Gulf of Guinea", context: "Sea", bbox: [-8.0, -5.0, 10.5, 6.5] },
  { names: ["indian ocean"], label: "Indian Ocean", context: "Ocean", bbox: [20.0, -50.0, 120.0, 25.0] },
  { names: ["atlantic", "atlantic ocean", "the atlantic"], label: "Atlantic Ocean", context: "Ocean", bbox: [-80.0, -60.0, 20.0, 70.0] },
  { names: ["north atlantic"], label: "North Atlantic", context: "Ocean", bbox: [-80.0, 0.0, 0.0, 70.0] },
  { names: ["arctic ocean", "arctic"], label: "Arctic", context: "Ocean", bbox: [-180.0, 66.5, 180.0, 90.0] },
  { names: ["southern ocean"], label: "Southern Ocean", context: "Ocean", bbox: [-180.0, -78.0, 180.0, -50.0] },
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
    if (region.outline) return finish(area(region.label, region.context, { type: "Polygon", coordinates: [region.outline] }, "region"));
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
