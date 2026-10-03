// Builds public/data/countries-50m.json: Natural Earth 1:50m country outlines
// (borders and coastlines), public domain. Each country keeps only its name and
// 3-letter code (so it can be picked on the map); coordinates are rounded to
// 3 decimals (~100 m) to keep the file small.
//
// Run: npm run data:borders
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const OUTPUT = fileURLToPath(new URL("../public/data/countries-50m.json", import.meta.url));

const round = (value) => Math.round(value * 1000) / 1000;

function slim(coordinates) {
  if (typeof coordinates[0] === "number") return [round(coordinates[0]), round(coordinates[1])];
  const out = coordinates.map(slim);
  // Drop consecutive duplicate points created by rounding.
  if (typeof out[0][0] === "number") {
    return out.filter((point, i) => i === 0 || point[0] !== out[i - 1][0] || point[1] !== out[i - 1][1]);
  }
  return out;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const source = await response.json();

const collection = {
  type: "FeatureCollection",
  properties: { source: "Natural Earth 1:50m admin-0 countries (public domain)", url: SOURCE },
  features: source.features.map((feature) => ({
    type: "Feature",
    properties: { id: feature.properties.ADM0_A3, name: feature.properties.ADMIN },
    geometry: { type: feature.geometry.type, coordinates: slim(feature.geometry.coordinates) },
  })),
};

const json = JSON.stringify(collection);
writeFileSync(OUTPUT, json);
console.log(`Wrote ${collection.features.length} countries, ${(json.length / 1e6).toFixed(2)} MB → ${OUTPUT}`);
