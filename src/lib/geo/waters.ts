// Seas and oceans that can be searched for, chosen from a list or clicked on the map. Place search
// returns a sea as a single point, so their extent is kept here.
//
// The outlines below are rough on purpose. They only have to keep one body of water apart from the
// next: where two meet across land (the Americas between the Atlantic and the Pacific), the edge runs
// through that land. The water itself — the outline with the land cut out — is built from them by
// scripts/build-waters.ts into public/data/waters.json and loaded when needed (`waterShape`).

import { pointInGeometry, type LatLng, type PolygonGeometry } from "./geometry";

export type WaterKind = "sea" | "ocean";

export interface Water {
  /** What people call it (lower case; "the" is ignored when matching). */
  names: string[];
  label: string;
  kind: WaterKind;
  /** Rough outline as [longitude, latitude] points, closed. */
  outline: [number, number][];
  /** An enclosed sea: the ocean around it doesn't include it. */
  inland?: boolean;
}

type Ring = [number, number][];

const box = (w: number, s: number, e: number, n: number): Ring => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];

const close = (points: Ring): Ring => [...points, points[0]];

/**
 * Where the Atlantic side of the Americas meets the Pacific side, north to south: a line through
 * the land, from Canada down the isthmus of Panama and the Andes to Patagonia.
 */
const AMERICAS: Ring = [
  [-95, 66],
  [-95, 50],
  [-100, 30],
  [-99, 20],
  [-95, 17],
  [-85, 12.5],
  [-84.8, 11],
  [-84, 10],
  [-82.8, 8.9],
  [-81.2, 8.4],
  [-80.3, 8.6],
  [-79.6, 9.25],
  [-78.5, 9.1],
  [-77.4, 8.1],
  [-76, 6],
  [-75.6, 0],
  [-75, -10],
  [-71, -16],
  [-69.5, -19],
  [-70, -30],
  [-71, -45],
  [-70.5, -50],
];
const EQUATOR = AMERICAS.findIndex(([, lat]) => lat === 0);

/** Where the Indian Ocean meets the western Pacific, north to south: the Malay Peninsula, Indonesia and Australia. */
const INDO_PACIFIC: Ring = [
  [99, 10.5],
  [100.5, 6],
  [103.5, 1.5],
  [104, -2],
  [105.7, -5.9],
  [110, -7.3],
  [115, -8.4],
  [120, -8.6],
  [125, -8.7],
  [130, -9],
  [133, -14],
  [135, -25],
  [146, -37.5],
  [147, -43.5],
  [147, -50],
];

export const WATERS: Water[] = [
  {
    names: ["mediterranean", "mediterranean sea"],
    label: "Mediterranean Sea",
    kind: "sea",
    inland: true,
    // From the Strait of Gibraltar to the Bosphorus: leaves out the Bay of Biscay and the Black Sea.
    outline: close([
      [-5.8, 35.0],
      [-5.8, 36.6],
      [-1.5, 39.5],
      [3.0, 43.6],
      [8.5, 44.6],
      [12.6, 45.9],
      [14.5, 45.9],
      [19.7, 42.0],
      [22.8, 40.8],
      [26.6, 41.0],
      [26.9, 40.3],
      [29.0, 41.1],
      [29.5, 40.6],
      [27.2, 39.8],
      [36.4, 37.0],
      [36.4, 31.0],
      [30.0, 30.6],
      [19.5, 29.9],
      [10.0, 33.0],
      [9.5, 37.4],
      [-1.0, 35.0],
    ]),
  },
  { names: ["black sea"], label: "Black Sea", kind: "sea", inland: true, outline: box(27.2, 41.0, 41.9, 47.0) },
  { names: ["caspian sea", "caspian"], label: "Caspian Sea", kind: "sea", inland: true, outline: box(46.5, 36.5, 55.0, 47.3) },
  { names: ["red sea"], label: "Red Sea", kind: "sea", inland: true, outline: box(32.3, 12.4, 43.6, 30.0) },
  { names: ["persian gulf", "arabian gulf", "the gulf"], label: "Persian Gulf", kind: "sea", inland: true, outline: box(47.7, 23.8, 56.6, 30.5) },
  { names: ["arabian sea"], label: "Arabian Sea", kind: "sea", outline: box(51.0, 5.0, 77.0, 25.5) },
  { names: ["bay of bengal"], label: "Bay of Bengal", kind: "sea", outline: box(79.5, 5.0, 99.0, 23.0) },
  { names: ["south china sea"], label: "South China Sea", kind: "sea", outline: box(99.0, 0.0, 121.5, 24.0) },
  {
    names: ["sea of japan", "east sea", "japan sea"],
    label: "Sea of Japan",
    kind: "sea",
    // Between Korea, Russia and Japan's western coast: the Pacific side of Japan is left out.
    outline: close([
      [128, 35.5],
      [128.6, 34.8],
      [130, 33.4],
      [131, 33.9],
      [131.5, 34.3],
      [134, 35],
      [137, 35.8],
      [139.5, 37],
      [140.5, 39.5],
      [140.4, 40.6],
      [140.6, 41.5],
      [142, 43],
      [141.9, 45.3],
      [142, 46],
      [142.3, 47],
      [142.5, 50],
      [142.2, 52],
      [141.5, 52.3],
      [140, 52],
      [136, 46],
      [131, 43.5],
      [129.5, 42.5],
      [127, 39.5],
      [128, 37],
    ]),
  },
  {
    names: ["baltic sea", "baltic"],
    label: "Baltic Sea",
    kind: "sea",
    inland: true,
    // With the Kattegat; the Norwegian coast is left out.
    outline: close([
      [9.3, 54.5],
      [9.6, 56.5],
      [10.2, 57.3],
      [10.6, 57.75],
      [12, 58.3],
      [14, 60],
      [17, 64],
      [22, 66.5],
      [27, 65.5],
      [29.5, 61],
      [30.6, 60.2],
      [30.5, 59.6],
      [28, 57],
      [24, 55.5],
      [21.5, 54.5],
      [18, 54],
      [14, 53.3],
      [10.5, 53.5],
    ]),
  },
  {
    names: ["north sea"],
    label: "North Sea",
    kind: "sea",
    // From the Strait of Dover to Shetland and Skagen; the Irish Sea and the Channel are left out.
    outline: close([
      [1.6, 51.0],
      [0.3, 51.2],
      [-1.5, 52.5],
      [-2.5, 54.0],
      [-2.9, 55.2],
      [-4.2, 56.2],
      [-4.6, 57.6],
      [-3.4, 58.65],
      [-1.0, 61.0],
      [5.0, 61.0],
      [7.0, 60.0],
      [8.3, 58.5],
      [10.6, 57.75],
      [10.2, 57.3],
      [9.6, 56.5],
      [9.3, 54.5],
      [9.0, 53.6],
      [7.0, 53.0],
      [5.5, 52.3],
      [4.0, 51.2],
      [2.5, 50.9],
    ]),
  },
  {
    names: ["caribbean sea", "caribbean"],
    label: "Caribbean Sea",
    kind: "sea",
    // Inside the arc of islands from Cuba to Trinidad; the Pacific coast of Central America is left out.
    outline: close([
      [-87.0, 21.5],
      [-87.3, 21.0],
      [-88.5, 18.0],
      [-88.6, 15.5],
      [-85.0, 13.5],
      [-84.8, 11.0],
      [-84.0, 10.0],
      [-82.8, 8.9],
      [-81.2, 8.4],
      [-80.3, 8.6],
      [-79.6, 9.25],
      [-78.5, 9.1],
      [-77.4, 8.1],
      [-76.5, 7.8],
      [-75.0, 9.0],
      [-72.5, 9.0],
      [-70.0, 9.2],
      [-65.0, 9.5],
      [-62.5, 9.6],
      [-61.0, 10.15],
      [-60.7, 11.25],
      [-61.6, 12.1],
      [-61.2, 13.25],
      [-60.97, 13.9],
      [-61.0, 14.65],
      [-61.35, 15.4],
      [-61.5, 16.2],
      [-61.8, 17.07],
      [-63.05, 18.07],
      [-64.6, 18.4],
      [-66.5, 18.2],
      [-67.9, 18.3],
      [-70.5, 19.0],
      [-73.0, 19.6],
      [-74.3, 20.1],
      [-75.5, 20.3],
      [-78.0, 21.2],
      [-80.5, 22.5],
      [-81.0, 22.8],
      [-82.5, 22.8],
      [-84.0, 22.4],
      [-84.9, 21.9],
    ]),
  },
  {
    names: ["gulf of mexico"],
    label: "Gulf of Mexico",
    kind: "sea",
    // Closed off by Cuba and the Florida Keys.
    outline: close([
      [-87.0, 21.5],
      [-84.9, 21.9],
      [-84.0, 22.4],
      [-82.5, 22.8],
      [-81.0, 22.8],
      [-81.8, 24.5],
      [-80.6, 25.1],
      [-80.6, 25.6],
      [-81.5, 27.0],
      [-82.0, 30.5],
      [-88.0, 31.2],
      [-100.0, 30.0],
      [-99.0, 20.0],
      [-96.5, 18.5],
      [-94.5, 17.5],
      [-92.0, 17.5],
      [-90.5, 19.0],
      [-89.0, 20.5],
      [-87.3, 21.0],
    ]),
  },
  { names: ["hudson bay"], label: "Hudson Bay", kind: "sea", inland: true, outline: box(-95.5, 51.0, -76.5, 64.5) },
  { names: ["coral sea", "great barrier reef"], label: "Coral Sea", kind: "sea", outline: box(142.0, -25.0, 158.0, -9.0) },
  { names: ["gulf of guinea"], label: "Gulf of Guinea", kind: "sea", outline: box(-8.0, -5.0, 10.5, 6.5) },

  { names: ["atlantic", "atlantic ocean"], label: "Atlantic Ocean", kind: "ocean", outline: close([...AMERICAS, [20, -50], [20, 66]]) },
  { names: ["north atlantic", "north atlantic ocean"], label: "North Atlantic", kind: "ocean", outline: close([...AMERICAS.slice(0, EQUATOR + 1), [20, 0], [20, 66]]) },
  { names: ["south atlantic", "south atlantic ocean"], label: "South Atlantic", kind: "ocean", outline: close([...AMERICAS.slice(EQUATOR), [20, -50], [20, 0]]) },
  {
    names: ["indian ocean"],
    label: "Indian Ocean",
    kind: "ocean",
    outline: close([[20, -50], [20, 25], [33, 30], [45, 33], [60, 30], [75, 28], [90, 26], [97, 20], ...INDO_PACIFIC]),
  },
  {
    // The Pacific crosses the 180° line, which a map scan can't wrap around, so it comes in two halves.
    names: ["western pacific", "west pacific", "western pacific ocean"],
    label: "Western Pacific",
    kind: "ocean",
    outline: close([
      [180, 66],
      [180, -50],
      ...[...INDO_PACIFIC].reverse(),
      [101, 16],
      [106, 22],
      [112, 30],
      [116, 40],
      [122, 45],
      [132, 55],
      [138, 60],
      [150, 63],
      [165, 64],
      [170, 66],
    ]),
  },
  {
    names: ["eastern pacific", "east pacific", "eastern pacific ocean"],
    label: "Eastern Pacific",
    kind: "ocean",
    outline: close([
      [-180, 66],
      [-168, 66],
      [-163, 65.5],
      [-155, 63],
      [-145, 62],
      [-138, 62],
      [-128, 58],
      [-120, 50],
      [-115, 45],
      [-108, 31.5],
      [-102, 23],
      ...AMERICAS.slice(AMERICAS.findIndex(([lon, lat]) => lon === -95 && lat === 17)),
      [-180, -50],
    ]),
  },
  { names: ["arctic ocean", "arctic"], label: "Arctic Ocean", kind: "ocean", outline: box(-180, 66, 180, 90) },
  { names: ["southern ocean", "antarctic ocean"], label: "Southern Ocean", kind: "ocean", outline: box(-180, -85, 180, -50) },
];

/** Names that mean the whole Pacific, which can't be scanned as one area. */
export const WHOLE_PACIFIC = /^(?:the\s+)?(?:(?:north|south)(?:ern)?\s+)?pacific(?:\s+ocean)?$/i;

/** The rough outline (land included): for finding which water is where. */
export function roughOutline(water: Water): PolygonGeometry {
  return { type: "Polygon", coordinates: [water.outline] };
}

let shapes: Promise<Map<string, PolygonGeometry> | null> | null = null;

/** The water areas (land cut out), bundled in public/data/waters.json. Loaded once. */
export function loadWaterShapes(): Promise<Map<string, PolygonGeometry> | null> {
  if (!shapes) {
    shapes = fetch(`${import.meta.env.BASE_URL}data/waters.json`)
      .then((response) => (response.ok ? (response.json() as Promise<{ features: { properties: { label: string }; geometry: PolygonGeometry }[] }>) : null))
      .then((collection) => (collection ? new Map(collection.features.map((feature) => [feature.properties.label, feature.geometry])) : null))
      .catch(() => {
        shapes = null;
        return null;
      });
  }
  return shapes;
}

/** The water area of a sea or ocean; its rough outline if the shapes can't be loaded. */
export async function waterShape(water: Water): Promise<PolygonGeometry> {
  return (await loadWaterShapes())?.get(water.label) ?? roughOutline(water);
}

export function findWater(label: string): Water | null {
  return WATERS.find((water) => water.label === label) ?? null;
}

/** Shoelace area in square degrees: only used to rank outlines by size. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum) / 2;
}

const BY_SIZE = [...WATERS].map((water) => ({ water, size: ringArea(water.outline) })).sort((a, b) => a.size - b.size);

/** The sea or ocean at a point: the smallest outline that contains it (a sea before its ocean). */
export function waterAt([lat, lon]: LatLng): Water | null {
  for (const { water } of BY_SIZE) if (pointInGeometry([lon, lat], roughOutline(water))) return water;
  return null;
}
