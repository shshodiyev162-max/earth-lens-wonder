import { useEffect, useMemo, useState } from "react";
import { getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { applyTransform, fetchColorMap } from "@/lib/gibs/colormap";
import { formatMonth } from "@/lib/gibs/time";
import { INDICATORS } from "@/lib/query/indicators";
import { fetchMonthGrid } from "@/lib/trends/grid";
import { openWaterMonth, WATER_STOPS } from "@/lib/trends/water";
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

/** Every n-th month, so long records stay under MAX_FRAMES. */
export function sampleMonths(months: string[], max = MAX_FRAMES): string[] {
  const step = Math.max(1, Math.ceil(months.length / max));
  return months.filter((_, i) => i % step === 0);
}

/**
 * The scan's maps as coloured frames, using the product's own NASA palette. Yearly frames come
 * from the scan itself; monthly ones are read back from the device cache when first shown.
 */
export function useFrames(result: ScanResult | null, mode: FrameMode, enabled: boolean): { frames: Frame[]; layer: GibsLayer | null; loading: boolean } {
  const layer = result ? (getLayer(result.layerId) ?? null) : null;
  // Open water is drawn land to water, not in the colours of the vegetation map it was read from.
  const share = result ? Boolean(INDICATORS[result.indicator].share) : false;
  const [stops, setStops] = useState<ColorStop[] | null>(null);
  const [monthly, setMonthly] = useState<{ result: ScanResult; grids: { month: string; grid: Float32Array }[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (share) {
      setStops(WATER_STOPS);
      return;
    }
    if (!layer?.colormap) return;
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
  }, [enabled, layer, share]);

  const wantMonthly = enabled && mode === "monthly" && result !== null && layer !== null;
  useEffect(() => {
    if (!wantMonthly || !result || !layer || monthly?.result === result) return;
    const controller = new AbortController();
    Promise.all(
      sampleMonths(result.monthsRead).map((month) =>
        (share ? openWaterMonth(fetchMonthGrid, result.grid, month, controller.signal).then((water) => water.grid) : fetchMonthGrid(layer, result.grid, month, controller.signal)).then(
          (grid) => ({ month, grid }),
          () => null,
        ),
      ),
    ).then((list) => {
      if (!controller.signal.aborted) setMonthly({ result, grids: list.filter((item): item is { month: string; grid: Float32Array } => item !== null) });
    });
    return () => controller.abort();
  }, [wantMonthly, result, layer, monthly, share]);

  const frames = useMemo(() => {
    if (!enabled || !result || !stops) return [];
    const color = colorizer(stops);
    if (mode === "yearly") {
      return result.plan.years.map((year, k) => ({ label: String(year), rgba: frameImage(result.yearGrids[k], result.mask, color) }));
    }
    if (monthly?.result !== result) return [];
    return monthly.grids.map(({ month, grid }) => ({ label: formatMonth(month), rgba: frameImage(grid, result.mask, color) }));
  }, [enabled, result, stops, mode, monthly]);

  return { frames, layer, loading: wantMonthly && monthly?.result !== result };
}
