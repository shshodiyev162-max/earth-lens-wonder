// GIBS publishes the exact palette behind every science layer. Each palette
// entry maps one RGB colour to a value range, so the colour of a pixel in a
// GIBS PNG can be turned back into the physical value it represents. This is
// what makes the legends, the click-to-probe values and the area statistics
// real measurements rather than estimates.

import { GIBS_COLORMAPS } from "./catalog";

export interface ColorMapEntry {
  rgb: [number, number, number];
  transparent: boolean;
  nodata: boolean;
  /** Lower / upper bound of the value range (null = open-ended). */
  min: number | null;
  max: number | null;
  /** Representative value of the entry (null for classification-only entries). */
  value: number | null;
  /** Title of the ColorMap block the entry belongs to. */
  group: string;
  label?: string;
}

export interface LegendStop {
  color: string;
  value: number;
}

export interface ParsedColorMap {
  name: string;
  title: string;
  units: string | null;
  entries: ColorMapEntry[];
  /** Opaque entries that carry a value, in palette order. */
  dataEntries: ColorMapEntry[];
  lookup: Map<number, ColorMapEntry>;
  legend: { stops: LegendStop[]; min: number; max: number; openMin: boolean; openMax: boolean } | null;
}

const NUMBER = (text: string): number | null => {
  const trimmed = text.trim();
  if (/^[-+]?inf$/i.test(trimmed)) return null;
  const value = parseFloat(trimmed);
  return Number.isFinite(value) ? value : null;
};

/** Parses "[0.1,0.2)", "(-INF,0.01)", "[350,+INF)" or "[99]". */
export function parseInterval(text: string | null | undefined): { min: number | null; max: number | null } | null {
  if (!text) return null;
  const inner = text.trim().replace(/^[[(]/, "").replace(/[\])]$/, "");
  if (!inner) return null;
  const parts = inner.split(",");
  if (parts.length === 1) {
    const single = NUMBER(parts[0]);
    return single === null ? null : { min: single, max: single };
  }
  return { min: NUMBER(parts[0]), max: NUMBER(parts[1]) };
}

const rgbKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

export function parseColorMapXml(xml: string, name = "colormap"): ParsedColorMap {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const entries: ColorMapEntry[] = [];
  let title = "";
  let units: string | null = null;

  for (const map of Array.from(doc.getElementsByTagName("ColorMap"))) {
    const group = map.getAttribute("title") ?? "";
    const mapUnits = map.getAttribute("units");
    const isDataGroup = !/no ?data|classification/i.test(group);
    if (isDataGroup && !title) title = group;
    if (isDataGroup && mapUnits && !units) units = mapUnits;

    for (const element of Array.from(map.getElementsByTagName("ColorMapEntry"))) {
      const rgb = (element.getAttribute("rgb") ?? "0,0,0").split(",").map((v) => Number(v)) as [number, number, number];
      const interval = parseInterval(element.getAttribute("value"));
      entries.push({
        rgb,
        transparent: element.getAttribute("transparent") === "true",
        nodata: element.getAttribute("nodata") === "true",
        min: interval?.min ?? null,
        max: interval?.max ?? null,
        value: null,
        group,
        label: element.getAttribute("label") ?? undefined,
      });
    }
  }

  // Representative values. Open-ended or unusually wide end bins (e.g. LST's
  // "[0.02, 200)" K) collapse to their inner bound so they don't skew means.
  const finiteWidths = entries
    .filter((e) => !e.transparent && e.min !== null && e.max !== null && e.max > e.min)
    .map((e) => (e.max as number) - (e.min as number))
    .sort((a, b) => a - b);
  const typicalWidth = finiteWidths.length ? finiteWidths[Math.floor(finiteWidths.length / 2)] : 0;

  const isWide = (entry: ColorMapEntry) =>
    entry.min !== null && entry.max !== null && typicalWidth > 0 && entry.max - entry.min > typicalWidth * 20;

  const groups = new Map<string, ColorMapEntry[]>();
  for (const entry of entries) {
    if (entry.min === null && entry.max === null) continue;
    const list = groups.get(entry.group) ?? [];
    list.push(entry);
    groups.set(entry.group, list);
  }
  for (const list of groups.values()) {
    list.forEach((entry, index) => {
      if (entry.min !== null && entry.max !== null) {
        if (isWide(entry)) {
          entry.value = index === 0 ? entry.max : index === list.length - 1 ? entry.min : (entry.min + entry.max) / 2;
        } else {
          entry.value = (entry.min + entry.max) / 2;
        }
      } else {
        entry.value = entry.min ?? entry.max;
      }
    });
  }
  const dataEntries = entries.filter((entry) => entry.value !== null && !entry.transparent && !entry.nodata);

  const lookup = new Map<number, ColorMapEntry>();
  for (const entry of entries) {
    const key = rgbKey(...entry.rgb);
    // Prefer opaque data entries when two entries share a colour.
    if (!lookup.has(key) || (!entry.transparent && entry.value !== null)) lookup.set(key, entry);
  }

  // Legend from the first data group (e.g. "Rain Rate" before "Snow Rate").
  const legendGroup = dataEntries[0]?.group;
  const legendEntries = dataEntries.filter((e) => e.group === legendGroup);
  let legend: ParsedColorMap["legend"] = null;
  if (legendEntries.length > 0) {
    const count = Math.min(24, legendEntries.length);
    const stops: LegendStop[] = [];
    for (let i = 0; i < count; i++) {
      const entry = legendEntries[Math.round((i / Math.max(1, count - 1)) * (legendEntries.length - 1))];
      stops.push({ color: `rgb(${entry.rgb.join(",")})`, value: entry.value as number });
    }
    const first = legendEntries[0];
    const last = legendEntries[legendEntries.length - 1];
    legend = {
      stops,
      min: first.value as number,
      max: last.value as number,
      openMin: first.min === null || isWide(first),
      openMax: last.max === null || isWide(last),
    };
  }

  return { name, title, units, entries, dataEntries, lookup, legend };
}

/**
 * Value for a pixel, or null when the pixel is transparent / no-data /
 * a classification (cloud, water, night...). Colours that are not in the
 * palette (rare resampling artefacts) snap to the nearest data colour.
 */
export function decodePixel(colormap: ParsedColorMap, r: number, g: number, b: number, a: number): number | null {
  if (a < 128) return null;
  const entry = colormap.lookup.get(rgbKey(r, g, b));
  if (entry) {
    if (entry.transparent || entry.nodata) return null;
    return entry.value;
  }
  let best: ColorMapEntry | null = null;
  let bestDistance = Infinity;
  for (const candidate of colormap.dataEntries) {
    const dr = candidate.rgb[0] - r;
    const dg = candidate.rgb[1] - g;
    const db = candidate.rgb[2] - b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best && bestDistance <= 3 * 12 * 12 ? best.value : null;
}

const colormapCache = new Map<string, Promise<ParsedColorMap>>();

export function colormapUrl(name: string): string {
  return `${GIBS_COLORMAPS}/${name}.xml`;
}

export function fetchColorMap(name: string): Promise<ParsedColorMap> {
  const cached = colormapCache.get(name);
  if (cached) return cached;
  const request = fetch(colormapUrl(name))
    .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`Colormap request failed (${response.status})`))))
    .then((xml) => parseColorMapXml(xml, name))
    .catch((error) => {
      colormapCache.delete(name);
      throw error;
    });
  colormapCache.set(name, request);
  return request;
}

/** Unit conversions from the units NASA publishes to the ones people read. */
export type ValueTransform = "kelvinToCelsius" | "kgm2sToMmPerMonth" | "snowfallToMmPerMonth" | "fractionToPercent" | "kgm3ToUgm3" | "kgm2ToMgm2" | "ozoneMassToPpmv" | undefined;

/** Average month length in seconds (365.25 / 12 days). */
const SECONDS_PER_MONTH = 30.4375 * 86_400;

export function applyTransform(value: number, transform: ValueTransform): number {
  switch (transform) {
    case "kelvinToCelsius":
      return value - 273.15;
    case "kgm2sToMmPerMonth":
      // 1 kg of water per m² is a 1 mm layer; negative bins are rounding below zero.
      return Math.max(0, value) * SECONDS_PER_MONTH;
    case "snowfallToMmPerMonth":
      // NASA's first step (below 5e-7 kg/m²/s, about 1.3 mm a month) is the colour of "no snow", so it counts as none, not as its midpoint.
      return value < 5e-7 ? 0 : value * SECONDS_PER_MONTH;
    case "fractionToPercent":
      return value * 100;
    case "kgm3ToUgm3":
      return Math.max(0, value) * 1e9;
    case "kgm2ToMgm2":
      return Math.max(0, value) * 1e6;
    case "ozoneMassToPpmv":
      // Mass mixing ratio (kg per kg of air) to parts per million by volume: × (air 28.97 g/mol ÷ ozone 48.00 g/mol).
      return Math.max(0, value) * (28.97 / 48.0) * 1e6;
    default:
      return value;
  }
}

/**
 * Where NASA's colour scale stops counting: everything beyond is drawn in the last colour, so a
 * reading there only says "this much or more". A floor at zero isn't a limit (nothing lies below it).
 */
export function scaleLimits(colormap: Pick<ParsedColorMap, "legend">, transform?: ValueTransform): { bottom: number | null; top: number | null } {
  const legend = colormap.legend;
  if (!legend) return { bottom: null, top: null };
  const bottom = legend.openMin ? applyTransform(legend.min, transform) : null;
  return { bottom: bottom !== null && Math.abs(bottom) > 1e-9 ? bottom : null, top: legend.openMax ? applyTransform(legend.max, transform) : null };
}
