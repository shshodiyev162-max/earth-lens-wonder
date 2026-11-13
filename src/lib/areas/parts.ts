// The places an area is made of, when several are added together ("Uzbekistan + Kazakhstan").
// Each one is written in the page address so a shared link opens the same area: the first in the
// page's usual keys (country=, region=, osm=…), every other one as an "add=" entry.

import { defaultRadiusKm, hasBoundary, type PlaceResult } from "../geo/geocode";
import { formatLatLng, type BBox, type PolygonGeometry } from "../geo/geometry";
import { decodeGeometry, encodeGeometry, encodeGeometryForLink, MAX_LINK_OUTLINE } from "../geo/polyline";
import { findNamedRegion } from "../geo/regions";

export type AreaPart =
  /** A country, from the bundled outlines. */
  | { kind: "country"; id: string; name?: string }
  /** A named sea, ocean or region (lib/geo/regions). */
  | { kind: "region"; label: string }
  /** A place typed by name, found when the area is read. */
  | { kind: "place"; text: string }
  /** A place found by search, with its OpenStreetMap boundary. */
  | { kind: "osm"; osm: string; name?: string; context?: string }
  /** A drawn or shared outline. */
  | { kind: "poly"; poly: string; name?: string; context?: string }
  /** A circle around a point. */
  | { kind: "point"; lat: number; lon: number; radiusKm: number; name?: string; context?: string }
  | { kind: "bbox"; bbox: BBox; name?: string; context?: string }
  /** A saved area on this device (too detailed to fit in a link). */
  | { kind: "area"; id: string };

// "!" never appears in a country code, an OpenStreetMap id, a number or an encoded outline (whose
// letters run from "?" to "~"), so it can mark where the name starts.
const NAME_MARK = "!";
const withName = (value: string, name?: string) => (name ? `${value}${NAME_MARK}${name}` : value);
const round = (value: number) => Number(value.toFixed(5));

/** One part as an "add=" entry, e.g. "country:KAZ!Kazakhstan" or "region:Black Sea". */
export function encodePart(part: AreaPart): string {
  switch (part.kind) {
    case "country":
      return withName(`country:${part.id}`, part.name);
    case "region":
      return `region:${part.label}`;
    case "place":
      return `place:${part.text}`;
    case "osm":
      return withName(`osm:${part.osm}`, part.name);
    case "poly":
      return withName(`poly:${part.poly}`, part.name);
    case "point":
      return withName(`point:${round(part.lat)},${round(part.lon)},${part.radiusKm}`, part.name);
    case "bbox":
      return withName(`bbox:${part.bbox.join(",")}`, part.name);
    case "area":
      return `area:${part.id}`;
  }
}

const numbers = (text: string, count: number): number[] | null => {
  const values = text.split(",").map((value) => (value.trim() === "" ? NaN : Number(value)));
  return values.length === count && values.every(Number.isFinite) ? values : null;
};

/** Reads an "add=" entry; null when it is damaged. */
export function decodePart(text: string): AreaPart | null {
  const colon = text.indexOf(":");
  if (colon < 1) return null;
  const kind = text.slice(0, colon);
  const rest = text.slice(colon + 1);
  if (kind === "region") return rest.trim() ? { kind, label: rest.trim() } : null;
  if (kind === "place") return rest.trim() ? { kind, text: rest.trim() } : null;
  if (kind === "area") return rest ? { kind, id: rest } : null;

  const mark = rest.indexOf(NAME_MARK);
  const value = mark < 0 ? rest : rest.slice(0, mark);
  const name = mark < 0 ? undefined : rest.slice(mark + 1).trim() || undefined;
  switch (kind) {
    case "country":
      return /^[A-Za-z]{3}$/.test(value) ? { kind, id: value.toUpperCase(), name } : null;
    case "osm":
      return /^[NWR]\d+$/.test(value) ? { kind, osm: value, name } : null;
    case "poly":
      return decodeGeometry(value) ? { kind, poly: value, name } : null;
    case "point": {
      const values = numbers(value, 3);
      if (!values) return null;
      const [lat, lon, radiusKm] = values;
      return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && radiusKm > 0 && radiusKm <= 500 ? { kind, lat, lon, radiusKm, name } : null;
    }
    case "bbox": {
      const values = numbers(value, 4);
      return values && values[0] < values[2] && values[1] < values[3] ? { kind, bbox: values as BBox, name } : null;
    }
    default:
      return null;
  }
}

/** What tells two parts apart: picking the same country or sea twice takes it out again. */
export function partKey(part: AreaPart): string {
  switch (part.kind) {
    case "country":
      return `country:${part.id}`;
    case "region":
      return `region:${(findNamedRegion(part.label)?.label ?? part.label).toLowerCase()}`;
    case "place": {
      const region = findNamedRegion(part.text);
      return region ? `region:${region.label.toLowerCase()}` : `place:${part.text.trim().toLowerCase()}`;
    }
    case "osm":
      return `osm:${part.osm}`;
    case "poly":
      return `poly:${part.poly}`;
    case "point":
      return `point:${round(part.lat)},${round(part.lon)},${part.radiusKm}`;
    case "bbox":
      return `bbox:${part.bbox.join(",")}`;
    case "area":
      return `area:${part.id}`;
  }
}

/** The part's name before its outline is loaded. */
export function partLabel(part: AreaPart): string {
  switch (part.kind) {
    case "country":
      return part.name ?? part.id;
    case "region":
      return findNamedRegion(part.label)?.label ?? part.label;
    case "place":
      return findNamedRegion(part.text)?.label ?? part.text;
    case "osm":
      return part.name ?? "Place";
    case "poly":
      return part.name ?? "Drawn area";
    case "point":
      return part.name ?? formatLatLng([part.lat, part.lon], 2);
    case "bbox":
      return part.name ?? "Box";
    case "area":
      return "Saved area";
  }
}

/** Adds the part, or takes it out when it is already there. */
export function togglePart(parts: AreaPart[], part: AreaPart): AreaPart[] {
  const key = partKey(part);
  return parts.some((p) => partKey(p) === key) ? parts.filter((p) => partKey(p) !== key) : [...parts, part];
}

/** A place from search: a sea or region by name, a place with a boundary by that boundary, anything else as a circle. */
export function placePart(place: PlaceResult): AreaPart {
  if (place.region) return { kind: "region", label: place.region };
  if (place.country) return { kind: "country", id: place.country, name: place.name };
  if (place.osm && hasBoundary(place)) return { kind: "osm", osm: `${place.osm.type}${place.osm.id}`, name: place.name, context: place.context || undefined };
  return { kind: "point", lat: round(place.center[0]), lon: round(place.center[1]), radiusKm: defaultRadiusKm(place.kind), name: place.name, context: place.context || undefined };
}

export interface SavedAreaLike {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  region?: string;
  countryId?: string;
}

/**
 * A saved area as a part: by name when it is a sea, region or country, otherwise by its outline, so
 * the link works on any device. An outline too detailed for a link stays a saved area on this device,
 * unless `local` is false (then it is simplified to fit).
 */
export function savedAreaPart(area: SavedAreaLike, { local = true }: { local?: boolean } = {}): AreaPart {
  if (area.region) return { kind: "region", label: area.region };
  if (area.countryId) return { kind: "country", id: area.countryId, name: area.name };
  const full = encodeGeometry(area.geometry);
  if (full.length <= MAX_LINK_OUTLINE) return { kind: "poly", poly: full, name: area.name };
  return local ? { kind: "area", id: area.id } : { kind: "poly", poly: encodeGeometryForLink(area.geometry), name: area.name };
}

// ---------------------------------------------------------------------------
// The Analysis page's address

/** Every key that says which area the Analysis page reads. */
export const ANALYSIS_AREA_KEYS = ["area", "osm", "country", "region", "poly", "lat", "lon", "r", "bbox", "name", "ctx", "add"];

const text = (value: string | null) => (value && value.trim() ? value : undefined);

/** The first part, from the page's usual keys (in the order the page has always read them). */
export function primaryAnalysisPart(params: URLSearchParams): AreaPart | null {
  const name = text(params.get("name"));
  const context = text(params.get("ctx"));
  const area = params.get("area");
  if (area) return { kind: "area", id: area };
  const poly = params.get("poly");
  if (poly && decodeGeometry(poly)) return { kind: "poly", poly, name, context };
  const lat = Number(params.get("lat") ?? NaN);
  const lon = Number(params.get("lon") ?? NaN);
  if (params.get("lat") && params.get("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const r = Number(params.get("r"));
    return { kind: "point", lat, lon, radiusKm: Number.isFinite(r) && r > 0 ? Math.min(r, 500) : 10, name, context };
  }
  const bbox = params.get("bbox") ? decodePart(`bbox:${params.get("bbox")}`) : null;
  if (bbox) return { ...bbox, name, context } as AreaPart;
  const osm = params.get("osm");
  if (osm) return { kind: "osm", osm, name, context };
  const country = params.get("country");
  if (country) return { kind: "country", id: country.toUpperCase(), name };
  const region = params.get("region");
  if (region) return { kind: "region", label: region };
  return null;
}

/** The parts added to the first one. */
export function addedParts(params: URLSearchParams): AreaPart[] {
  return params.getAll("add").map(decodePart).filter((part): part is AreaPart => part !== null);
}

/** Every part of the area the Analysis page reads, the first one first. */
export function analysisParts(params: URLSearchParams): AreaPart[] {
  const primary = primaryAnalysisPart(params);
  return primary ? [primary, ...addedParts(params)] : addedParts(params);
}

function ownKeys(part: AreaPart): Record<string, string> | null {
  const named = (keys: Record<string, string>, name?: string, context?: string) => ({ ...keys, ...(name ? { name } : {}), ...(context ? { ctx: context } : {}) });
  switch (part.kind) {
    case "area":
      return { area: part.id };
    case "poly":
      return named({ poly: part.poly }, part.name, part.context);
    case "point":
      return named({ lat: String(round(part.lat)), lon: String(round(part.lon)), r: String(part.radiusKm) }, part.name, part.context);
    case "bbox":
      return named({ bbox: part.bbox.join(",") }, part.name, part.context);
    case "osm":
      return named({ osm: part.osm }, part.name, part.context);
    case "country":
      return named({ country: part.id }, part.name);
    case "region":
      return { region: findNamedRegion(part.label)?.label ?? part.label };
    case "place": {
      const region = findNamedRegion(part.text);
      return region ? { region: region.label } : null;
    }
  }
}

/** The page address with these parts as its area (an empty list clears it). */
export function writeAnalysisParts(params: URLSearchParams, parts: AreaPart[]): URLSearchParams {
  const next = new URLSearchParams(params);
  ANALYSIS_AREA_KEYS.forEach((key) => next.delete(key));
  const [first, ...rest] = parts;
  const keys = first ? ownKeys(first) : null;
  if (keys) Object.entries(keys).forEach(([key, value]) => next.set(key, value));
  // A part the usual keys can't hold (a place typed by name) is kept as an added part.
  for (const part of keys ? rest : parts) next.append("add", encodePart(part));
  return next;
}
