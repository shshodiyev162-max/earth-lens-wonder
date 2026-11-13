// Reads the NASA data behind "possible causes" and runs the checks. Only free NASA services, read
// politely: the weather comes from NASA POWER (shared with the Analysis page's cache), fires from
// MODIS fire detections in NASA GIBS (one small picture per day checked, only after a sudden
// change: one day in eight, then every day around any fire found, at most 100 days per period),
// people from NASA SEDAC's population maps (two pictures) and what the land was from MODIS land
// cover (one picture). Every answer is kept on this device.

import { monthsOfSeasonYear } from "../analysis/aggregate";
import { averageMonthly, daysInMonth, type PowerMonthly } from "../analysis/power";
import { readPowerMonthly } from "../analysis/run";
import { createLimiter, isAbortError, withRetry } from "../async";
import { cachedValue, TTL } from "../cache/store";
import type { BBox, LatLng, PolygonGeometry } from "../geo/geometry";
import type { GibsLayer } from "../gibs/catalog";
import { fetchColorMap } from "../gibs/colormap";
import { fetchRgba, rasterizeMask, wmsGetMapUrl } from "../gibs/sample";
import { decodeGrid, scanGrid } from "../trends/grid";
import { pixelAreaKm2, type GridSpec } from "../trends/hotspots";
import { fetchLandCover, latestCoverYear, type LandCover } from "../trends/landcover";
import { changeShape, judgeFire, judgePeople, weatherCheck, type DriverId, type DriverInput, type DriverWindow, type FireDays, type PeopleCount, type YearPoint } from "./model";
import { FAMILY_DRIVERS, firesApply, peopleApply, possibleCauses, type CauseEvidence, type CauseReport, type Family, type FireEvidence, type PeopleEvidence } from "./rules";

export interface CauseRequest {
  family: Family;
  direction: "decline" | "increase";
  /** Mid-sentence name of the measure: "plant greenness". */
  noun: string;
  /** The measure, one value per (season) year. */
  series: YearPoint[];
  /** Calendar months measured each year. */
  months: number[];
  geometry: PolygonGeometry;
  bbox: BBox;
  /** Where the weather is read (averaged). */
  points: LatLng[];
}

export interface CauseLoaders {
  power: (point: LatLng, startYear: number, endYear: number, signal?: AbortSignal) => Promise<PowerMonthly>;
  /** Whether MODIS saw any fire inside the area on a day; null when NASA didn't answer. */
  fireDay: (geometry: PolygonGeometry, bbox: BBox, day: string, signal?: AbortSignal) => Promise<boolean | null>;
  people: (geometry: PolygonGeometry, bbox: BBox, year: number, signal?: AbortSignal) => Promise<PeopleCount>;
  /** What the land was in a year (the nearest year NASA has mapped). */
  landCover: (geometry: PolygonGeometry, bbox: BBox, year: number, signal?: AbortSignal) => Promise<LandCover>;
}

// ---------------------------------------------------------------------------
// Weather, year by year

/** One weather quantity, month by month, in the units the causes are told in. */
export function driverMonthly(power: PowerMonthly, id: DriverId): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const source = { rain: power.PRECTOTCORR, temp: power.T2M, soil: power.GWETROOT, wind: power.WS2M }[id] ?? {};
  for (const [month, value] of Object.entries(source)) {
    if (value === null || !Number.isFinite(value)) out.set(month, null);
    else if (id === "rain") out.set(month, value * daysInMonth(month)); // mm/day → mm in the month
    else if (id === "soil") out.set(month, value * 100); // 0–1 → %
    else out.set(month, value);
  }
  return out;
}

function addMonths(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The months a driver is read over for a (season) year. */
export function windowMonths(year: number, months: number[], window: DriverWindow): string[] {
  const season = monthsOfSeasonYear(year, months);
  if (window === "season") return season;
  const last = season[season.length - 1];
  return Array.from({ length: 12 }, (_, i) => addMonths(last, i - 11));
}

/** A driver's value for each year: the total (rain) or average of its months; null when a month is missing. */
export function driverYears(monthly: Map<string, number | null>, id: DriverId, window: DriverWindow, months: number[], years: number[]): YearPoint[] {
  return years.map((year) => {
    const values = windowMonths(year, months, window).map((m) => monthly.get(m));
    if (values.some((v) => v === null || v === undefined)) return { year, value: null };
    const list = values as number[];
    const total = list.reduce((s, v) => s + v, 0);
    return { year, value: id === "rain" ? total : total / list.length };
  });
}

// ---------------------------------------------------------------------------
// Fires

export const FIRE_COMBINED = "MODIS_Combined_Thermal_Anomalies_All";
export const FIRE_TERRA = "MODIS_Terra_Thermal_Anomalies_All";
/** Aqua joined Terra on this day; before it, Terra alone (from November 2000). */
const COMBINED_FROM = "2002-07-04";
const TERRA_FROM = "2000-11-01";
/** First pass: about one day in this many. */
export const FIRE_STEP_DAYS = 8;
/** First pass: at most this many days per period. */
export const FIRE_FIRST_DAYS = 60;
/** Around each day with fire, every day this far either side is checked too (fires last days or weeks). */
export const FIRE_FOLLOW_DAYS = 5;
/** Second pass: at most this many extra days per period. */
export const FIRE_MAX_FOLLOW = 40;
/** A sudden change is looked for in at most this much time before it. */
const MAX_WINDOW_DAYS = 730;

const DAY_MS = 86_400_000;
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromDay = (day: string) => Date.parse(`${day}T00:00:00Z`);

function lastDayOf(month: string): string {
  return toDay(fromDay(`${addMonths(month, 1)}-01`) - DAY_MS);
}

/** A fire late in the last season before a jump barely moves that season's average: look from this many months before its end. */
const LATE_SEASON_MONTHS = 3;

/**
 * When to look for fires: from the last three months of the last season before a sudden change to
 * the end of the first season after it (at most two years), and the same length of time just before,
 * to compare.
 */
export function fireWindows(before: number, after: number, months: number[], today = toDay(Date.now())): { during: [string, string]; before: [string, string] } | null {
  const seasonBefore = monthsOfSeasonYear(before, months);
  const seasonAfter = monthsOfSeasonYear(after, months);
  const lastBefore = seasonBefore[seasonBefore.length - 1];
  const lastAfter = seasonAfter[seasonAfter.length - 1];
  let to = lastDayOf(lastAfter);
  if (to >= today) to = toDay(fromDay(today) - DAY_MS);
  let from = `${addMonths(lastBefore, 1 - LATE_SEASON_MONTHS)}-01`;
  if (fromDay(to) - fromDay(from) > MAX_WINDOW_DAYS * DAY_MS) from = toDay(fromDay(to) - MAX_WINDOW_DAYS * DAY_MS);
  if (from < TERRA_FROM) from = TERRA_FROM;
  if (from > to) return null;
  const length = fromDay(to) - fromDay(from);
  const beforeTo = toDay(fromDay(from) - DAY_MS);
  let beforeFrom = toDay(fromDay(beforeTo) - length);
  if (beforeFrom < TERRA_FROM) beforeFrom = TERRA_FROM;
  return { during: [from, to], before: beforeFrom <= beforeTo ? [beforeFrom, beforeTo] : [from, from] };
}

/** Up to `count` days spread evenly from `from` to `to`, inclusive. */
export function spreadDays(from: string, to: string, count: number): string[] {
  const start = fromDay(from);
  const days = Math.round((fromDay(to) - start) / DAY_MS) + 1;
  if (days <= 0) return [];
  if (days <= count) return Array.from({ length: days }, (_, i) => toDay(start + i * DAY_MS));
  return [...new Set(Array.from({ length: count }, (_, i) => toDay(start + Math.round((i * (days - 1)) / (count - 1)) * DAY_MS)))];
}

/** The days of the first pass: about one in eight, at most 60. */
export function firstPassDays(from: string, to: string): string[] {
  const days = Math.round((fromDay(to) - fromDay(from)) / DAY_MS) + 1;
  return spreadDays(from, to, Math.min(FIRE_FIRST_DAYS, Math.max(2, Math.ceil(days / FIRE_STEP_DAYS))));
}

/** The days around those with fire that haven't been checked yet, nearest first, inside the period. */
export function followUpDays(hits: string[], asked: Set<string>, from: string, to: string): string[] {
  const out: { day: string; distance: number }[] = [];
  const seen = new Set(asked);
  for (const hit of hits) {
    for (let offset = -FIRE_FOLLOW_DAYS; offset <= FIRE_FOLLOW_DAYS; offset++) {
      const day = toDay(fromDay(hit) + offset * DAY_MS);
      if (day < from || day > to || seen.has(day)) continue;
      seen.add(day);
      out.push({ day, distance: Math.abs(offset) });
    }
  }
  return out
    .sort((a, b) => a.distance - b.distance || a.day.localeCompare(b.day))
    .slice(0, FIRE_MAX_FOLLOW)
    .map((d) => d.day)
    .sort();
}

/**
 * Days with fire in a period. A fire can burn for just a couple of weeks, which an even sample of the
 * days can miss: so one day in eight first, then every day around any fire found. Both periods are
 * read the same way, so they compare fairly.
 */
async function fireDays(loaders: CauseLoaders, request: CauseRequest, from: string, to: string, signal?: AbortSignal): Promise<FireDays> {
  const answers = new Map<string, boolean | null>();
  const ask = (days: string[]) => Promise.all(days.map(async (day) => answers.set(day, await loaders.fireDay(request.geometry, request.bbox, day, signal))));
  const first = firstPassDays(from, to);
  await ask(first);
  await ask(followUpDays(first.filter((day) => answers.get(day) === true), new Set(answers.keys()), from, to));
  const answered = [...answers.values()].filter((a): a is boolean => a !== null);
  return { checked: answered.length, withFire: answered.filter(Boolean).length, from, to };
}

// ---------------------------------------------------------------------------
// People

export const PEOPLE_YEARS = [2000, 2005, 2010, 2015, 2020];

/** The population maps to compare for a span of years: the last map at or before its start, the first at or after its end. */
export function peopleYears(firstYear: number, lastYear: number): [number, number] | null {
  const a = [...PEOPLE_YEARS].reverse().find((y) => y <= firstYear) ?? PEOPLE_YEARS[0];
  const b = PEOPLE_YEARS.find((y) => y >= lastYear) ?? PEOPLE_YEARS[PEOPLE_YEARS.length - 1];
  return a < b ? [a, b] : null;
}

/** The map's top class: "1,000 or more people per km²". */
const CROWDED = 1000;

/** People inside the area, from a grid of people per km². */
export function countFromGrid(density: Float32Array, mask: Uint8Array, grid: GridSpec, year: number): PeopleCount {
  let people = 0;
  let km2 = 0;
  let crowdedKm2 = 0;
  for (let i = 0; i < density.length; i++) {
    if (!mask[i] || !Number.isFinite(density[i])) continue;
    const a = pixelAreaKm2(grid, Math.floor(i / grid.width));
    people += density[i] * a;
    km2 += a;
    if (density[i] >= CROWDED) crowdedKm2 += a;
  }
  return { year, people, km2, crowdedShare: km2 ? crowdedKm2 / km2 : 0 };
}

// ---------------------------------------------------------------------------
// NASA, politely

const gibsLimit = createLimiter(4);
const gridKey = (grid: GridSpec) => `${grid.bbox.map((v) => v.toFixed(3)).join(",")}|${grid.width}x${grid.height}`;

function gibsLayer(id: string, period: GibsLayer["period"], colormap?: string): GibsLayer {
  return { id, name: id, source: "NASA GIBS", description: "", category: "heat", format: "png", matrixSet: "1km", maxNativeZoom: 7, period, colormap, hidden: true };
}

/** Pixels where something was drawn (fire symbols on a clear background). */
async function fireMarks(layerId: string, grid: GridSpec, day: string, signal?: AbortSignal): Promise<Uint8Array> {
  const key = `fire:${layerId}|${gridKey(grid)}|${day}`;
  return cachedValue(key, TTL.grid, () =>
    gibsLimit(
      () =>
        withRetry(
          async () => {
            const rgba = await fetchRgba(wmsGetMapUrl(gibsLayer(layerId, "daily"), grid, day), grid, signal);
            const marks = new Uint8Array(grid.width * grid.height);
            for (let i = 0; i < marks.length; i++) marks[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
            return marks;
          },
          { signal, retries: 1 },
        ),
      signal,
    ),
  );
}

async function peopleGrid(year: number, grid: GridSpec, signal?: AbortSignal): Promise<Float32Array> {
  const id = `GPW_Population_Density_${year}`;
  const layer = gibsLayer(id, "static", id);
  return cachedValue(`people:${year}|${gridKey(grid)}`, TTL.grid, () =>
    gibsLimit(
      () =>
        withRetry(
          async () => {
            const [colormap, rgba] = await Promise.all([fetchColorMap(id), fetchRgba(wmsGetMapUrl(layer, grid, null), grid, signal)]);
            return decodeGrid(rgba, colormap, layer, grid.width * grid.height);
          },
          { signal, retries: 2 },
        ),
      signal,
    ),
  );
}

export const NASA_LOADERS: CauseLoaders = {
  power: (point, startYear, endYear, signal) => readPowerMonthly(point, startYear, endYear, signal),
  async fireDay(geometry, bbox, day, signal) {
    const grid = scanGrid(bbox, 96, 0.01);
    try {
      const marks = await fireMarks(day >= COMBINED_FROM ? FIRE_COMBINED : FIRE_TERRA, grid, day, signal);
      const mask = rasterizeMask(geometry, grid);
      return marks.some((mark, i) => mark === 1 && mask[i] === 1);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) throw error;
      return null;
    }
  },
  async people(geometry, bbox, year, signal) {
    const grid = scanGrid(bbox, 120, 0.0083);
    const density = await peopleGrid(year, grid, signal);
    return countFromGrid(density, rasterizeMask(geometry, grid), grid, year);
  },
  async landCover(geometry, bbox, year, signal) {
    const latest = await latestCoverYear();
    return fetchLandCover(geometry, bbox, { year: Math.min(Math.max(year, FIRST_COVER_YEAR), latest), signal });
  },
};

// ---------------------------------------------------------------------------
// All the checks

async function checkWeather(request: CauseRequest, loaders: CauseLoaders, signal?: AbortSignal) {
  const years = request.series.map((p) => p.year);
  if (!years.length || !request.points.length) return null;
  const start = Math.min(...years) - 1;
  const end = Math.max(...years);
  const responses = await Promise.all(request.points.map((point) => loaders.power(point, start, end, signal)));
  const power = averageMonthly(responses);
  const drivers: DriverInput[] = FAMILY_DRIVERS[request.family].map(({ id, window }) => ({
    id,
    window,
    points: driverYears(driverMonthly(power, id), id, window, request.months, years),
  }));
  return weatherCheck(request.series, drivers);
}

async function checkFire(request: CauseRequest, shape: ReturnType<typeof changeShape>, loaders: CauseLoaders, signal?: AbortSignal): Promise<FireEvidence> {
  if (!firesApply(request.family, request.direction)) return { status: "skipped", reason: "measure" };
  if (shape.kind !== "sudden" || shape.before === undefined || shape.after === undefined) return { status: "skipped", reason: "notSudden" };
  const windows = fireWindows(shape.before, shape.after, request.months);
  if (!windows) return { status: "failed" };
  const [during, before] = await Promise.all([fireDays(loaders, request, ...windows.during, signal), fireDays(loaders, request, ...windows.before, signal)]);
  if (!during.checked) return { status: "failed" };
  return { status: "checked", check: { during, before, outcome: judgeFire(during, before) } };
}

async function checkPeople(request: CauseRequest, loaders: CauseLoaders, signal?: AbortSignal): Promise<PeopleEvidence> {
  if (!peopleApply(request.family)) return { status: "skipped", reason: "measure" };
  const years = request.series.map((p) => p.year);
  const pair = peopleYears(Math.min(...years), Math.max(...years));
  if (!pair) return { status: "skipped", reason: "after2020" };
  const [first, last] = await Promise.all(pair.map((year) => loaders.people(request.geometry, request.bbox, year, signal)));
  // Open sea has no population map: nothing to say about people.
  if (first.km2 < 1 || last.km2 < 1) return { status: "skipped", reason: "measure" };
  return { status: "checked", check: judgePeople(first, last) };
}

/** A check that fails leaves the others standing; cancelling stops them all. */
async function settle<T>(task: Promise<T>, fallback: T, signal?: AbortSignal): Promise<T> {
  try {
    return await task;
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    return fallback;
  }
}

/** NASA's land cover map starts in 2001. */
const FIRST_COVER_YEAR = 2001;

/**
 * Which year's land to describe: the year before a sudden change, or the first year of a gradual one.
 * What the land was before it changed says more about the cause than what is left afterwards (a
 * burnt forest is shrubland a few years later). One year only: NASA advises against measuring change
 * by comparing the map's years.
 */
export function coverYear(series: YearPoint[], shape: ReturnType<typeof changeShape>): number {
  if (shape.kind === "sudden" && shape.before !== undefined) return shape.before;
  const years = series.filter((p) => p.value !== null).map((p) => p.year);
  return years.length ? Math.min(...years) : FIRST_COVER_YEAR;
}

/** Runs every check that applies and returns the possible causes with the evidence behind them. */
export async function findCauses(request: CauseRequest, options: { signal?: AbortSignal; loaders?: CauseLoaders } = {}): Promise<{ report: CauseReport; evidence: CauseEvidence }> {
  const { signal } = options;
  const loaders = options.loaders ?? NASA_LOADERS;
  const shape = changeShape(request.series, request.direction);
  const [weather, fire, people, cover] = await Promise.all([
    settle(checkWeather(request, loaders, signal), null, signal),
    settle<FireEvidence>(checkFire(request, shape, loaders, signal), { status: "failed" }, signal),
    settle<PeopleEvidence>(checkPeople(request, loaders, signal), { status: "failed" }, signal),
    settle<LandCover | null>(loaders.landCover(request.geometry, request.bbox, coverYear(request.series, shape), signal), null, signal),
  ]);
  const evidence: CauseEvidence = { family: request.family, direction: request.direction, noun: request.noun, months: request.months, weather, shape, fire, people, cover };
  return { report: possibleCauses(evidence), evidence };
}

/** Same request, same answer: a key for sharing results between cards. */
export function causeKey(request: CauseRequest): string {
  const series = request.series.map((p) => `${p.year}:${p.value === null ? "-" : p.value.toPrecision(6)}`).join(",");
  const points = request.points.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(";");
  return [request.family, request.direction, request.months.join("."), request.bbox.map((v) => v.toFixed(3)).join(","), points, series].join("|");
}
