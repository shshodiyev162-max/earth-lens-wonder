// NASA POWER (Prediction Of Worldwide Energy Resources) — monthly climate
// variables from MERRA-2 and CERES for any point on Earth, plus the
// 2001–2020 monthly climatology used as the "normal" baseline.
// https://power.larc.nasa.gov/docs/services/api/

import type { LatLng } from "../geo/geometry";
import { withRetry } from "../async";

const POWER_API = "https://power.larc.nasa.gov/api/temporal";
const FILL_VALUE = -999;

export const POWER_PARAMETERS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M", "WS2M", "GWETROOT"] as const;
export type PowerParameter = (typeof POWER_PARAMETERS)[number];

export const CLIMATOLOGY_PARAMETERS = ["T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M", "GWETROOT"] as const;

/** Values keyed by "YYYY-MM"; null where POWER has no data yet. */
export type PowerMonthly = Record<PowerParameter, Record<string, number | null>>;
/** Twelve monthly normals (Jan..Dec). */
export type PowerClimatology = Partial<Record<PowerParameter, (number | null)[]>>;

export class PowerError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { messages?: string[]; message?: string };
      detail = body.messages?.join(" ") ?? body.message ?? "";
    } catch {
      /* ignore */
    }
    throw new PowerError(`NASA POWER returned ${response.status}${detail ? `: ${detail}` : ""}`, response.status);
  }
  return response.json();
}

const clean = (value: unknown): number | null => (typeof value === "number" && value !== FILL_VALUE && Number.isFinite(value) ? value : null);

export function parseMonthlyResponse(json: unknown): PowerMonthly {
  const parameter = (json as { properties?: { parameter?: Record<string, Record<string, number>> } })?.properties?.parameter ?? {};
  const out = {} as PowerMonthly;
  for (const name of POWER_PARAMETERS) {
    const series = parameter[name] ?? {};
    const values: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(series)) {
      const month = key.slice(4, 6);
      if (month === "13") continue; // annual value
      values[`${key.slice(0, 4)}-${month}`] = clean(value);
    }
    out[name] = values;
  }
  return out;
}

const MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function parseClimatologyResponse(json: unknown): PowerClimatology {
  const parameter = (json as { properties?: { parameter?: Record<string, Record<string, number>> } })?.properties?.parameter ?? {};
  const out: PowerClimatology = {};
  for (const name of POWER_PARAMETERS) {
    const series = parameter[name];
    if (!series) continue;
    out[name] = MONTH_KEYS.map((key) => clean(series[key]));
  }
  return out;
}

export function fetchPowerMonthly(point: LatLng, startYear: number, endYear: number, signal?: AbortSignal): Promise<PowerMonthly> {
  const params = new URLSearchParams({
    parameters: POWER_PARAMETERS.join(","),
    community: "AG",
    latitude: point[0].toFixed(4),
    longitude: point[1].toFixed(4),
    start: String(startYear),
    end: String(endYear),
    format: "JSON",
  });
  return withRetry(() => getJson(`${POWER_API}/monthly/point?${params}`, signal), { signal }).then(parseMonthlyResponse);
}

export function fetchPowerClimatology(point: LatLng, signal?: AbortSignal): Promise<PowerClimatology> {
  const params = new URLSearchParams({
    parameters: CLIMATOLOGY_PARAMETERS.join(","),
    community: "AG",
    latitude: point[0].toFixed(4),
    longitude: point[1].toFixed(4),
    format: "JSON",
  });
  return withRetry(() => getJson(`${POWER_API}/climatology/point?${params}`, signal), { signal }).then(parseClimatologyResponse);
}

/** Average several POWER responses (multi-point sampling of large areas). */
export function averageMonthly(responses: PowerMonthly[]): PowerMonthly {
  if (responses.length === 1) return responses[0];
  const out = {} as PowerMonthly;
  for (const name of POWER_PARAMETERS) {
    const keys = new Set(responses.flatMap((r) => Object.keys(r[name] ?? {})));
    const values: Record<string, number | null> = {};
    for (const key of keys) {
      const numbers = responses.map((r) => r[name]?.[key]).filter((v): v is number => typeof v === "number");
      values[key] = numbers.length ? numbers.reduce((s, v) => s + v, 0) / numbers.length : null;
    }
    out[name] = values;
  }
  return out;
}

export function averageClimatology(responses: PowerClimatology[]): PowerClimatology {
  if (responses.length === 1) return responses[0];
  const out: PowerClimatology = {};
  for (const name of POWER_PARAMETERS) {
    const rows = responses.map((r) => r[name]).filter((v): v is (number | null)[] => Array.isArray(v));
    if (!rows.length) continue;
    out[name] = MONTH_KEYS.map((_, m) => {
      const numbers = rows.map((row) => row[m]).filter((v): v is number => typeof v === "number");
      return numbers.length ? numbers.reduce((s, v) => s + v, 0) / numbers.length : null;
    });
  }
  return out;
}

export function daysInMonth(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** MJ/m²/day → kWh/m²/day */
export const mjToKwh = (value: number) => value / 3.6;
