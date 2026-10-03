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

/** Hours the visitor's clock is ahead of UTC right now (e.g. 5 in Tashkent). */
export function localOffsetHours(date: Date): number {
  return -date.getTimezoneOffset() / 60;
}
