// Named regions, seas and oceans: places people look for that aren't single places in
// OpenStreetMap. Place search returns "Mediterranean Sea" or "Sahel" as a point; here they have
// their real extent — a sea's water, a box, or the countries a region is made of.

import type { PlaceResult } from "./geocode";
import { findCountry, loadCountries, type Country, type CountryIndex } from "./countries";
import { bboxOf, bboxPolygon, type BBox, type LatLng, type PolygonGeometry } from "./geometry";
import { findWater, WATERS, waterShape, type WaterKind } from "./waters";

export interface NamedRegion {
  names: string[];
  label: string;
  context: string;
  countries?: string[];
  bbox?: BBox;
  /** A rough outline (longitude, latitude): for seas, whose water area is loaded separately. */
  outline?: [number, number][];
  water?: WaterKind;
}

const LAND_REGIONS: NamedRegion[] = [
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

export const NAMED_REGIONS: NamedRegion[] = [
  ...LAND_REGIONS,
  ...WATERS.map((water) => ({ names: water.names, label: water.label, context: water.kind === "sea" ? "Sea" : "Ocean", outline: water.outline, water: water.kind })),
];

export const normalizeName = (text: string) => text.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

export function findNamedRegion(text: string): NamedRegion | null {
  const key = normalizeName(text);
  return NAMED_REGIONS.find((region) => region.label.toLowerCase() === key || region.names.some((name) => normalizeName(name) === key)) ?? null;
}

function merge(geometries: PolygonGeometry[]): PolygonGeometry {
  const polygons = geometries.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

function members(region: NamedRegion, countries: CountryIndex | null): Country[] {
  return (region.countries ?? []).map((id) => (countries ? findCountry(countries, id) : null)).filter((c): c is Country => Boolean(c));
}

/**
 * The region's area: a sea's or ocean's water (land cut out), a box, or its countries together.
 * `countries` defaults to the bundled outlines (pass null to leave countries-based regions out).
 */
export async function regionGeometry(region: NamedRegion, countries?: CountryIndex | null): Promise<PolygonGeometry | null> {
  const water = region.water ? findWater(region.label) : null;
  if (water) return waterShape(water);
  if (region.outline) return { type: "Polygon", coordinates: [region.outline] };
  if (region.bbox) return bboxPolygon(region.bbox);
  const found = members(region, countries === undefined ? await loadCountries() : countries);
  return found.length ? merge(found.map((c) => c.geometry)) : null;
}

/** The extent to show and scan: the outline or box (stable, whatever the water's exact shape). */
export function regionBBox(region: NamedRegion, countries: CountryIndex | null): BBox | null {
  if (region.outline) return bboxOf({ type: "Polygon", coordinates: [region.outline] });
  if (region.bbox) return region.bbox;
  const found = members(region, countries);
  return found.length ? bboxOf(merge(found.map((c) => c.geometry))) : null;
}

/** Regions, seas and oceans whose name starts with the typed words (or contains them, from 4 letters). */
export function searchNamedRegions(query: string, limit = 3): NamedRegion[] {
  const key = normalizeName(query);
  if (key.length < 3) return [];
  const words = (region: NamedRegion) => [region.label.toLowerCase(), ...region.names.map(normalizeName)];
  const starts = NAMED_REGIONS.filter((region) => words(region).some((w) => w.startsWith(key)));
  const contains = key.length >= 4 ? NAMED_REGIONS.filter((region) => !starts.includes(region) && words(region).some((w) => w.includes(key))) : [];
  return [...starts, ...contains].slice(0, limit);
}

/** A named region as a place-search result (its shape comes from `regionGeometry`). */
export async function regionPlace(region: NamedRegion): Promise<PlaceResult | null> {
  const bbox = regionBBox(region, region.countries ? await loadCountries() : null);
  if (!bbox) return null;
  const center: LatLng = [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2];
  return { id: `region:${region.label}`, name: region.label, context: region.context, kind: region.water ? "water" : "region", center, bbox, region: region.label, source: "terrascope" };
}
