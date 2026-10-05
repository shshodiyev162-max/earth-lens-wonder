// The Trends page's question as URL state: the typed text (q) plus any chip edits, so every
// question — and every adjustment of it — is a shareable link.

import { formatArea } from "../geo/geometry";
import { encodeGeometry } from "../geo/polyline";
import { formatMonth } from "../gibs/time";
import { INDICATORS, monthsLabel, SEASONS, type Direction, type IndicatorId, type SeasonId } from "../query/indicators";
import { parseTrendQuery, type ParsedQuery, type TimeSpec } from "../query/parse";
import { seasonYearMonths, type PeriodPlan } from "../query/period";
import type { Hotspot } from "./hotspots";
import type { ScanArea } from "./place";

export interface TrendQuery {
  text: string;
  /** The rules recognised an indicator (or the user picked one). */
  understood: boolean;
  indicator: IndicatorId;
  direction: Direction;
  place: string | null;
  near: boolean;
  time: TimeSpec;
  /** null = the indicator's usual season. */
  season: Exclude<SeasonId, "custom"> | null;
  /** Explicit months (overrides the season). */
  months: number[] | null;
  /** An exact area handed over from another page (Analysis "Show on map"). */
  area: { country?: string; osm?: string; poly?: string; name?: string } | null;
}

const INDICATOR_IDS = Object.keys(INDICATORS) as IndicatorId[];
const DIRECTIONS: Direction[] = ["decline", "increase", "any"];

export function encodeTime(time: TimeSpec): string {
  switch (time.kind) {
    case "since":
      return `since-${time.start}`;
    case "range":
      return `range-${time.start}-${time.end}`;
    case "last":
      return `last-${time.years}`;
    case "year":
      return `year-${time.year}`;
    case "versus":
      return `vs-${time.baseline}-${time.recent}`;
    default:
      return "default";
  }
}

export function decodeTime(text: string | null): TimeSpec | null {
  if (!text) return null;
  const [kind, a, b] = text.split("-");
  const n = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) ? Number(v) : NaN);
  switch (kind) {
    case "since":
      return Number.isFinite(n(a)) ? { kind: "since", start: n(a) } : null;
    case "range":
      return Number.isFinite(n(a)) && Number.isFinite(n(b)) ? { kind: "range", start: Math.min(n(a), n(b)), end: Math.max(n(a), n(b)) } : null;
    case "last":
      return Number.isFinite(n(a)) && n(a) > 0 ? { kind: "last", years: Math.min(40, n(a)) } : null;
    case "year":
      return Number.isFinite(n(a)) ? { kind: "year", year: n(a) } : null;
    case "vs":
      return Number.isFinite(n(a)) && Number.isFinite(n(b)) ? { kind: "versus", baseline: Math.min(n(a), n(b)), recent: Math.max(n(a), n(b)) } : null;
    case "default":
      return { kind: "default" };
    default:
      return null;
  }
}

/** Reads the question from the URL: the text first, then any chip overrides on top. */
export function queryFromParams(params: URLSearchParams): TrendQuery {
  const text = params.get("q")?.trim() ?? "";
  const parsed = parseTrendQuery(text);
  const ind = params.get("ind");
  const dir = params.get("dir");
  const indicator = INDICATOR_IDS.includes(ind as IndicatorId) ? (ind as IndicatorId) : (parsed.indicator ?? "vegetation");
  const direction = DIRECTIONS.includes(dir as Direction) ? (dir as Direction) : parsed.direction;
  const seasonParam = params.get("season");
  let season = parsed.season;
  let months = parsed.months;
  if (seasonParam?.startsWith("m-")) {
    const list = seasonParam
      .slice(2)
      .split(".")
      .map(Number)
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    if (list.length) {
      months = [...new Set(list)];
      season = null;
    }
  } else if (seasonParam && seasonParam in SEASONS) {
    season = seasonParam as Exclude<SeasonId, "custom">;
    months = null;
  }
  const area = params.get("country") || params.get("osm") || params.get("poly") ? { country: params.get("country") ?? undefined, osm: params.get("osm") ?? undefined, poly: params.get("poly") ?? undefined, name: params.get("name") ?? undefined } : null;
  return {
    text,
    understood: parsed.isTrendQuery || Boolean(ind) || Boolean(area),
    indicator,
    direction,
    place: params.has("place") ? params.get("place") || null : parsed.place,
    near: params.has("place") ? params.get("near") === "1" : parsed.near,
    time: decodeTime(params.get("t")) ?? parsed.time,
    season,
    months,
    area,
  };
}

export type QueryEdit = Partial<Pick<TrendQuery, "indicator" | "direction" | "place" | "time" | "season" | "months">>;

/** URL for a chip edit: keeps the text, and writes every part explicitly so the edit sticks. */
export function paramsForEdit(current: URLSearchParams, query: TrendQuery, edit: QueryEdit): URLSearchParams {
  const next = new URLSearchParams(current);
  const merged = { ...query, ...edit };
  next.set("ind", merged.indicator);
  next.set("dir", merged.direction);
  if ("place" in edit || current.has("place")) {
    next.set("place", merged.place ?? "");
    next.delete("near");
    next.delete("country");
    next.delete("osm");
    next.delete("poly");
    next.delete("name");
  }
  next.set("t", encodeTime(merged.time));
  if ("months" in edit && edit.months) next.set("season", `m-${edit.months.join(".")}`);
  else if ("season" in edit) {
    if (edit.season) next.set("season", edit.season);
    else next.delete("season");
  }
  return next;
}

/** URL for a brand-new question typed into the box. */
export function paramsForText(text: string): URLSearchParams {
  return new URLSearchParams({ q: text.trim() });
}

export function directionLabel(direction: Direction): string {
  return direction === "decline" ? "Decline" : direction === "increase" ? "Increase" : "Any change";
}

export function periodLabel(plan: PeriodPlan): string {
  if (plan.kind === "comparison") return `${plan.baseline[0]} vs ${plan.recent[0]}`;
  return `${plan.startYear}→${plan.endYear}`;
}

function describeTime(time: TimeSpec): string {
  switch (time.kind) {
    case "since":
      return `since ${time.start}`;
    case "range":
      return `${time.start}–${time.end}`;
    case "last":
      return `last ${time.years} years`;
    case "year":
      return String(time.year);
    case "versus":
      return `${time.baseline} vs ${time.recent}`;
    default:
      return "last 10 years";
  }
}

/** "Vegetation · Decline · Uzbekistan · since 2015" — before anything is looked up. */
export function describeQuestion(parsed: ParsedQuery): string {
  return [parsed.indicator ? INDICATORS[parsed.indicator].label : "Vegetation", directionLabel(parsed.direction), parsed.place ? `${parsed.near ? "near " : ""}${parsed.place}` : "map view", describeTime(parsed.time)].join(" · ");
}

/** "Vegetation · Decline · Uzbekistan · 2015→2025 · Apr–Sep" */
export function interpretation(query: TrendQuery, areaName: string | null, plan: PeriodPlan | null, months: number[]): string {
  return [INDICATORS[query.indicator].label, directionLabel(query.direction), areaName ?? query.place ?? "Map view", plan ? periodLabel(plan) : null, monthsLabel(months)]
    .filter(Boolean)
    .join(" · ");
}

/** "Top 10 areas with vegetation decline in Uzbekistan, 2015→2025" */
export function resultsHeading(count: number, query: TrendQuery, area: ScanArea, plan: PeriodPlan): string {
  const what = INDICATORS[query.indicator].words[query.direction];
  const where = area.kind === "view" ? "in the map view" : area.name.startsWith("Around ") ? `around the ${area.name.slice(7)}` : `in ${area.name}`;
  if (!count) return `No areas with ${what} ${where}, ${periodLabel(plan)}`;
  if (count === 1) return `One area with ${what} ${where}, ${periodLabel(plan)}`;
  return `Top ${count} areas with ${what} ${where}, ${periodLabel(plan)}`;
}

/** "The year-round average", "The Apr–Sep average" — used as a sentence subject. */
export function seasonAverage(months: number[]): string {
  return months.length >= 12 ? "The year-round average" : `The ${monthsLabel(months)} average`;
}

export function hotspotTitle(hotspot: Hotspot): string {
  return hotspot.label ?? `Area ${hotspot.rank}`;
}

/** The month shown in "then vs now" comparisons: the middle of the season. */
export function representativeMonth(months: number[]): number {
  const year = seasonYearMonths(2001, months);
  return Number(year[Math.floor((year.length - 1) / 2)].slice(5, 7));
}

function mid([a, b]: [number, number]): number {
  return Math.round((a + b) / 2);
}

/** Opens the full analysis for the hotspot's own outline and the scanned period. */
export function analysisHref(hotspot: Hotspot, query: TrendQuery, area: ScanArea, plan: PeriodPlan, latestMonth: string): string {
  const end = `${plan.endYear}-12` > latestMonth ? latestMonth : `${plan.endYear}-12`;
  const params = new URLSearchParams({
    poly: encodeGeometry(hotspot.geometry),
    name: hotspotTitle(hotspot),
    ctx: `${area.kind === "view" ? "Map view" : area.name} · ${formatArea(hotspot.areaKm2)}`,
    period: "custom",
    start: `${plan.startYear}-01`,
    end,
  });
  const dataset = INDICATORS[query.indicator].dataset;
  params.set("ds", dataset === "climate" ? "climate,vegetation" : `${dataset},climate`);
  return `/analysis?${params}`;
}

/** Swipe view of the same layer: a baseline season on the left, a recent one on the right. */
export function compareHref(hotspot: Hotspot, query: TrendQuery, plan: PeriodPlan, months: number[]): string {
  const month = representativeMonth(months);
  const yearFor = (seasonYear: number) => Number(seasonYearMonths(seasonYear, months).find((m) => Number(m.slice(5, 7)) === month)?.slice(0, 4) ?? seasonYear);
  const date = (seasonYear: number) => `${yearFor(seasonYear)}-${String(month).padStart(2, "0")}-01`;
  const zoom = hotspot.areaKm2 > 50_000 ? 5 : hotspot.areaKm2 > 5_000 ? 7 : hotspot.areaKm2 > 500 ? 8 : 9;
  const layer = INDICATORS[query.indicator].layerId;
  return `/split?${new URLSearchParams({
    left: layer,
    right: layer,
    leftDate: date(mid(plan.baseline)),
    rightDate: date(mid(plan.recent)),
    lat: hotspot.center[0].toFixed(4),
    lon: hotspot.center[1].toFixed(4),
    z: String(zoom),
  })}`;
}

export function seasonDescription(months: number[]): string {
  return months.length >= 12 ? "every month of the year" : `${monthsLabel(months)} each year`;
}

export function formatMonthRange(months: string[]): string {
  if (!months.length) return "";
  return months.length === 1 ? formatMonth(months[0], "long") : `${formatMonth(months[0])} – ${formatMonth(months[months.length - 1])}`;
}
