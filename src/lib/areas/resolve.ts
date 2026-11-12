// Turns each part of an area into its outline, and the parts into one area. Countries, seas and
// regions are bundled with the app; places found by search ask OpenStreetMap once (then cached).

import { createSharedCache } from "../async";
import { combineGeometries, combinedAreaKm2, combinedName } from "../geo/combine";
import { findCountry, loadCountries } from "../geo/countries";
import { lookupOsm } from "../geo/geocode";
import { areaKm2, bboxOf, bboxPolygon, centroidOf, circlePolygon, type BBox, type LatLng, type PolygonGeometry } from "../geo/geometry";
import { decodeGeometry } from "../geo/polyline";
import { findNamedRegion, regionGeometry } from "../geo/regions";
import type { WaterKind } from "../geo/waters";
import { resolveArea } from "../trends/place";
import { partKey, partLabel, type AreaPart } from "./parts";

export interface ResolvedPart {
  part: AreaPart;
  key: string;
  name: string;
  context?: string;
  geometry: PolygonGeometry;
  areaKm2: number;
  /** A sea or ocean: its water only. */
  water?: WaterKind;
}

/** A part that couldn't be read, with the reason in plain words. */
export class PartError extends Error {
  constructor(
    readonly part: AreaPart,
    message: string,
  ) {
    super(message);
  }
}

export interface ResolveOptions {
  signal?: AbortSignal;
  /** Saved areas on this device. */
  getArea?: (id: string) => { name: string; geometry: PolygonGeometry } | undefined;
}

const resolved = (part: AreaPart, name: string, geometry: PolygonGeometry, extra: Partial<ResolvedPart> = {}): ResolvedPart => ({
  part,
  key: partKey(part),
  name,
  geometry,
  areaKm2: areaKm2(geometry),
  ...extra,
});

async function load(part: AreaPart, signal: AbortSignal): Promise<ResolvedPart> {
  const label = partLabel(part);
  switch (part.kind) {
    case "country": {
      const index = await loadCountries();
      const country = index ? findCountry(index, part.id) : null;
      if (!country) throw new PartError(part, index ? `${label} isn't in TerraScope's map.` : "Couldn't load the country outlines. Check your connection and try again.");
      return resolved(part, part.name ?? country.name, country.geometry, { context: "Country" });
    }
    case "region": {
      const region = findNamedRegion(part.label);
      const geometry = region ? await regionGeometry(region) : null;
      if (!region || !geometry) throw new PartError(part, `${label} isn't in TerraScope's list of known places.`);
      return resolved(part, region.label, geometry, { context: region.context, water: region.water });
    }
    case "place": {
      try {
        const area = await resolveArea(part.text, { signal });
        return resolved(part, area.name, area.geometry, { context: area.context, water: area.water });
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") throw error;
        throw new PartError(part, `Couldn't find “${part.text}” on the map.`);
      }
    }
    case "osm": {
      const details = await lookupOsm(part.osm, { signal }).catch((error) => {
        if ((error as { name?: string }).name === "AbortError") throw error;
        throw new PartError(part, `Couldn't load the boundary of ${label}. Check your connection and try again.`);
      });
      if (!details) throw new PartError(part, `${label} could not be found in OpenStreetMap.`);
      return resolved(part, part.name ?? details.place.name, details.geometry ?? circlePolygon(details.place.center, 10), { context: part.context ?? details.place.context });
    }
    case "poly": {
      const geometry = decodeGeometry(part.poly);
      if (!geometry) throw new PartError(part, "One of the outlines in this link is damaged.");
      return resolved(part, label, geometry, { context: part.context });
    }
    case "point":
      return resolved(part, label, circlePolygon([part.lat, part.lon], part.radiusKm), { context: part.context ?? `${part.radiusKm} km radius` });
    case "bbox":
      return resolved(part, label, bboxPolygon(part.bbox), { context: part.context });
    case "area":
      throw new PartError(part, "That saved area no longer exists on this device.");
  }
}

const shared = createSharedCache<ResolvedPart>();

/** The part's outline and name. Throws PartError with a friendly message. */
export function resolvePart(part: AreaPart, options: ResolveOptions = {}): Promise<ResolvedPart> {
  if (part.kind === "area") {
    // Saved areas live on this device and can be renamed, so they are read fresh each time.
    const saved = options.getArea?.(part.id);
    return saved ? Promise.resolve(resolved(part, saved.name, saved.geometry, { context: "Your area" })) : Promise.reject(new PartError(part, "That saved area no longer exists on this device."));
  }
  return shared(partKey(part), (signal) => load(part, signal), options.signal);
}

export interface CombinedArea {
  name: string;
  context: string;
  geometry: PolygonGeometry;
  bbox: BBox;
  center: LatLng;
  areaKm2: number;
  /** Every part is a sea or ocean: the area is water only. */
  water?: WaterKind;
  parts: ResolvedPart[];
}

/** "2 places together". */
export function togetherLabel(count: number): string {
  return `${count} places together`;
}

/** The parts as one area: their outlines side by side, their names joined, shared land counted once. */
export function combineParts(parts: ResolvedPart[]): CombinedArea {
  const geometry = combineGeometries(parts.map((p) => p.geometry));
  const waters = parts.map((p) => p.water);
  return {
    name: combinedName(parts.map((p) => p.name)),
    context: parts.length === 1 ? (parts[0].context ?? "") : togetherLabel(parts.length),
    geometry,
    bbox: bboxOf(geometry),
    center: centroidOf(geometry),
    areaKm2: parts.length === 1 ? parts[0].areaKm2 : combinedAreaKm2(parts.map((p) => p.geometry)),
    water: waters.every(Boolean) ? (waters.every((w) => w === "sea") ? "sea" : "ocean") : undefined,
    parts,
  };
}
