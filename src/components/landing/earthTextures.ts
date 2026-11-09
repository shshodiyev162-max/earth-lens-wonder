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

/** Cloud detail makes large files, so large screens get the sharper clouds and everyone else keeps the first. */
export function sharpCloudImageSize({ screenWidth, touch, maxTextureSize, saveData }: Device): ImageSize {
  if (saveData || touch || screenWidth < 1024 || maxTextureSize < 4096) return FIRST_IMAGE;
  return 4096;
}

export function dayImagePath(size: ImageSize): string {
  return `textures/earth_day_${size}.jpg`;
}

export function cloudImagePath(size: ImageSize): string {
  return `textures/earth_clouds_${size}.jpg`;
}
