// Turns a per-pixel change map into ranked hotspots: neighbouring pixels that changed the same
// way are grouped (8-connected), outlined exactly along pixel edges, measured and ranked.

import type { BBox, LatLng, PolygonGeometry, Position } from "../geo/geometry";
import type { Direction } from "../query/indicators";
import type { PixelTrends } from "./pixels";

export interface GridSpec {
  /** [west, south, east, north] in degrees; pixels are a regular lat/lon grid. */
  bbox: BBox;
  width: number;
  height: number;
}

export interface Hotspot {
  id: string;
  rank: number;
  /** -1 for a decline, +1 for an increase. */
  sign: -1 | 1;
  /** Pixel indices in the scan grid. */
  pixels: number[];
  areaKm2: number;
  center: LatLng;
  bbox: BBox;
  geometry: PolygonGeometry;
  /** Area-weighted mean of recent − baseline, in the indicator's unit. */
  meanChange: number;
  /** Mean Sen's slope per year (NaN for two-season comparisons). */
  meanSlope: number;
  /** Share of the hotspot whose own trend is significant (p < 0.05). */
  significantShare: number;
  score: number;
  label?: string;
}

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LON = 111.32;

export function pixelSize(grid: GridSpec): { dx: number; dy: number } {
  const [w, s, e, n] = grid.bbox;
  return { dx: (e - w) / grid.width, dy: (n - s) / grid.height };
}

/** Ground area of one pixel in a given row (rows shrink towards the poles). */
export function pixelAreaKm2(grid: GridSpec, row: number): number {
  const { dx, dy } = pixelSize(grid);
  const lat = grid.bbox[3] - (row + 0.5) * dy;
  return dx * KM_PER_DEGREE_LON * Math.cos((lat * Math.PI) / 180) * dy * KM_PER_DEGREE_LAT;
}

export function pixelCenter(grid: GridSpec, index: number): LatLng {
  const { dx, dy } = pixelSize(grid);
  const row = Math.floor(index / grid.width);
  const col = index % grid.width;
  return [grid.bbox[3] - (row + 0.5) * dy, grid.bbox[0] + (col + 0.5) * dx];
}

/** Pixels that changed by at least `minChange` in the given direction (and whose trend agrees, when known). */
export function flagPixels(trends: PixelTrends, sign: -1 | 1, minChange: number): Uint8Array {
  const flags = new Uint8Array(trends.change.length);
  for (let i = 0; i < flags.length; i++) {
    const change = trends.change[i];
    if (!Number.isFinite(change) || change * sign < minChange) continue;
    const slope = trends.slope[i];
    // A pixel whose own long-term slope points the other way is a one-off, not a trend.
    if (Number.isFinite(slope) && slope * sign < 0) continue;
    flags[i] = 1;
  }
  return flags;
}

/** Groups flagged pixels into 8-connected clusters of at least `minPixels`. */
export function clusterPixels(flags: Uint8Array, width: number, height: number, minPixels = 4): number[][] {
  const seen = new Uint8Array(flags.length);
  const clusters: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < flags.length; start++) {
    if (!flags[start] || seen[start]) continue;
    const cluster: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop() as number;
      cluster.push(index);
      const row = Math.floor(index / width);
      const col = index % width;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || c < 0 || r >= height || c >= width) continue;
          const next = r * width + c;
          if (flags[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (cluster.length >= minPixels) clusters.push(cluster);
  }
  return clusters;
}

// Directions in screen space (rows grow downwards): 0 east, 1 south, 2 west, 3 north.
const DC = [1, 0, -1, 0];
const DR = [0, 1, 0, -1];

function signedArea(ring: Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) total += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return total / 2;
}

function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Douglas–Peucker for a closed ring; keeps at least a triangle. */
export function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 5 || tolerance <= 0) return ring;
  const open = ring.slice(0, -1);
  const keep = new Uint8Array(open.length);
  const distance = (p: Position, a: Position, b: Position) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / length;
  };
  const simplify = (from: number, to: number) => {
    let max = 0;
    let index = -1;
    for (let i = from + 1; i < to; i++) {
      const d = distance(open[i], open[from], open[to % open.length]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index >= 0 && max > tolerance) {
      keep[index] = 1;
      simplify(from, index);
      simplify(index, to);
    }
  };
  // Split at the point farthest from the start so the ring isn't anchored on a straight edge.
  let far = 0;
  for (let i = 1; i < open.length; i++) if (Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]) > Math.hypot(open[far][0] - open[0][0], open[far][1] - open[0][1])) far = i;
  keep[0] = 1;
  keep[far] = 1;
  simplify(0, far);
  simplify(far, open.length);
  const out = open.filter((_, i) => keep[i]);
  if (out.length < 3) return ring;
  return [...out, out[0]];
}

/** Exact outline of a set of pixels (union of their squares) as a GeoJSON polygon or multipolygon. */
export function traceOutline(pixels: number[], grid: GridSpec, tolerance = 0): PolygonGeometry {
  const { width, height } = grid;
  const { dx, dy } = pixelSize(grid);
  const [west, , , north] = grid.bbox;
  const inSet = new Uint8Array(width * height);
  for (const index of pixels) inSet[index] = 1;
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < height && c < width && inSet[r * width + c] === 1;

  // Directed boundary edges with the cluster on their right-hand side (screen space).
  const fromC: number[] = [];
  const fromR: number[] = [];
  const dirs: number[] = [];
  const outgoing = new Map<number, number[]>();
  const key = (c: number, r: number) => r * (width + 1) + c;
  const add = (c: number, r: number, dir: number) => {
    const id = dirs.length;
    fromC.push(c);
    fromR.push(r);
    dirs.push(dir);
    const k = key(c, r);
    const list = outgoing.get(k);
    if (list) list.push(id);
    else outgoing.set(k, [id]);
  };
  for (const index of pixels) {
    const r = Math.floor(index / width);
    const c = index % width;
    if (!has(r - 1, c)) add(c, r, 0);
    if (!has(r, c + 1)) add(c + 1, r, 1);
    if (!has(r + 1, c)) add(c + 1, r + 1, 2);
    if (!has(r, c - 1)) add(c, r + 1, 3);
  }

  const used = new Uint8Array(dirs.length);
  const rings: Position[][] = [];
  for (let start = 0; start < dirs.length; start++) {
    if (used[start]) continue;
    const vertices: [number, number][] = [];
    let edge = start;
    for (let guard = 0; guard <= dirs.length; guard++) {
      used[edge] = 1;
      const dir = dirs[edge];
      const c = fromC[edge];
      const r = fromR[edge];
      vertices.push([c, r]);
      const endC = c + DC[dir];
      const endR = r + DR[dir];
      const candidates = (outgoing.get(key(endC, endR)) ?? []).filter((id) => !used[id] || id === start);
      if (!candidates.length) break;
      // At a pinch point prefer turning right, so touching clusters keep separate rings.
      const preference = [(dir + 1) % 4, dir, (dir + 3) % 4];
      const next = preference.map((d) => candidates.find((id) => dirs[id] === d)).find((id) => id !== undefined) ?? candidates[0];
      if (next === start) break;
      edge = next;
    }
    rings.push(toRing(vertices));
  }

  function toRing(vertices: [number, number][]): Position[] {
    const ring: Position[] = vertices.map(([c, r]) => [west + c * dx, north - r * dy]);
    ring.push(ring[0]);
    // Straight runs collapse to their corners.
    const cleaned = removeCollinear(ring);
    return tolerance > 0 ? simplifyRing(cleaned, tolerance) : cleaned;
  }

  // Tracing with the cluster on the right gives clockwise outlines and counter-clockwise holes;
  // GeoJSON (RFC 7946) wants the opposite, so every ring is reversed.
  const outers = rings.filter((ring) => signedArea(ring) < 0).map((ring) => [...ring].reverse());
  const holes = rings.filter((ring) => signedArea(ring) > 0).map((ring) => [...ring].reverse());
  const polygons: Position[][][] = outers.map((outer) => [outer]);
  for (const hole of holes) {
    const probe: Position = [hole.slice(0, -1).reduce((s, p) => s + p[0], 0) / (hole.length - 1), hole.slice(0, -1).reduce((s, p) => s + p[1], 0) / (hole.length - 1)];
    const owner = polygons.find((polygon) => pointInRing(probe, polygon[0]));
    if (owner) owner.push(hole);
  }
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

/** Drops points that lie on a straight line between their neighbours. */
function removeCollinear(ring: Position[]): Position[] {
  const open = ring.slice(0, -1);
  if (open.length < 4) return ring;
  const out: Position[] = [];
  for (let i = 0; i < open.length; i++) {
    const prev = open[(i - 1 + open.length) % open.length];
    const here = open[i];
    const next = open[(i + 1) % open.length];
    const cross = (here[0] - prev[0]) * (next[1] - here[1]) - (here[1] - prev[1]) * (next[0] - here[0]);
    if (Math.abs(cross) > 1e-12) out.push(here);
  }
  return out.length >= 3 ? [...out, out[0]] : ring;
}

export interface HotspotOptions {
  direction: Direction;
  minChange: number;
  maxHotspots?: number;
  minPixels?: number;
}

/** Clusters, measures and ranks the pixels that changed in the asked direction. */
export function buildHotspots(trends: PixelTrends, grid: GridSpec, options: HotspotOptions): Hotspot[] {
  const signs: (-1 | 1)[] = options.direction === "decline" ? [-1] : options.direction === "increase" ? [1] : [-1, 1];
  const { dx, dy } = pixelSize(grid);
  const all: Hotspot[] = [];
  for (const sign of signs) {
    const clusters = clusterPixels(flagPixels(trends, sign, options.minChange), grid.width, grid.height, options.minPixels ?? 4);
    for (const pixels of clusters) {
      let area = 0;
      let weightedChange = 0;
      let lat = 0;
      let lon = 0;
      let slopeTotal = 0;
      let slopeCount = 0;
      let significant = 0;
      let tested = 0;
      let minRow = Infinity;
      let maxRow = -Infinity;
      let minCol = Infinity;
      let maxCol = -Infinity;
      for (const index of pixels) {
        const row = Math.floor(index / grid.width);
        const col = index % grid.width;
        const a = pixelAreaKm2(grid, row);
        area += a;
        weightedChange += trends.change[index] * a;
        const [pLat, pLon] = pixelCenter(grid, index);
        lat += pLat * a;
        lon += pLon * a;
        const slope = trends.slope[index];
        if (Number.isFinite(slope)) {
          slopeTotal += slope;
          slopeCount += 1;
        }
        const p = trends.p[index];
        if (Number.isFinite(p)) {
          tested += 1;
          if (p < 0.05) significant += 1;
        }
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
      }
      const meanChange = weightedChange / area;
      const significantShare = tested ? significant / tested : 0;
      const [w, , , n] = grid.bbox;
      all.push({
        id: "",
        rank: 0,
        sign,
        pixels,
        areaKm2: area,
        center: [lat / area, lon / area],
        bbox: [w + minCol * dx, n - (maxRow + 1) * dy, w + (maxCol + 1) * dx, n - minRow * dy],
        geometry: traceOutline(pixels, grid, Math.min(dx, dy) * 0.5),
        meanChange,
        meanSlope: slopeCount ? slopeTotal / slopeCount : NaN,
        significantShare,
        score: area * (Math.abs(meanChange) / options.minChange) * (tested ? 0.5 + 0.5 * significantShare : 1),
      });
    }
  }
  return all
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxHotspots ?? 10)
    .map((hotspot, i) => ({ ...hotspot, rank: i + 1, id: `h${i + 1}` }));
}
