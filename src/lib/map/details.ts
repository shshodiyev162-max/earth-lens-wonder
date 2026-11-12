// What a map shows besides its imagery: names and a latitude/longitude grid. All from data bundled
// with the app (Natural Earth country outlines, the list of seas), so no service or key is involved.

import type { CountryIndex } from "@/lib/geo/countries";
import { bboxOf, interiorPoint, polygonsOf, type LatLng, type PolygonGeometry } from "@/lib/geo/geometry";

/** The tile pyramid's width in pixels per degree of longitude at a zoom level. */
export function pxPerDegree(zoom: number): number {
  return (256 * 2 ** zoom) / 360;
}

const GRID_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45];

/** The finest round step (in degrees) that keeps grid lines at least this many pixels apart. */
export function gridStep(pixelsPerDegree: number, minGapPx = 110): number {
  return GRID_STEPS.find((step) => step * pixelsPerDegree >= minGapPx) ?? GRID_STEPS[GRID_STEPS.length - 1];
}

/** The multiples of a step between two values, free of rounding noise like 0.30000000000000004. */
export function gridValues(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let i = Math.ceil(from / step); i * step <= to; i++) values.push(Number((i * step).toFixed(2)));
  return values;
}

/** "30°N", "0.25°W". The equator and the meridian of Greenwich have no side. */
export function formatDegree(value: number, axis: "lat" | "lon"): string {
  const side = value === 0 || Math.abs(value) === 180 ? "" : axis === "lat" ? (value > 0 ? "N" : "S") : value > 0 ? "E" : "W";
  return `${Number(Math.abs(value).toFixed(2))}°${side}`;
}

export type NameKind = "country" | "sea" | "ocean";

export interface MapName {
  key: string;
  text: string;
  kind: NameKind;
  at: LatLng;
  /** Width of the land it names, in degrees: a country's name shows once it fits inside. */
  spanDeg?: number;
  /** Below this zoom a small sea's name would float over the land around it. */
  minZoom?: number;
}

const water = (text: string, at: LatLng, minZoom = 0, kind: NameKind = "sea"): MapName => ({ key: `${text}@${at[1]}`, text, kind, at, minZoom });

/** Where each name sits. Sea names match the seas that can be searched for (`WATERS`). */
export const WATER_NAMES: MapName[] = [
  water("North Atlantic Ocean", [33, -42], 0, "ocean"),
  water("South Atlantic Ocean", [-25, -18], 0, "ocean"),
  water("Indian Ocean", [-22, 78], 0, "ocean"),
  // The Pacific crosses the edge of the map, so it is named on both sides.
  water("Pacific Ocean", [5, -140], 0, "ocean"),
  water("Pacific Ocean", [22, 158], 0, "ocean"),
  water("Arctic Ocean", [80, -160], 0, "ocean"),
  water("Southern Ocean", [-60, 20], 0, "ocean"),
  water("Mediterranean Sea", [34.5, 18], 3),
  water("Arabian Sea", [15, 63], 3),
  water("Bay of Bengal", [14, 88.5], 3),
  water("South China Sea", [13, 114], 3),
  water("Caribbean Sea", [15, -75], 3),
  water("Gulf of Mexico", [25, -90], 3),
  water("Hudson Bay", [59, -85.5], 3),
  water("Coral Sea", [-17, 153], 3),
  water("Gulf of Guinea", [1.5, 2.5], 3),
  water("Black Sea", [43.2, 34.5], 4),
  water("Caspian Sea", [41.5, 50.8], 4),
  water("Sea of Japan", [40, 135], 4),
  water("Baltic Sea", [58, 19.8], 4),
  water("North Sea", [56.5, 3], 4),
  water("Red Sea", [20.5, 38.2], 5),
  water("Persian Gulf", [27, 51], 5),
];

/** Names too long to fit a map, as people say them. */
const SHORTER: Record<string, string> = { "United States of America": "United States" };

/** One name per country, placed on its largest piece of land (the mainland, not a far-off island). */
export function countryNames(index: CountryIndex): MapName[] {
  return index.countries.map((country) => {
    let largest: PolygonGeometry = country.geometry;
    let biggest = -1;
    for (const coordinates of polygonsOf(country.geometry)) {
      const polygon: PolygonGeometry = { type: "Polygon", coordinates };
      const [w, s, e, n] = bboxOf(polygon);
      if ((e - w) * (n - s) > biggest) {
        biggest = (e - w) * (n - s);
        largest = polygon;
      }
    }
    const [w, , e] = bboxOf(largest);
    return { key: country.id, text: SHORTER[country.name] ?? country.name, kind: "country" as const, at: interiorPoint(largest), spanDeg: e - w };
  });
}

/** Rough size of a name on screen, from its font (see .map-name in index.css). */
const CHAR_PX: Record<NameKind, number> = { country: 7, sea: 6.6, ocean: 9 };
const LINE_PX: Record<NameKind, number> = { country: 12, sea: 16, ocean: 22 };
const ORDER: Record<NameKind, number> = { ocean: 0, sea: 1, country: 2 };

export interface PlacedName extends MapName {
  x: number;
  y: number;
}

/**
 * The names to show at a view: whole (never cut off by the map's edge), big enough for what they
 * name, and never on top of each other. Oceans and seas go first, then countries from the largest
 * down, so when two would collide it is the smaller country that waits for a closer zoom.
 */
export function placeNames(
  names: MapName[],
  view: { zoom: number; width: number; height: number; project: (at: LatLng) => { x: number; y: number } },
): PlacedName[] {
  const scale = pxPerDegree(view.zoom);
  const ordered = [...names].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (b.spanDeg ?? 0) - (a.spanDeg ?? 0));
  const taken: { left: number; right: number; top: number; bottom: number }[] = [];
  const placed: PlacedName[] = [];

  for (const name of ordered) {
    if (view.zoom < (name.minZoom ?? 0)) continue;
    const width = name.text.length * CHAR_PX[name.kind];
    if (name.spanDeg !== undefined && name.spanDeg * scale < width * 0.8) continue;
    const { x, y } = view.project(name.at);
    const box = { left: x - width / 2 - 6, right: x + width / 2 + 6, top: y - LINE_PX[name.kind] / 2 - 3, bottom: y + LINE_PX[name.kind] / 2 + 3 };
    if (box.left < 0 || box.right > view.width || box.top < 0 || box.bottom > view.height) continue;
    if (taken.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
    taken.push(box);
    placed.push({ ...name, x, y });
  }
  return placed;
}
