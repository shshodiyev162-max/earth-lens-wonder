// Where the planet is at each point of the home page. Pure functions (no three.js, no DOM) so the
// camera's path can be tested. The page marks "stops" in its layout; scrolling moves between them.

export type DataId = "mediterranean" | "uzbekistan" | "antarctica";

export interface Stop {
  /** The place at the middle of the planet's disc. `null` longitude means "wherever it has spun to". */
  lat: number | null;
  lon: number | null;
  /** Planet radius compared with the screen's fit size (1 = the opening size). */
  zoom: number;
  /** Where the middle of the disc sits on a wide screen, 0–1 across and down. */
  wide: [number, number];
  /** And on an upright screen. */
  upright: [number, number];
  clouds: number;
  data: DataId | null;
}

/** The planet's stops, in the order they appear on the page. */
export const STOPS: Stop[] = [
  // The opening: the planet spinning freely.
  { lat: null, lon: null, zoom: 1, wide: [0.73, 0.59], upright: [0.5, 1.04], clouds: 0.9, data: null },
  // "Three questions": still whole, turning towards the first answer.
  { lat: 30, lon: 28, zoom: 1.08, wide: [0.68, 0.55], upright: [0.5, 0.42], clouds: 0.9, data: null },
  { lat: 36.5, lon: 18, zoom: 2.0, wide: [0.71, 0.5], upright: [0.5, 0.3], clouds: 0.2, data: "mediterranean" },
  { lat: 41.5, lon: 64, zoom: 3.6, wide: [0.71, 0.5], upright: [0.5, 0.3], clouds: 0.12, data: "uzbekistan" },
  { lat: 43.6, lon: 60.2, zoom: 7, wide: [0.71, 0.5], upright: [0.5, 0.3], clouds: 0.06, data: "uzbekistan" },
  { lat: -82, lon: 40, zoom: 1.32, wide: [0.71, 0.52], upright: [0.5, 0.3], clouds: 0.25, data: "antarctica" },
  // The end: whole again, spinning freely.
  { lat: null, lon: null, zoom: 1.02, wide: [0.72, 0.56], upright: [0.5, 1.0], clouds: 0.9, data: null },
];

/** Smooth start and stop between two stops. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (6 * x - 15) + 10);
}

/**
 * Converts a scroll position to a place among the stops, e.g. 2.4 = 40% of the way from stop 2 to 3.
 * `centres` is the scroll position at which each stop's text is centred on screen. The planet holds
 * still around each centre, so it doesn't drift while the text there is being read.
 */
export function stopAt(scroll: number, centres: number[], hold = 0.34): number {
  if (!centres.length) return 0;
  if (scroll <= centres[0]) return 0;
  const last = centres.length - 1;
  if (scroll >= centres[last]) return last;
  let k = 0;
  while (k < last - 1 && scroll >= centres[k + 1]) k++;
  const t = (scroll - centres[k]) / (centres[k + 1] - centres[k]);
  const moving = (t - hold / 2) / (1 - hold);
  return k + Math.min(1, Math.max(0, moving));
}

/** Shortest way round the globe from one longitude to another, in degrees (−180…180]. */
export function lonDelta(from: number, to: number): number {
  const delta = ((to - from) % 360 + 540) % 360 - 180;
  return delta === -180 ? 180 : delta;
}

export interface Pose {
  lat: number;
  lon: number;
  zoom: number;
  /** Middle of the disc, 0–1 across and down the screen. */
  x: number;
  y: number;
  clouds: number;
  /** The measured map showing, and how strongly. */
  data: DataId | null;
  dataAmount: number;
  /** How much the visitor is in charge of the planet (1 at the free-spinning stops, 0 on the story). */
  free: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The planet's pose at a place among the stops. `spin` is where the free-spinning planet is now.
 * Zoom changes evenly on a logarithmic scale so it feels steady both ways.
 */
export function poseAt(place: number, spin: { lat: number; lon: number }, upright: boolean, stops: Stop[] = STOPS): Pose {
  const last = stops.length - 1;
  const clamped = Math.min(last, Math.max(0, place));
  const k = Math.min(last - 1, Math.floor(clamped));
  const a = stops[k];
  const b = stops[k + 1];
  const t = ease(clamped - k);
  const aLat = a.lat ?? spin.lat;
  const bLat = b.lat ?? spin.lat;
  const aLon = a.lon ?? spin.lon;
  const bLon = b.lon ?? spin.lon;
  const [ax, ay] = upright ? a.upright : a.wide;
  const [bx, by] = upright ? b.upright : b.wide;

  // A measured map only shows close to its own stop, so it never slides across other places.
  let data: DataId | null = null;
  let dataAmount = 0;
  if (a.data && a.data === b.data) {
    data = a.data;
    dataAmount = 1;
  } else if (a.data || b.data) {
    data = t < 0.5 ? a.data : b.data;
    dataAmount = data ? Math.max(0, 1 - Math.abs((t < 0.5 ? t : 1 - t) / 0.42)) : 0;
  }

  return {
    lat: lerp(aLat, bLat, t),
    lon: aLon + lonDelta(aLon, bLon) * t,
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), t)),
    x: lerp(ax, bx, t),
    y: lerp(ay, by, t),
    clouds: lerp(a.clouds, b.clouds, t),
    data,
    dataAmount,
    free: lerp(a.lat === null ? 1 : 0, b.lat === null ? 1 : 0, t),
  };
}

/** The planet's size in screen pixels at zoom 1: large, while still leaving room for the words. */
export function fitRadius(width: number, height: number): number {
  if (height >= width) return Math.max(width * 0.82, height * 0.36);
  return Math.min(height * 0.53, width * 0.35);
}

/**
 * The planet's tilt (x) and turn (y), in radians, that bring a place to the middle of its disc.
 * North stays up. Matches three.js's SphereGeometry and the texture's longitudes.
 */
export function faceRotation(lat: number, lon: number): { x: number; y: number } {
  return { x: (lat * Math.PI) / 180, y: -Math.PI / 2 - (lon * Math.PI) / 180 };
}
