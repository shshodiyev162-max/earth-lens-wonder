// Downloads the landing globe's night-lights texture from NASA GIBS
// (WMS, a whole-world equirectangular image, no key needed) into public/textures.
// The day and cloud textures (earth_atmos_2048.jpg, earth_clouds_1024.png, from the
// three.js examples) are already bundled.
//
// Run: npm run data:earth
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

const TEXTURES = [
  // City lights at night (VIIRS Black Marble).
  { layer: "VIIRS_Black_Marble", width: 2048, height: 1024, format: "image/jpeg", file: "earth_night_2048.jpg" },
];

for (const texture of TEXTURES) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: texture.layer,
    STYLES: "",
    CRS: "EPSG:4326",
    // WMS 1.3.0 with EPSG:4326 takes latitude first: south, west, north, east.
    BBOX: "-90,-180,90,180",
    WIDTH: String(texture.width),
    HEIGHT: String(texture.height),
    FORMAT: texture.format,
  });
  const response = await fetch(`${WMS}?${params}`);
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) throw new Error(`${texture.layer}: download failed (${response.status} ${type})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const output = fileURLToPath(new URL(`../public/textures/${texture.file}`, import.meta.url));
  writeFileSync(output, bytes);
  console.log(`Wrote ${texture.file} (${texture.width}×${texture.height}, ${(bytes.length / 1024).toFixed(0)} KB)`);
}
