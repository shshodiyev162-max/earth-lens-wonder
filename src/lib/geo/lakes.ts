// Lakes that can be searched for, chosen from a list or clicked on the map. Country outlines include
// their lakes, and the land/water map leaves inland water out, so lakes are kept here.
//
// Each lake's outline is the largest area NASA's monthly maps showed under water since 2000, with a
// 2 km margin, traced by scripts/measure-lakes.browser.js into public/data/lakes.json and loaded when
// needed (`lakeShape`). Shores that have dried up since 2000 are inside it, so a scan of the lake
// takes in the land they left. The box is where the lake was looked for, and the extent scanned.

import { bboxPolygon, pointInGeometry, type BBox, type LatLng, type PolygonGeometry } from "./geometry";

export interface Lake {
  /** What people call it (lower case; "the" is ignored when matching). */
  names: string[];
  label: string;
  /** The countries around it. */
  context: string;
  /** West, south, east, north: around the largest extent since 2000. */
  bbox: BBox;
}

export const LAKES: Lake[] = [
  // Central Asia and the Middle East
  { names: ["aral sea", "aral", "aral lake", "lake aral"], label: "Aral Sea", context: "Kazakhstan / Uzbekistan", bbox: [57.8, 43.3, 62.0, 47.2] },
  { names: ["lake balkhash", "balkhash", "balkhash lake", "balqash"], label: "Lake Balkhash", context: "Kazakhstan", bbox: [73.2, 44.8, 79.4, 47.3] },
  { names: ["sarygamysh lake", "sarygamysh", "sarikamish lake", "lake sarygamysh"], label: "Sarygamysh Lake", context: "Turkmenistan / Uzbekistan", bbox: [56.8, 41.3, 57.9, 42.5] },
  { names: ["aydar lake", "aydarkul", "aydarkul lake", "lake aydarkul", "arnasay lakes"], label: "Aydar Lake", context: "Uzbekistan", bbox: [65.9, 40.5, 67.9, 41.3] },
  { names: ["issyk-kul", "issyk kul", "lake issyk-kul", "issyk-kul lake", "ysyk-kol"], label: "Issyk-Kul", context: "Kyrgyzstan", bbox: [76.0, 42.05, 78.45, 42.95] },
  { names: ["lake sevan", "sevan"], label: "Lake Sevan", context: "Armenia", bbox: [44.85, 40.0, 45.7, 40.7] },
  { names: ["lake urmia", "urmia", "urmia lake", "lake orumiyeh"], label: "Lake Urmia", context: "Iran", bbox: [44.9, 36.95, 46.05, 38.35] },
  { names: ["lake van", "van lake"], label: "Lake Van", context: "Turkey", bbox: [42.2, 38.2, 43.75, 39.05] },
  { names: ["hamun lakes", "lake hamun", "hamun", "hamoun", "hamun lake"], label: "Hamun Lakes", context: "Iran / Afghanistan", bbox: [60.8, 30.5, 61.9, 31.8] },
  { names: ["dead sea"], label: "Dead Sea", context: "Jordan / Israel / West Bank", bbox: [35.25, 30.95, 35.7, 31.85] },
  // Asia and Europe
  { names: ["qinghai lake", "lake qinghai", "koko nor", "kokonor"], label: "Qinghai Lake", context: "China", bbox: [99.5, 36.45, 100.85, 37.35] },
  { names: ["lake baikal", "baikal"], label: "Lake Baikal", context: "Russia", bbox: [103.6, 51.35, 110.0, 55.95] },
  { names: ["lake ladoga", "ladoga"], label: "Lake Ladoga", context: "Russia", bbox: [29.7, 59.85, 33.0, 61.8] },
  // Africa
  { names: ["lake victoria", "victoria nyanza"], label: "Lake Victoria", context: "Uganda / Kenya / Tanzania", bbox: [31.4, -3.15, 34.95, 0.65] },
  { names: ["lake tanganyika", "tanganyika"], label: "Lake Tanganyika", context: "Tanzania / DR Congo / Burundi / Zambia", bbox: [29.0, -8.9, 31.3, -3.25] },
  { names: ["lake malawi", "lake nyasa", "lake niassa"], label: "Lake Malawi", context: "Malawi / Mozambique / Tanzania", bbox: [33.8, -14.55, 35.35, -9.4] },
  { names: ["lake turkana", "turkana", "lake rudolf"], label: "Lake Turkana", context: "Kenya / Ethiopia", bbox: [35.65, 2.3, 36.8, 4.75] },
  { names: ["lake chad"], label: "Lake Chad", context: "Chad / Niger / Nigeria / Cameroon", bbox: [12.9, 12.2, 15.3, 14.6] },
  { names: ["lake nasser", "lake nubia", "nasser lake"], label: "Lake Nasser", context: "Egypt / Sudan", bbox: [30.2, 21.3, 33.2, 24.1] },
  { names: ["lake kariba", "kariba"], label: "Lake Kariba", context: "Zambia / Zimbabwe", bbox: [26.6, -18.15, 29.1, -16.35] },
  // The Americas
  { names: ["great salt lake"], label: "Great Salt Lake", context: "United States", bbox: [-113.2, 40.6, -111.8, 41.75] },
  { names: ["lake mead"], label: "Lake Mead", context: "United States", bbox: [-114.9, 35.9, -113.9, 36.6] },
  { names: ["lake superior"], label: "Lake Superior", context: "United States / Canada", bbox: [-92.3, 46.3, -84.2, 49.1] },
  { names: ["lake michigan"], label: "Lake Michigan", context: "United States", bbox: [-88.2, 41.55, -84.7, 46.15] },
  { names: ["lake huron"], label: "Lake Huron", context: "United States / Canada", bbox: [-84.8, 42.95, -79.6, 46.4] },
  { names: ["lake erie"], label: "Lake Erie", context: "United States / Canada", bbox: [-83.6, 41.3, -78.8, 42.95] },
  { names: ["lake ontario"], label: "Lake Ontario", context: "United States / Canada", bbox: [-79.95, 43.15, -75.95, 44.3] },
  { names: ["lake winnipeg"], label: "Lake Winnipeg", context: "Canada", bbox: [-99.4, 50.3, -96.15, 53.9] },
  { names: ["lake titicaca", "titicaca"], label: "Lake Titicaca", context: "Peru / Bolivia", bbox: [-70.1, -16.7, -68.5, -15.15] },
  { names: ["lake poopo", "lake poopó", "poopo", "poopó"], label: "Lake Poopó", context: "Bolivia", bbox: [-67.5, -19.2, -66.6, -18.3] },
];

export function findLake(label: string): Lake | null {
  return LAKES.find((lake) => lake.label === label) ?? null;
}

let shapes: Promise<Map<string, PolygonGeometry> | null> | null = null;

/** The lakes' outlines, bundled in public/data/lakes.json. Loaded once. */
export function loadLakeShapes(): Promise<Map<string, PolygonGeometry> | null> {
  if (!shapes) {
    shapes = fetch(`${import.meta.env.BASE_URL}data/lakes.json`)
      .then((response) => (response.ok ? (response.json() as Promise<{ features: { properties: { label: string }; geometry: PolygonGeometry }[] }>) : null))
      .then((collection) => (collection ? new Map(collection.features.map((feature) => [feature.properties.label, feature.geometry])) : null))
      .catch(() => {
        shapes = null;
        return null;
      });
  }
  return shapes;
}

/** A lake's outline; its box if the outlines can't be loaded. */
export async function lakeShape(lake: Lake): Promise<PolygonGeometry> {
  return (await loadLakeShapes())?.get(lake.label) ?? bboxPolygon(lake.bbox);
}

/** The lake at a point, from the loaded outlines (none until they are loaded). */
export function lakeAt([lat, lon]: LatLng, outlines: Map<string, PolygonGeometry> | null): Lake | null {
  if (!outlines) return null;
  for (const lake of LAKES) {
    const [w, s, e, n] = lake.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    const outline = outlines.get(lake.label);
    if (outline && pointInGeometry([lon, lat], outline)) return lake;
  }
  return null;
}
