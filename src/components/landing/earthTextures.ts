/**
 * Which size of the globe's images to use. The smallest show first; sharper ones
 * replace them once loaded, so a slow connection never holds up the page.
 * Pure functions (no three.js) so they are easy to test.
 */

export type ImageSize = 2048 | 4096 | 8192;

export const FIRST_IMAGE: ImageSize = 2048;

interface Device {
  /** Screen width in CSS pixels. */
  screenWidth: number;
  /** A phone or tablet: less memory for images. */
  touch: boolean;
  /** The largest image the graphics card can hold. */
  maxTextureSize: number;
  /** The visitor asked their browser to use less data. */
  saveData: boolean;
}

/** Large screens get the sharpest surface, phones and tablets the middle one, and a device that can't hold or fetch those keeps the first. */
export function sharpDayImageSize({ screenWidth, touch, maxTextureSize, saveData }: Device): ImageSize {
  if (saveData) return FIRST_IMAGE;
  const wanted: ImageSize = screenWidth >= 1024 && !touch ? 8192 : 4096;
  if (wanted <= maxTextureSize) return wanted;
  return maxTextureSize >= 4096 ? 4096 : FIRST_IMAGE;
}

/**
 * The surface shown at the opening, before any zoom. The planet fills less than half the screen
 * there, so the middle image is as sharp as it looks; the sharpest (3 MB) waits for the story.
 */
export function openingDayImageSize(device: Device): ImageSize {
  const sharpest = sharpDayImageSize(device);
  return sharpest > 4096 ? 4096 : sharpest;
}

/** Cloud detail makes large files, so large screens get the sharper clouds and everyone else keeps the first. */
export function sharpCloudImageSize({ screenWidth, touch, maxTextureSize, saveData }: Device): ImageSize {
  if (saveData || touch || screenWidth < 1024 || maxTextureSize < 4096) return FIRST_IMAGE;
  return 4096;
}

/**
 * A sharper piece of the surface (about 1 km a pixel instead of 5) where the story comes close:
 * Uzbekistan and the Aral Sea shore. Its edges, as west, south, east, north in degrees.
 */
export const DETAIL_IMAGE = { path: "textures/earth_day_central_asia.jpg", bbox: [44, 34, 76, 52] as const };

/** Fetched once the story heads past its opening, so a visitor who never scrolls doesn't pay for it. */
export function wantsDetailImage(place: number, saveData: boolean): boolean {
  return !saveData && place >= 1.5;
}

/** Where a box of degrees (west, south, east, north) sits on the planet's picture, from 0 to 1. */
export function pictureBox([west, south, east, north]: readonly number[]): [number, number, number, number] {
  return [(west + 180) / 360, (south + 90) / 180, (east + 180) / 360, (north + 90) / 180];
}

export function dayImagePath(size: ImageSize): string {
  return `textures/earth_day_${size}.jpg`;
}

export function cloudImagePath(size: ImageSize): string {
  return `textures/earth_clouds_${size}.jpg`;
}
