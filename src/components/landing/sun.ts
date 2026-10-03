/**
 * Where the sun is overhead, so the landing globe can show real day and night.
 * Pure functions (no three.js) so they are easy to test.
 */

export type DayNightMode = "now" | "custom" | "auto";

/** In Auto mode a full day (24 hours) passes in this many seconds. */
export const AUTO_SECONDS_PER_DAY = 20;

/** How quickly the shown time catches up with a new target (per second). */
const EASE_RATE = 1.6;

/** Hours since midnight UTC, with minutes and seconds as a fraction. */
export function utcHours(date: Date): number {
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
}

/** Day of the year in UTC: 1 on 1 January. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((today - start) / 86_400_000);
}

/** Wraps any number of hours into 0 ≤ h < 24. */
export function wrapHours(hours: number): number {
  return ((hours % 24) + 24) % 24;
}

/** Shortest way round the clock from one time to another, in hours (−12 < Δ ≤ 12). */
export function hourDelta(from: number, to: number): number {
  const delta = wrapHours(to - from);
  return delta > 12 ? delta - 24 : delta;
}

/**
 * The point on Earth where the sun is straight overhead.
 * Declination uses the simple yearly sine (within about a degree); longitude follows the UTC hour.
 */
export function subsolarPoint(day: number, hourUtc: number): { lat: number; lon: number } {
  const lat = 23.44 * Math.sin((2 * Math.PI * (day - 81)) / 365);
  let lon = (12 - wrapHours(hourUtc)) * 15;
  if (lon < -180) lon += 360;
  if (lon >= 180) lon -= 360;
  return { lat, lon };
}

/**
 * Unit vector for a latitude/longitude on three.js's SphereGeometry, in the sphere's own frame,
 * so it lines up with an equirectangular texture (left edge = 180° W).
 */
export function latLonToSphere(lat: number, lon: number): [number, number, number] {
  const phi = ((lon + 180) / 360) * 2 * Math.PI;
  const theta = ((90 - lat) * Math.PI) / 180;
  return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
}

/** Auto mode: moves the clock forward so a whole day takes AUTO_SECONDS_PER_DAY. */
export function advanceAuto(hour: number, seconds: number): number {
  return wrapHours(hour + (seconds * 24) / AUTO_SECONDS_PER_DAY);
}

/** Eases the shown time towards a target, the short way round the clock. */
export function easeHourTowards(shown: number, target: number, seconds: number): number {
  return wrapHours(shown + hourDelta(shown, target) * Math.min(1, seconds * EASE_RATE));
}

/** "14:05 UTC" */
export function formatUtc(hours: number): string {
  // The tiny nudge keeps 110/60 h showing as 01:50, not 01:49.
  const totalMinutes = Math.floor(wrapHours(hours) * 60 + 1e-6) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
}

/** A tiny store for the time the globe is showing, so only the clock label re-renders. */
export interface HourStore {
  get: () => number;
  set: (hours: number) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createHourStore(initial: number): HourStore {
  let value = initial;
  let label = formatUtc(initial);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(hours) {
      value = hours;
      const next = formatUtc(hours);
      if (next === label) return;
      label = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
