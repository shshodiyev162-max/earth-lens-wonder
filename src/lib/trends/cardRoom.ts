import type { MapPadding } from "@/components/map/FlyTo";

/** The hotspot card is a sheet along the bottom below this width, and fills up to this share of the screen. */
const SHEET_BELOW = 1024;
const SHEET_SHARE = 0.45;

/**
 * How much of the map the hotspot card and the controls cover, so a flight to a hotspot ends with
 * it in the open and not hidden behind the card describing it. Sizes follow the layout in Trends.tsx.
 */
export function clearOfHotspotCard(screen: { width: number; height: number }): MapPadding {
  if (screen.width < SHEET_BELOW) {
    // The sheet sits above the view ribbon (5rem); the Controls button and zoom take the top.
    return { topLeft: [24, 104], bottomRight: [24, Math.round(screen.height * SHEET_SHARE) + 96] };
  }
  // The 24rem card starts past the zoom buttons (4rem); drawing tools on the right, ribbon below.
  return { topLeft: [472, 64], bottomRight: [72, 96] };
}
