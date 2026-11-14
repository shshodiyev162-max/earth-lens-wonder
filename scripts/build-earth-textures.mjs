// Downloads the landing globe's surface images from NASA GIBS (WMS, whole-world
// equirectangular images, no key needed) into public/textures.
//
// The cloud images (earth_clouds_*.jpg) are already bundled. They are NASA's Blue Marble cloud
// map (Visible Earth 57747, cloud_combined_8192.tif), converted once to greyscale JPEGs at 4096
// and 2048 wide, with the levels set to 30–235 and a gamma of 1.5 to thin out the faint haze.
// NASA's old file host wasn't reachable in November 2026, so the original came from the Internet Archive:
// https://web.archive.org/web/20261018141030id_/https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif
//
// The Central Asia image is a sharper piece of the same picture, for the home page's close look at
// Uzbekistan and the Aral Sea shore (the whole-world image is about 5 km a pixel there). The Blue
// Marble shows the Aral Sea as it was in 2004, so scripts/compose-aral.browser.js then puts a
// cloud-free MODIS picture of 18 August 2025 over it.
//
// Run: npm run data:earth (all images), or name the files: npm run data:earth -- earth_day_central_asia.jpg
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

// NASA's cloud-free Blue Marble, with the mountains shaded and real ocean colour
// (the plain BlueMarble_ShadedRelief layer has a flat, almost black ocean).
const DAY = "BlueMarble_ShadedRelief_Bathymetry";

const TEXTURES = [
  // Shown first, while a sharper one loads.
  { layer: DAY, width: 2048, height: 1024, format: "image/jpeg", file: "earth_day_2048.jpg" },
  // For phones and tablets.
  { layer: DAY, width: 4096, height: 2048, format: "image/jpeg", file: "earth_day_4096.jpg" },
  // For large screens.
  { layer: DAY, width: 8192, height: 4096, format: "image/jpeg", file: "earth_day_8192.jpg" },
  // Central Asia, from the Caspian to Kyrgyzstan, at 0.0125° a pixel (about 1 km): south, west, north, east.
  { layer: DAY, width: 2560, height: 1440, format: "image/jpeg", file: "earth_day_central_asia.jpg", bbox: [34, 44, 52, 76] },
];

const wanted = process.argv.slice(2);
const chosen = wanted.length ? TEXTURES.filter((texture) => wanted.includes(texture.file)) : TEXTURES;
if (wanted.length && chosen.length !== wanted.length) throw new Error(`Unknown file: ${wanted.filter((file) => !TEXTURES.some((t) => t.file === file)).join(", ")}`);

for (const texture of chosen) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: texture.layer,
    STYLES: "",
    CRS: "EPSG:4326",
    // WMS 1.3.0 with EPSG:4326 takes latitude first: south, west, north, east.
    BBOX: (texture.bbox ?? [-90, -180, 90, 180]).join(","),
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
