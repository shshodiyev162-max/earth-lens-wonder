import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { decodePalettePng, fetchPaletteGrid, paletteValues, tileZoomFor, worldPixel } from "../paletteTiles";
import { parseColorMapXml } from "../colormap";
import type { GibsLayer } from "../catalog";

// The snow map's colour key, cut down: 0% snow, 100% snow, and night and cloud, all but 100% see-through.
const SNOW_KEY = `<ColorMaps><ColorMap title="Snow"><Entries>
  <ColorMapEntry rgb="0,255,0" transparent="true" sourceValue="[0]" value="[0]" ref="0"/>
  <ColorMapEntry rgb="255,0,0" transparent="false" sourceValue="[100]" value="[100]" ref="1"/>
  <ColorMapEntry rgb="189,0,189" transparent="true" sourceValue="[211]" ref="2"/>
  <ColorMapEntry rgb="0,191,255" transparent="true" sourceValue="[250]" ref="3"/>
</Entries></ColorMap></ColorMaps>`;

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(body, 8);
  return out; // The checksum isn't read.
}

/** A palette PNG, as NASA's tiles are: pixels name palette entries; see-through entries keep their colour. */
function palettePng(width: number, height: number, pixels: number[], palette: number[][], alpha: number[]): Uint8Array {
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 3, 0, 0, 0], 8);
  const rows = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (width + 1)] = y % 2; // Rows filtered "none" and "sub", as encoders mix them.
    for (let x = 0; x < width; x++) {
      const value = pixels[y * width + x];
      const left = x > 0 ? pixels[y * width + x - 1] : 0;
      rows[y * (width + 1) + 1 + x] = y % 2 ? (value - left + 256) & 255 : value;
    }
  }
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("PLTE", Uint8Array.from(palette.flat())),
    chunk("tRNS", Uint8Array.from(alpha)),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const PALETTE = [
  [0, 255, 0],
  [255, 0, 0],
  [189, 0, 189],
  [0, 191, 255],
];
const ALPHA = [0, 255, 0, 0];

describe("reading NASA's palette tiles", () => {
  it("decodes which colour-key entry each pixel is", async () => {
    const image = await decodePalettePng(palettePng(4, 2, [0, 1, 2, 3, 3, 2, 1, 0], PALETTE, ALPHA));
    expect([image.width, image.height]).toEqual([4, 2]);
    expect([...image.indices]).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect([...image.palette.subarray(6, 9)]).toEqual([189, 0, 189]);
  });

  it("reads no snow as 0, and night and cloud as can't-see, not as no snow", () => {
    const values = paletteValues({ palette: Uint8Array.from(PALETTE.flat()), alpha: Uint8Array.from(ALPHA) }, parseColorMapXml(SNOW_KEY, "snow"), {});
    expect(values[0]).toBe(0);
    expect(values[1]).toBe(100);
    expect(values[2]).toBeNaN();
    expect(values[3]).toBeNaN();
  });

  it("puts the tiles' pixels on a lat/lon grid", async () => {
    // One 256-pixel tile for the whole world: left half no snow, right half night.
    const pixels = Array.from({ length: 256 * 256 }, (_, i) => (i % 256 < 128 ? 0 : 2));
    const tile = palettePng(256, 256, pixels, PALETTE, ALPHA);
    const asked: string[] = [];
    const layer = { id: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct", matrixSet: "GoogleMapsCompatible_Level6", maxNativeZoom: 0 } as GibsLayer;
    const grid = await fetchPaletteGrid(layer, { bbox: [-90, -10, 90, 10], width: 2, height: 1 }, "2020-12-01", parseColorMapXml(SNOW_KEY, "snow"), undefined, async (url) => {
      asked.push(url);
      return tile;
    });
    expect(asked).toEqual(["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct/default/2020-12-01/GoogleMapsCompatible_Level6/0/0/0.png"]);
    expect(grid[0]).toBe(0);
    expect(grid[1]).toBeNaN();
  });

  it("picks tiles about as fine as the grid, within the map's own levels", () => {
    // 0.36° grid pixels: zoom 2's tile pixels are 0.35°.
    expect(tileZoomFor({ bbox: [0, 0, 36, 10], width: 100 }, 6)).toBe(2);
    expect(tileZoomFor({ bbox: [0, 0, 0.1, 0.1], width: 100 }, 6)).toBe(6);
    expect(worldPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(worldPixel(89, 0, 0).y).toBeCloseTo(0, 0);
  });
});
