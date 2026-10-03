import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { bboxOf, pointInGeometry, type BBox, type LatLng, type PolygonGeometry } from "./geometry";

export interface Country {
  /** Natural Earth 3-letter code, e.g. "UZB". */
  id: string;
  name: string;
  geometry: PolygonGeometry;
  bbox: BBox;
}

export type CountryCollection = FeatureCollection<Polygon | MultiPolygon, { id: string; name: string }>;

export interface CountryIndex {
  /** The raw outlines, as drawn on the maps. */
  collection: CountryCollection;
  countries: Country[];
}

export function buildCountryIndex(collection: CountryCollection): CountryIndex {
  const countries = collection.features
    .filter((feature) => feature.properties?.id && feature.geometry)
    .map((feature) => {
      const geometry = feature.geometry as PolygonGeometry;
      return { id: feature.properties.id, name: feature.properties.name, geometry, bbox: bboxOf(geometry) };
    });
  return { collection, countries };
}

let request: Promise<CountryIndex | null> | null = null;

/** Natural Earth 1:50m country outlines with names, bundled. See scripts/build-borders.mjs. */
export function loadCountries(): Promise<CountryIndex | null> {
  if (!request) {
    request = fetch(`${import.meta.env.BASE_URL}data/countries-50m.json`)
      .then((response) => (response.ok ? (response.json() as Promise<CountryCollection>) : null))
      .then((collection) => (collection ? buildCountryIndex(collection) : null))
      .catch(() => {
        request = null;
        return null;
      });
  }
  return request;
}

const bboxSize = ([w, s, e, n]: BBox) => (e - w) * (n - s);

/** The country under a point, or null over the sea. Enclaves (Lesotho, Vatican…) win over the country around them. */
export function countryAt(index: CountryIndex, [lat, lon]: LatLng): Country | null {
  let best: Country | null = null;
  for (const country of index.countries) {
    const [w, s, e, n] = country.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (!pointInGeometry([lon, lat], country.geometry)) continue;
    if (!best || bboxSize(country.bbox) < bboxSize(best.bbox)) best = country;
  }
  return best;
}

export function findCountry(index: CountryIndex, id: string): Country | null {
  const code = id.toUpperCase();
  return index.countries.find((country) => country.id === code) ?? null;
}
