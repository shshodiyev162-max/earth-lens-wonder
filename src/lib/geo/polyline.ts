// Compact text form of a polygon for share links (Google's encoded polyline format, ~1 m precision
// at 1e5, ~10 m at 1e4). Rings are separated by "," and polygons by ";" — neither character
// can appear inside an encoded polyline, whose alphabet runs from "?" to "~".

import { isPolygonGeometry, type PolygonGeometry, type Position } from "./geometry";

const PRECISION = 1e4;

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

/** Encodes a ring of [lon, lat] positions (latitude first, as the format expects). */
export function encodeRing(ring: Position[], precision = PRECISION): string {
  let lastLat = 0;
  let lastLon = 0;
  let out = "";
  for (const [lon, lat] of ring) {
    const la = Math.round(lat * precision);
    const lo = Math.round(lon * precision);
    out += encodeValue(la - lastLat) + encodeValue(lo - lastLon);
    lastLat = la;
    lastLon = lo;
  }
  return out;
}

export function decodeRing(text: string, precision = PRECISION): Position[] | null {
  const ring: Position[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= text.length) return null;
      byte = text.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < text.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) return null;
    lat += dLat;
    lon += dLon;
    ring.push([lon / precision, lat / precision]);
  }
  return ring;
}

export function encodeGeometry(geometry: PolygonGeometry, precision = PRECISION): string {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((rings) => rings.map((ring) => encodeRing(ring, precision)).join(",")).join(";");
}

/** Decodes a share-link polygon; null when the text is not a valid polygon. */
export function decodeGeometry(text: string, precision = PRECISION): PolygonGeometry | null {
  const polygons: Position[][][] = [];
  for (const part of text.split(";")) {
    const rings: Position[][] = [];
    for (const encoded of part.split(",")) {
      const ring = decodeRing(encoded, precision);
      if (!ring || ring.length < 3) return null;
      const [first, last] = [ring[0], ring[ring.length - 1]];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      if (ring.length < 4 || ring.some(([lon, lat]) => Math.abs(lon) > 180 || Math.abs(lat) > 90)) return null;
      rings.push(ring);
    }
    polygons.push(rings);
  }
  const geometry: PolygonGeometry = polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
  return isPolygonGeometry(geometry) ? geometry : null;
}
