import { TIME_ZONES, TIME_ZONE_ALIASES } from "./timezones";

export interface Home {
  /** City that gives the time zone its name, e.g. "Tashkent". */
  city: string;
  lat: number;
  lon: number;
}

/**
 * The visitor's part of the world, from the time zone their browser reports.
 * Approximate on purpose: no permission is asked and nothing leaves the device.
 */
export function findHome(timeZone: string | undefined): Home | null {
  if (!timeZone) return null;
  const zone = TIME_ZONES[timeZone] ? timeZone : TIME_ZONE_ALIASES[timeZone];
  const coordinates = zone ? TIME_ZONES[zone] : undefined;
  if (!zone || !coordinates) return null;
  const city = zone.split("/").pop()!.replace(/_/g, " ");
  return { city, lat: coordinates[0], lon: coordinates[1] };
}

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** The visitor's own time, e.g. "14:05". */
export function formatLocalClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
