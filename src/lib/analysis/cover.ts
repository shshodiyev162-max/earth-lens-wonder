// The part of the planet shown on a report's cover.

import { clampBBox, type BBox } from "../geo/geometry";

export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 480;
/** Small places are shown inside at least this much latitude, so the picture gives regional context. */
const MIN_SPAN_DEG = 1.1;

/** Expands an area's box to the cover's shape (in ground distance) with some margin, keeping it clear of the headline. */
export function coverFrame(bbox: BBox): BBox {
  const [w, s, e, n] = bbox;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const cos = Math.max(Math.cos((cy * Math.PI) / 180), 0.2);
  let halfLat = Math.max(((n - s) / 2) * 1.35, MIN_SPAN_DEG / 2);
  let halfLon = Math.max(((e - w) / 2) * 1.35, MIN_SPAN_DEG / 2 / cos);
  const groundRatio = (halfLon * cos) / halfLat;
  const want = COVER_WIDTH / COVER_HEIGHT;
  if (groundRatio < want) halfLon = (halfLat * want) / cos;
  else halfLat = (halfLon * cos) / want;
  // The headline sits at the bottom left, so the place sits up and to the right of it.
  const shiftLon = halfLon * 0.2;
  const shiftLat = halfLat * 0.12;
  return clampBBox([cx - shiftLon - halfLon, cy - shiftLat - halfLat, cx - shiftLon + halfLon, cy - shiftLat + halfLat]);
}
