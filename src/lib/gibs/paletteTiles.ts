// Some NASA maps draw several different things see-through. The snow maps draw "no snow" that way,
// and also night, cloud, sea, lakes and missing data. The map images NASA renders on request (WMS)
// flatten every see-through pixel to nothing, so "no snow" can't be told from "too dark to see".
// NASA's map tiles (WMTS) are palette images: each pixel names its entry in the colour key, which
// keeps those apart. Maps like that are read from the tiles here.

import { fetchWithTimeout } from "../async";
import { GIBS_WMTS, type GibsLayer } from "./catalog";
import { applyTransform, decodePixel, rgbKey, type ParsedColorMap } from "./colormap";
import { GibsRequestError } from "./sample";

/** Maps whose colour key draws a real value (no snow) and "can't see" (night, cloud…) alike see-through. */
export const PALETTE_TILE_LAYERS = new Set(["MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct", "AMSRU2_Snow_Water_Equivalent_Monthly"]);

export function readsPaletteTiles(layer: Pick<GibsLayer, "id">): boolean {
  return PALETTE_TILE_LAYERS.has(layer.id);
}

const TILE = 256;
const MAX_LAT = 85.0511;

export interface PaletteImage {
  width: number;
  height: number;
  /** One palette index per pixel, row by row. */
  indices: Uint8Array;
  /** Red, green, blue for each palette entry, kept even for see-through entries. */
  palette: Uint8Array;
  /** Opacity for each palette entry (255 when the image doesn't say). */
  alpha: Uint8Array;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate") as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decodes an 8-bit palette PNG (the kind NASA's tiles are). Throws for any other kind. */
export async function decodePalettePng(bytes: Uint8Array): Promise<PaletteImage> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || signature.some((b, i) => bytes[i] !== b)) throw new Error("Not a PNG image");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let palette = new Uint8Array(0);
  let alpha = new Uint8Array(0);
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const depth = body[8];
      const colourType = body[9];
      const interlace = body[12];
      if (colourType !== 3 || depth !== 8 || interlace !== 0) throw new Error("Not an 8-bit palette PNG");
    } else if (type === "PLTE") palette = body.slice();
    else if (type === "tRNS") alpha = body.slice();
    else if (type === "IDAT") parts.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!width || !height || !palette.length) throw new Error("Incomplete palette PNG");
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const raw = await inflate(joined);
  // Undo each row's filter (one byte per pixel).
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)];
    const row = raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1));
    const out = indices.subarray(y * width, (y + 1) * width);
    const above = y > 0 ? indices.subarray((y - 1) * width, y * width) : null;
    for (let x = 0; x < width; x++) {
      const a = x > 0 ? out[x - 1] : 0;
      const b = above ? above[x] : 0;
      const c = x > 0 && above ? above[x - 1] : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = (row[x] + predicted) & 255;
    }
  }
  const fullAlpha = new Uint8Array(palette.length / 3).fill(255);
  fullAlpha.set(alpha.subarray(0, fullAlpha.length));
  return { width, height, indices, palette, alpha: fullAlpha };
}

/**
 * The value of each palette entry: a see-through entry that carries a value (no snow = 0) keeps it,
 * a see-through entry without one (night, cloud, sea, lakes, missing) is NaN, and an opaque one is
 * read through the colour key like any map.
 */
export function paletteValues(image: Pick<PaletteImage, "palette" | "alpha">, colormap: ParsedColorMap, layer: Pick<GibsLayer, "transform">): Float32Array {
  const count = image.palette.length / 3;
  const values = new Float32Array(256).fill(NaN);
  for (let k = 0; k < count; k++) {
    const [r, g, b] = [image.palette[k * 3], image.palette[k * 3 + 1], image.palette[k * 3 + 2]];
    const entry = colormap.lookup.get(rgbKey(r, g, b));
    let value: number | null = null;
    if (entry && (entry.transparent || image.alpha[k] < 128)) value = entry.nodata || entry.value === null ? null : entry.value;
    else if (image.alpha[k] >= 128) value = decodePixel(colormap, r, g, b, 255);
    values[k] = value === null ? NaN : applyTransform(value, layer.transform);
  }
  return values;
}

/** The tile zoom whose pixels are about as fine as the grid's, within the layer's own levels. */
export function tileZoomFor(grid: { bbox: [number, number, number, number]; width: number }, maxZoom: number): number {
  const degreesPerPixel = Math.max((grid.bbox[2] - grid.bbox[0]) / grid.width, 1e-9);
  return Math.max(0, Math.min(maxZoom, Math.ceil(Math.log2(360 / (TILE * degreesPerPixel)))));
}

/** Position on the world's tile pixels at this zoom (Web Mercator, as NASA's tiles are drawn). */
export function worldPixel(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const size = TILE * 2 ** zoom;
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const x = ((lon + 180) / 360) * size;
  const y = ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * size;
  return { x: Math.min(size - 1e-6, Math.max(0, x)), y: Math.min(size - 1e-6, Math.max(0, y)) };
}

/** A layer's tile address. */
export function paletteTileUrl(layer: Pick<GibsLayer, "id" | "matrixSet">, date: string, zoom: number, row: number, column: number): string {
  return `${GIBS_WMTS}/${layer.id}/default/${date}/${layer.matrixSet}/${zoom}/${row}/${column}.png`;
}

/**
 * One map over a lat/lon grid (row 0 at the north), read from NASA's palette tiles: each grid pixel
 * takes the tile pixel at its centre. NaN where the map can't see (night, cloud, sea, lakes, missing).
 */
export async function fetchPaletteGrid(
  layer: GibsLayer,
  grid: { bbox: [number, number, number, number]; width: number; height: number },
  date: string,
  colormap: ParsedColorMap,
  signal?: AbortSignal,
  fetchTile: (url: string, signal?: AbortSignal) => Promise<Uint8Array | null> = downloadTile,
): Promise<Float32Array> {
  const zoom = tileZoomFor(grid, layer.maxNativeZoom);
  const [w, s, e, n] = grid.bbox;
  const dx = (e - w) / grid.width;
  const dy = (n - s) / grid.height;
  const where = new Int32Array(grid.width * grid.height * 2);
  const tiles = new Map<string, { row: number; column: number }>();
  for (let r = 0; r < grid.height; r++) {
    const lat = n - (r + 0.5) * dy;
    for (let c = 0; c < grid.width; c++) {
      const p = worldPixel(lat, w + (c + 0.5) * dx, zoom);
      const column = Math.floor(p.x / TILE);
      const row = Math.floor(p.y / TILE);
      tiles.set(`${row}/${column}`, { row, column });
      const i = r * grid.width + c;
      where[i * 2] = Math.floor(p.x);
      where[i * 2 + 1] = Math.floor(p.y);
    }
  }
  const decoded = new Map<string, { image: PaletteImage; values: Float32Array } | null>();
  await Promise.all(
    [...tiles].map(async ([key, { row, column }]) => {
      const bytes = await fetchTile(paletteTileUrl(layer, date, zoom, row, column), signal);
      if (!bytes) return decoded.set(key, null);
      const image = await decodePalettePng(bytes);
      decoded.set(key, { image, values: paletteValues(image, colormap, layer) });
    }),
  );
  const out = new Float32Array(grid.width * grid.height).fill(NaN);
  for (let i = 0; i < out.length; i++) {
    const x = where[i * 2];
    const y = where[i * 2 + 1];
    const tile = decoded.get(`${Math.floor(y / TILE)}/${Math.floor(x / TILE)}`);
    if (!tile) continue;
    const { image, values } = tile;
    const px = Math.min(image.width - 1, Math.floor(((x % TILE) * image.width) / TILE));
    const py = Math.min(image.height - 1, Math.floor(((y % TILE) * image.height) / TILE));
    out[i] = values[image.indices[py * image.width + px]];
  }
  return out;
}

async function downloadTile(url: string, signal?: AbortSignal): Promise<Uint8Array | null> {
  const response = await fetchWithTimeout(url, { signal, timeoutMs: 30_000 });
  // Outside the map's coverage NASA has no tile: nothing to read there.
  if (response.status === 404) return null;
  if (!response.ok) throw new GibsRequestError(`NASA GIBS returned ${response.status}`, response.status);
  return new Uint8Array(await response.arrayBuffer());
}
