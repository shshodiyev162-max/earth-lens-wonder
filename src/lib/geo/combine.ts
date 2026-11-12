// Several places, drawn shapes or saved areas read as one area: "Uzbekistan + Kazakhstan".
// The parts are kept as they are, side by side in one shape. Wherever the shape is measured (pixel
// masks, the point-in-area test) a spot inside any part counts once, so overlapping parts never
// count twice and never cancel each other out.

import { areaKm2, bboxOf, polygonsOf, type BBox, type PolygonGeometry } from "./geometry";

/** Every polygon of every part, as one shape. */
export function combineGeometries(geometries: PolygonGeometry[]): PolygonGeometry {
  const polygons = geometries.flatMap(polygonsOf);
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

/** "Uzbekistan + Kazakhstan", "A + B + C", "A + B + 3 more". */
export function combinedName(names: string[]): string {
  const unique = names.filter((name, index) => names.indexOf(name) === index);
  if (unique.length <= 3) return unique.join(" + ");
  return `${unique[0]} + ${unique[1]} + ${unique.length - 2} more`;
}

export interface CellGrid {
  bbox: BBox;
  width: number;
  height: number;
}

/**
 * Marks the grid cells whose centres are inside the shape. Each polygon is filled on its own (holes
 * by the even-odd rule within it), so where two polygons overlap the cell is simply inside.
 */
export function coverCells(geometry: PolygonGeometry, grid: CellGrid): Uint8Array {
  const { width, height } = grid;
  const [w, s, e, n] = grid.bbox;
  const dx = (e - w) / width;
  const dy = (n - s) / height;
  const cells = new Uint8Array(width * height);
  const crossings: number[] = [];

  for (const polygon of polygonsOf(geometry)) {
    if (!polygon[0]?.length) continue;
    const [, south, , north] = bboxOf({ type: "Polygon", coordinates: polygon });
    const firstRow = Math.max(0, Math.floor((n - north) / dy));
    const lastRow = Math.min(height - 1, Math.ceil((n - south) / dy));
    for (let row = firstRow; row <= lastRow; row++) {
      const lat = n - (row + 0.5) * dy;
      crossings.length = 0;
      for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = ring[j];
          const [x2, y2] = ring[i];
          if (y1 > lat !== y2 > lat) crossings.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const start = Math.max(0, Math.ceil((crossings[k] - w) / dx - 0.5));
        const end = Math.min(width - 1, Math.ceil((crossings[k + 1] - w) / dx - 0.5) - 1);
        for (let col = start; col <= end; col++) cells[row * width + col] = 1;
      }
    }
  }
  return cells;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function intersect(a: BBox, b: BBox): BBox | null {
  const box: BBox = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return box[0] < box[2] && box[1] < box[3] ? box : null;
}

/** Cells across the longer side of the overlap grid: overlaps are measured to within about 0.3%. */
const OVERLAP_CELLS = 700;

/**
 * The size of the parts together, counting land they share once. Each part's own size is exact;
 * where parts overlap, the shared land is measured on a fine grid and taken off. Parts that only
 * touch (neighbouring countries) share no land, so their sizes simply add up.
 */
export function combinedAreaKm2(geometries: PolygonGeometry[]): number {
  const total = geometries.reduce((sum, geometry) => sum + areaKm2(geometry), 0);
  if (geometries.length < 2) return total;

  // Only where two parts' boxes meet can they share land.
  const boxes = geometries.map(bboxOf);
  let region: BBox | null = null;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const shared = intersect(boxes[i], boxes[j]);
      if (shared) region = region ? [Math.min(region[0], shared[0]), Math.min(region[1], shared[1]), Math.max(region[2], shared[2]), Math.max(region[3], shared[3])] : shared;
    }
  }
  if (!region) return total;

  const [w, s, e, n] = region;
  const scale = OVERLAP_CELLS / Math.max(e - w, n - s);
  const grid: CellGrid = { bbox: region, width: Math.max(1, Math.round((e - w) * scale)), height: Math.max(1, Math.round((n - s) * scale)) };
  const counts = new Uint8Array(grid.width * grid.height);
  for (const geometry of geometries) {
    const cells = coverCells(geometry, grid);
    for (let i = 0; i < cells.length; i++) if (cells[i] && counts[i] < 255) counts[i] += 1;
  }

  // A cell's true size shrinks towards the poles.
  const dLon = toRad((e - w) / grid.width);
  const dy = (n - s) / grid.height;
  let shared = 0;
  for (let row = 0; row < grid.height; row++) {
    const top = n - row * dy;
    const cellKm2 = EARTH_RADIUS_KM * EARTH_RADIUS_KM * dLon * Math.abs(Math.sin(toRad(top)) - Math.sin(toRad(top - dy)));
    for (let col = 0; col < grid.width; col++) {
      const count = counts[row * grid.width + col];
      if (count > 1) shared += (count - 1) * cellKm2;
    }
  }
  return Math.max(0, total - shared);
}
