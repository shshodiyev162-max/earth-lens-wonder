import { useEffect, useMemo, useState } from "react";
import { getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { applyTransform, fetchColorMap } from "@/lib/gibs/colormap";
import { formatMonth } from "@/lib/gibs/time";
import { colorizer, frameImage, type ColorStop } from "@/lib/trends/render";
import type { ScanResult } from "@/lib/trends/scan";

export type FrameMode = "yearly" | "monthly";

/** At most this many frames are prepared, so playback stays smooth on phones. */
export const MAX_FRAMES = 60;

export interface Frame {
  label: string;
  rgba: Uint8ClampedArray;
}

function parseRgb(color: string): [number, number, number] {
  const match = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [128, 128, 128];
}

/** The scan's maps as coloured frames (preloaded), using the product's own NASA palette. */
export function useFrames(result: ScanResult | null, mode: FrameMode, enabled: boolean): { frames: Frame[]; layer: GibsLayer | null } {
  const layer = result ? (getLayer(result.layerId) ?? null) : null;
  const [stops, setStops] = useState<ColorStop[] | null>(null);

  useEffect(() => {
    if (!enabled || !layer?.colormap) return;
    let active = true;
    fetchColorMap(layer.colormap)
      .then((map) => {
        if (!active || !map.legend) return;
        setStops(map.legend.stops.map((stop) => ({ value: applyTransform(stop.value, layer.transform), color: parseRgb(stop.color) })));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled, layer]);

  const frames = useMemo(() => {
    if (!enabled || !result || !stops) return [];
    const color = colorizer(stops);
    if (mode === "yearly") {
      return result.plan.years.map((year, k) => ({ label: String(year), rgba: frameImage(result.yearGrids[k], result.mask, color) }));
    }
    const months = [...result.monthGrids.keys()].sort();
    const step = Math.max(1, Math.ceil(months.length / MAX_FRAMES));
    return months.filter((_, i) => i % step === 0).map((month) => ({ label: formatMonth(month), rgba: frameImage(result.monthGrids.get(month) as Float32Array, result.mask, color) }));
  }, [enabled, result, stops, mode]);

  return { frames, layer };
}

