// Builds public/data/waters.json: the water area of every sea and ocean TerraScope knows.
//
// Each one starts from its rough outline (src/lib/geo/waters.ts). Land is cut out using the
// bundled Natural Earth 1:50m country outlines (public/data/countries-50m.json), and the oceans
// also leave out the enclosed seas inside them (the Mediterranean, the Baltic…). The water is
// filled on a fine grid (0.05° for seas, 0.2° for oceans), traced into polygons and simplified.
// Nothing is downloaded.
//
// Run: npm run data:waters
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { polygonsOf, type BBox, type PolygonGeometry, type Position } from "../src/lib/geo/geometry";
import { WATERS, type Water } from "../src/lib/geo/waters";
import { traceOutline, type GridSpec } from "../src/lib/trends/hotspots";

const COUNTRIES = fileURLToPath(new URL("../public/data/countries-50m.json", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../public/data/waters.json", import.meta.url));

interface CountryFeature {
  properties: { id: string };
  geometry: PolygonGeometry;
}

const countries = (JSON.parse(readFileSync(COUNTRIES, "utf8")) as { features: CountryFeature[] }).features;
const landRings: Position[][] = countries.flatMap((feature) => polygonsOf(feature.geometry).flat());

/** Even-odd scanline fill of pixel centres (no "at least one pixel" fallback). */
function fill(rings: Position[][], grid: GridSpec): Uint8Array {
  const { width, height } = grid;
  const [w, s, e, n] = grid.bbox;
  const dx = (e - w) / width;
  const dy = (n - s) / height;
  const mask = new Uint8Array(width * height);
  const crossings: number[] = [];
  for (let row = 0; row < height; row++) {
    const lat = n - (row + 0.5) * dy;
    crossings.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[i];
        if (y1 > lat !== y2 > lat) crossings.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const start = Math.max(0, Math.ceil((crossings[k] - w) / dx - 0.5));
      const end = Math.min(width - 1, Math.ceil((crossings[k + 1] - w) / dx - 0.5) - 1);
      for (let col = start; col <= end; col++) mask[row * width + col] = 1;
    }
  }
  return mask;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function gridFor(water: Water, step: number): GridSpec {
  const xs = water.outline.map(([x]) => x);
  const ys = water.outline.map(([, y]) => y);
  const bbox: BBox = [Math.floor(Math.min(...xs) / step) * step, Math.floor(Math.min(...ys) / step) * step, Math.ceil(Math.max(...xs) / step) * step, Math.ceil(Math.max(...ys) / step) * step];
  return { bbox, width: Math.round((bbox[2] - bbox[0]) / step), height: Math.round((bbox[3] - bbox[1]) / step) };
}

function waterShape(water: Water): { geometry: PolygonGeometry; pixels: number } {
  const step = water.kind === "sea" ? 0.05 : 0.2;
  const grid = gridFor(water, step);
  const inside = fill([water.outline], grid);
  const land = fill(landRings, grid);
  const enclosed = water.kind === "ocean" ? fill(WATERS.filter((w) => w.inland).map((w) => w.outline), grid) : new Uint8Array(inside.length);
  const pixels: number[] = [];
  for (let i = 0; i < inside.length; i++) if (inside[i] && !land[i] && !enclosed[i]) pixels.push(i);
  const traced = traceOutline(pixels, grid, step * 0.8);
  // Keep real bodies of water: specks of a few pixels left between islands are dropped.
  const minArea = step * step * 6;
  const ringArea = (ring: Position[]) => Math.abs(ring.slice(0, -1).reduce((sum, [x, y], i) => sum + x * ring[i + 1][1] - ring[i + 1][0] * y, 0)) / 2;
  const polygons = polygonsOf(traced)
    .filter((polygon) => ringArea(polygon[0]) >= minArea)
    .map((polygon) => polygon.filter((ring, i) => i === 0 || ringArea(ring) >= minArea).map((ring) => ring.map(([x, y]) => [round(x), round(y)] as Position)));
  const geometry: PolygonGeometry = polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
  return { geometry, pixels: pixels.length };
}

const features = WATERS.map((water) => {
  const { geometry, pixels } = waterShape(water);
  const points = polygonsOf(geometry).flat().reduce((sum, ring) => sum + ring.length, 0);
  console.log(`${water.label.padEnd(18)} ${String(pixels).padStart(7)} water pixels → ${polygonsOf(geometry).length} polygon(s), ${points} points`);
  return { type: "Feature", properties: { label: water.label }, geometry };
});

const json = JSON.stringify({
  type: "FeatureCollection",
  properties: { source: "Rough outlines in src/lib/geo/waters.ts minus Natural Earth 1:50m land (public domain); built by scripts/build-waters.ts" },
  features,
});
writeFileSync(OUTPUT, json);
console.log(`Wrote ${features.length} seas and oceans, ${(json.length / 1e6).toFixed(2)} MB → ${OUTPUT}`);
