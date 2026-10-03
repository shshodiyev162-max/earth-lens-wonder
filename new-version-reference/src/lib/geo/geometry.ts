// Geometry helpers shared by the map tools and the analysis engine.
// All geometries follow GeoJSON conventions: positions are [lon, lat].

export type Position = [number, number]; // [lon, lat]
export type LatLng = [number, number]; // [lat, lon] (Leaflet order)
export type BBox = [number, number, number, number]; // [west, south, east, north]

export type PolygonGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  if (!value || typeof value !== "object") return false;
  const geom = value as { type?: string; coordinates?: unknown };
  return (geom.type === "Polygon" || geom.type === "MultiPolygon") && Array.isArray(geom.coordinates);
}

/** Every polygon of a geometry as a list of rings (outer ring first). */
export function polygonsOf(geometry: PolygonGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function bboxOf(geometry: PolygonGeometry): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [lon, lat] of polygon[0] ?? []) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return [west, south, east, north];
}

/** Geodesic area of a ring in km² (spherical excess, Chamberlain & Duquette). */
function ringAreaKm2(ring: Position[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % n];
    total += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

export function areaKm2(geometry: PolygonGeometry): number {
  let total = 0;
  for (const polygon of polygonsOf(geometry)) {
    polygon.forEach((ring, index) => {
      total += index === 0 ? ringAreaKm2(ring) : -ringAreaKm2(ring);
    });
  }
  return Math.max(0, total);
}

function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point: Position, geometry: PolygonGeometry): boolean {
  for (const polygon of polygonsOf(geometry)) {
    if (!polygon[0] || !pointInRing(point, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(point, polygon[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/** Area-weighted centroid as [lat, lon]; falls back to the bbox centre. */
export function centroidOf(geometry: PolygonGeometry): LatLng {
  let weight = 0;
  let sumLon = 0;
  let sumLat = 0;
  for (const polygon of polygonsOf(geometry)) {
    const ring = polygon[0] ?? [];
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j];
      const [x1, y1] = ring[i];
      const cross = x0 * y1 - x1 * y0;
      a += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (Math.abs(a) < 1e-12) continue;
    a /= 2;
    const w = Math.abs(a);
    sumLon += (cx / (6 * a)) * w;
    sumLat += (cy / (6 * a)) * w;
    weight += w;
  }
  if (weight > 0) return [sumLat / weight, sumLon / weight];
  const [w, s, e, n] = bboxOf(geometry);
  return [(s + n) / 2, (w + e) / 2];
}

/** A point guaranteed to sit inside the geometry (centroid if possible). */
export function interiorPoint(geometry: PolygonGeometry): LatLng {
  const centroid = centroidOf(geometry);
  if (pointInGeometry([centroid[1], centroid[0]], geometry)) return centroid;
  const [w, s, e, n] = bboxOf(geometry);
  for (let step = 1; step <= 8; step++) {
    for (let i = 0; i <= step; i++) {
      for (let j = 0; j <= step; j++) {
        const lon = w + ((i + 0.5) / (step + 1)) * (e - w);
        const lat = s + ((j + 0.5) / (step + 1)) * (n - s);
        if (pointInGeometry([lon, lat], geometry)) return [lat, lon];
      }
    }
  }
  return centroid;
}

/** Destination point given a start, bearing (deg) and distance (km). */
export function destination([lat, lon]: LatLng, bearingDeg: number, distanceKm: number): LatLng {
  const delta = distanceKm / EARTH_RADIUS_KM;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);
  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta));
  const lambda2 =
    lambda1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2));
  return [toDeg(phi2), ((toDeg(lambda2) + 540) % 360) - 180];
}

export function circlePolygon(center: LatLng, radiusKm: number, steps = 72): PolygonGeometry {
  const ring: Position[] = [];
  for (let i = 0; i < steps; i++) {
    const [lat, lon] = destination(center, (i / steps) * 360, radiusKm);
    ring.push([lon, lat]);
  }
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

export function bboxPolygon([w, s, e, n]: BBox): PolygonGeometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

export function closeRing(points: Position[]): Position[] {
  if (points.length === 0) return points;
  const [fx, fy] = points[0];
  const [lx, ly] = points[points.length - 1];
  return fx === lx && fy === ly ? points : [...points, points[0]];
}

export function haversineKm([lat1, lon1]: LatLng, [lat2, lon2]: LatLng): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function clampBBox([w, s, e, n]: BBox): BBox {
  return [Math.max(-180, w), Math.max(-90, s), Math.min(180, e), Math.min(90, n)];
}

/** Expand a bbox by a fraction of its size (minimum padding in degrees). */
export function padBBox([w, s, e, n]: BBox, fraction = 0.08, minDeg = 0.01): BBox {
  const dx = Math.max((e - w) * fraction, minDeg);
  const dy = Math.max((n - s) * fraction, minDeg);
  return clampBBox([w - dx, s - dy, e + dx, n + dy]);
}

/** Leaflet-style [[south, west], [north, east]] bounds from a bbox. */
export function bboxToLatLngBounds([w, s, e, n]: BBox): [LatLng, LatLng] {
  return [
    [s, w],
    [n, e],
  ];
}

/**
 * Up to `max` representative points inside the geometry: the interior point plus
 * evenly spread points for large areas. Used to sample point-based climate data.
 */
export function representativePoints(geometry: PolygonGeometry, max = 5): LatLng[] {
  const points: LatLng[] = [interiorPoint(geometry)];
  if (max <= 1) return points;
  // Candidate grid of cell centres that fall inside the shape, then greedy
  // farthest-point sampling so the chosen points spread across irregular
  // outlines (a plain 2×2 grid misses most of a country like Uzbekistan).
  const [w, s, e, n] = bboxOf(geometry);
  const steps = 9;
  const candidates: LatLng[] = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const lon = w + ((i + 0.5) / steps) * (e - w);
      const lat = s + ((j + 0.5) / steps) * (n - s);
      if (pointInGeometry([lon, lat], geometry)) candidates.push([lat, lon]);
    }
  }
  while (points.length < max && candidates.length) {
    let bestIndex = -1;
    let bestDistance = 0;
    candidates.forEach((candidate, index) => {
      const distance = Math.min(...points.map((p) => haversineKm(p, candidate)));
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    points.push(candidates.splice(bestIndex, 1)[0]);
  }
  return points;
}

export function formatArea(km2: number): string {
  if (!Number.isFinite(km2)) return "—";
  if (km2 >= 100_000) return `${Math.round(km2 / 1000).toLocaleString()}k km²`;
  if (km2 >= 100) return `${Math.round(km2).toLocaleString()} km²`;
  if (km2 >= 1) return `${km2.toFixed(1)} km²`;
  return `${Math.round(km2 * 100)} ha`;
}

export function formatLatLng([lat, lon]: LatLng, digits = 3): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns}, ${Math.abs(lon).toFixed(digits)}°${ew}`;
}
