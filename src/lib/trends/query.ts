// The Trends page's search as URL state: the measures, place, period and months to scan, plus
// how the results are filtered — and the sentence that says all of it in words. Every search,
// and every adjustment of it, is a shareable link.

import { formatArea } from "../geo/geometry";
import { encodeGeometryForLink } from "../geo/polyline";
import { formatMonth } from "../gibs/time";
import { INDICATOR_ORDER, INDICATORS, monthsLabel, SEASONS, type Direction, type IndicatorId, type SeasonId } from "../query/indicators";
import { parseTrendQuery, type ParsedQuery, type ReaderNote, type TimeSpec } from "../query/parse";
import { seasonYearMonths, type PeriodPlan } from "../query/period";
import type { Hotspot, HotspotFilter } from "./hotspots";
import type { ScanArea } from "./place";

export type SeasonChoice = Exclude<SeasonId, "custom">;

/** How one measure's results are filtered — changing it never needs a new scan. */
export type ResultFilter = HotspotFilter;

export interface TrendQuery {
  /** The sentence in the question box: typed, or written from the choices after an edit. */
  text: string;
  /** At least one measure to scan. */
  understood: boolean;
  /** Measures to scan, in INDICATOR_ORDER. */
  indicators: IndicatorId[];
  filters: Partial<Record<IndicatorId, ResultFilter>>;
  place: string | null;
  near: boolean;
  time: TimeSpec;
  /** null = each measure's usual season. */
  season: SeasonChoice | null;
  /** Explicit months (overrides the season). */
  months: number[] | null;
  /** An exact area handed over from another page (Analysis "Show on map"). */
  area: { country?: string; osm?: string; poly?: string; name?: string } | null;
  /** Things the reader couldn't measure, with the closest measures (from the typed text). */
  notes: ReaderNote[];
  /** The measure whose results are shown. */
  tab: IndicatorId | null;
}

export const DEFAULT_FILTER: Omit<ResultFilter, "direction"> = { minFactor: 1, minAreaKm2: 0, strict: false };
const DIRECTIONS: Direction[] = ["decline", "increase", "any"];
const isIndicator = (value: string): value is IndicatorId => (INDICATOR_ORDER as string[]).includes(value);

export function filterFor(query: TrendQuery, indicator: IndicatorId): ResultFilter {
  return query.filters[indicator] ?? { direction: "any", ...DEFAULT_FILTER };
}

// ---------------------------------------------------------------------------
// Time

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

// ---------------------------------------------------------------------------
// URL ⇄ search

function decodeSeason(value: string | null): { season: SeasonChoice | null; months: number[] | null } | null {
  if (!value) return null;
  if (value.startsWith("m-")) {
    const list = [...new Set(value.slice(2).split(".").map(Number))].filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
    return list.length ? { season: null, months: list } : null;
  }
  if (value === "usual") return { season: null, months: null };
  return value in SEASONS ? { season: value as SeasonChoice, months: null } : null;
}

function encodeSeason(season: SeasonChoice | null, months: number[] | null): string | null {
  if (months?.length) return `m-${[...months].sort((a, b) => a - b).join(".")}`;
  return season;
}

/** "decline" for every measure, or "vegetation:decline,heat:increase". */
function decodeDirections(value: string | null, indicators: IndicatorId[]): Partial<Record<IndicatorId, Direction>> | null {
  if (!value) return null;
  if (DIRECTIONS.includes(value as Direction)) return Object.fromEntries(indicators.map((id) => [id, value as Direction]));
  const out: Partial<Record<IndicatorId, Direction>> = {};
  for (const part of value.split(",")) {
    const [id, direction] = part.split(":");
    if (isIndicator(id) && DIRECTIONS.includes(direction as Direction)) out[id] = direction as Direction;
  }
  return out;
}

function encodeDirections(query: TrendQuery): string {
  const values = query.indicators.map((id) => filterFor(query, id).direction);
  if (values.length && values.every((d) => d === values[0])) return values[0];
  return query.indicators.map((id, i) => `${id}:${values[i]}`).join(",");
}

/** Filters other than direction: "vegetation~2~50~1" (factor, smallest km², strict). */
function decodeFilters(value: string | null): Partial<Record<IndicatorId, Omit<ResultFilter, "direction">>> {
  const out: Partial<Record<IndicatorId, Omit<ResultFilter, "direction">>> = {};
  for (const part of value?.split(",") ?? []) {
    const [id, factor, area, strict] = part.split("~");
    if (!isIndicator(id)) continue;
    const minFactor = Number(factor);
    const minAreaKm2 = Number(area);
    out[id] = {
      minFactor: Number.isFinite(minFactor) && minFactor > 0 && minFactor <= 10 ? minFactor : 1,
      minAreaKm2: Number.isFinite(minAreaKm2) && minAreaKm2 >= 0 ? minAreaKm2 : 0,
      strict: strict === "1",
    };
  }
  return out;
}

function encodeFilters(query: TrendQuery): string {
  return query.indicators
    .map((id) => ({ id, f: filterFor(query, id) }))
    .filter(({ f }) => f.minFactor !== DEFAULT_FILTER.minFactor || f.minAreaKm2 !== DEFAULT_FILTER.minAreaKm2 || f.strict)
    .map(({ id, f }) => `${id}~${f.minFactor}~${f.minAreaKm2}~${f.strict ? 1 : 0}`)
    .join(",");
}

/** Reads the search from the URL: the typed text first, then the choices written on top of it. */
export function queryFromParams(params: URLSearchParams): TrendQuery {
  const text = params.get("q")?.trim() ?? "";
  const parsed = parseTrendQuery(text);
  const ind = params.get("ind");
  const listed = ind?.split(",").filter(isIndicator);
  const wanted = new Set(ind === "all" ? INDICATOR_ORDER : listed?.length ? listed : parsed.indicators);
  const indicators = INDICATOR_ORDER.filter((id) => wanted.has(id));

  const directions = decodeDirections(params.get("dir"), indicators) ?? parsed.directions;
  const extra = decodeFilters(params.get("f"));
  const filters: Partial<Record<IndicatorId, ResultFilter>> = {};
  for (const id of indicators) filters[id] = { direction: directions[id] ?? "any", ...DEFAULT_FILTER, ...extra[id] };

  const seasonChoice = decodeSeason(params.get("season")) ?? { season: parsed.season, months: parsed.months };
  const area =
    params.get("country") || params.get("osm") || params.get("poly")
      ? { country: params.get("country") ?? undefined, osm: params.get("osm") ?? undefined, poly: params.get("poly") ?? undefined, name: params.get("name") ?? undefined }
      : null;
  const tab = params.get("tab");
  return {
    text,
    understood: indicators.length > 0,
    indicators,
    filters,
    // An exact area from the map wins over any place named in the words.
    place: area ? null : params.has("place") ? params.get("place") || null : parsed.place,
    near: area ? false : params.has("place") ? params.get("near") === "1" : parsed.near,
    time: decodeTime(params.get("t")) ?? parsed.time,
    season: seasonChoice.season,
    months: seasonChoice.months,
    area,
    // The reader's notes describe the typed words; once the choices are edited they no longer apply.
    notes: ind ? [] : parsed.notes,
    tab: tab && indicators.includes(tab as IndicatorId) ? (tab as IndicatorId) : (indicators[0] ?? null),
  };
}

export type QueryEdit = Partial<Pick<TrendQuery, "indicators" | "place" | "near" | "area" | "time" | "season" | "months" | "filters" | "tab">>;

/** An exact area chosen on the map: a country, a drawn or saved outline, or a hotspot. */
export type ExactArea = NonNullable<TrendQuery["area"]>;

/** Applies a change and writes every choice into the URL, with the sentence rewritten to match. */
export function applyEdit(query: TrendQuery, edit: QueryEdit): TrendQuery {
  const next: TrendQuery = { ...query, ...edit };
  if (edit.indicators) {
    next.indicators = INDICATOR_ORDER.filter((id) => edit.indicators?.includes(id));
    const filters: Partial<Record<IndicatorId, ResultFilter>> = {};
    for (const id of next.indicators) filters[id] = edit.filters?.[id] ?? query.filters[id] ?? { direction: "any", ...DEFAULT_FILTER };
    next.filters = filters;
  }
  if ("place" in edit && !("near" in edit)) next.near = false;
  if ("place" in edit && !("area" in edit)) next.area = null;
  // An outline picked on the map replaces any typed place.
  if (edit.area) {
    next.place = null;
    next.near = false;
  }
  if ("months" in edit && edit.months) next.season = null;
  if ("season" in edit) next.months = edit.months ?? null;
  if (!next.tab || !next.indicators.includes(next.tab)) next.tab = next.indicators[0] ?? null;
  next.understood = next.indicators.length > 0;
  next.notes = [];
  // Rewrite the words only when they would say something different (not for a slider or a tab).
  const words = sentenceFor(next);
  if (next.indicators.length && words !== sentenceFor(query)) next.text = words;
  return next;
}

export function paramsFor(query: TrendQuery): URLSearchParams {
  const next = new URLSearchParams();
  if (query.text) next.set("q", query.text);
  next.set("ind", query.indicators.join(","));
  if (query.indicators.length) next.set("dir", encodeDirections(query));
  const filters = encodeFilters(query);
  if (filters) next.set("f", filters);
  if (query.area) {
    for (const key of ["country", "osm", "poly", "name"] as const) if (query.area[key]) next.set(key, query.area[key] as string);
  } else {
    next.set("place", query.place ?? "");
    if (query.near) next.set("near", "1");
  }
  next.set("t", encodeTime(query.time));
  next.set("season", encodeSeason(query.season, query.months) ?? "usual");
  if (query.tab && query.tab !== query.indicators[0]) next.set("tab", query.tab);
  return next;
}

/** URL for a brand-new question typed into the box. */
export function paramsForText(text: string): URLSearchParams {
  return new URLSearchParams({ q: text.trim() });
}

/** Everything that decides what is scanned (not how results are filtered). */
export function scanKey(query: TrendQuery): string {
  return JSON.stringify([query.indicators, query.place, query.near, query.area, encodeTime(query.time), encodeSeason(query.season, query.months)]);
}

// ---------------------------------------------------------------------------
// The sentence

const NOUN: Record<IndicatorId, string> = {
  vegetation: "vegetation",
  heat: "heat",
  rainfall: "rainfall",
  soil: "soil moisture",
  dust: "dust",
  snow: "snow cover",
};
const DIRECTION_WORD: Record<Direction, string> = { decline: "decline", increase: "increase", any: "change" };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function joinWords(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function timePhrase(time: TimeSpec): string {
  switch (time.kind) {
    case "since":
      return `since ${time.start}`;
    case "range":
      return `from ${time.start} to ${time.end}`;
    case "last":
      return `over the last ${time.years} years`;
    case "year":
      return `in ${time.year}`;
    case "versus":
      return `${time.baseline} vs ${time.recent}`;
    default:
      return "";
  }
}

function monthsPhrase(season: SeasonChoice | null, months: number[] | null): string {
  if (months?.length) {
    const set = new Set(months);
    const start = months.find((m) => !set.has(((m + 10) % 12) + 1));
    const run: number[] = [];
    if (start !== undefined) for (let m = start, i = 0; set.has(m) && i < 12; m = (m % 12) + 1, i++) run.push(m);
    if (months.length === 1) return `in ${MONTH_NAMES[months[0] - 1]}`;
    if (run.length === months.length && months.length < 12) return `${MONTH_NAMES[run[0] - 1]} to ${MONTH_NAMES[run[run.length - 1] - 1]}`;
    return joinWords([...months].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]));
  }
  switch (season) {
    case "all":
      return "all year round";
    case "growing":
      return "during the growing season";
    case "cold":
      return "during the snow season";
    case null:
      return "";
    default:
      return `in ${season}`;
  }
}

/**
 * The search in words, e.g. "Vegetation and rainfall decline in Uzbekistan since 2015, April to
 * September". Reading it back gives the same choices (see the round-trip test).
 */
export function sentenceFor(query: Pick<TrendQuery, "indicators" | "filters" | "place" | "near" | "area" | "time" | "season" | "months">): string {
  const ids = INDICATOR_ORDER.filter((id) => query.indicators.includes(id));
  if (!ids.length) return "";
  const directions = ids.map((id) => query.filters[id]?.direction ?? "any");
  const shared = directions.every((d) => d === directions[0]) ? directions[0] : null;
  let what: string;
  if (ids.length === INDICATOR_ORDER.length && shared) {
    what = shared === "any" ? "Everything that changed" : `Everything that ${shared === "decline" ? "declined" : "increased"}`;
  } else if (shared) {
    what = `${joinWords(ids.map((id) => NOUN[id]))} ${DIRECTION_WORD[shared]}`;
  } else {
    what = joinWords(ids.map((id, i) => `${NOUN[id]} ${DIRECTION_WORD[directions[i]]}`));
  }
  const placeName = query.area?.name ?? query.place;
  const where = placeName ? `${query.near && !query.area ? "near" : "in"} ${placeName}` : "in the map view";
  let when = timePhrase(query.time);
  let months = monthsPhrase(query.season, query.months);
  // "summer 2003 vs summer 2023", "July 2003 vs July 2023"
  if (query.time.kind === "versus") {
    const word = query.months?.length === 1 ? MONTH_NAMES[query.months[0] - 1] : query.season && ["summer", "winter", "spring", "autumn"].includes(query.season) ? query.season : null;
    if (word) {
      when = `${word} ${query.time.baseline} vs ${word} ${query.time.recent}`;
      months = "";
    }
  }
  const head = query.time.kind === "versus" ? `${what} ${where}, ${when}` : [what, where, when].filter(Boolean).join(" ");
  const sentence = months ? `${head}, ${months}` : head;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ---------------------------------------------------------------------------
// Labels

export function directionLabel(direction: Direction): string {
  return direction === "decline" ? "Declines" : direction === "increase" ? "Increases" : "Both";
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

/** "Vegetation + Rainfall · Decline · Uzbekistan · since 2015" — shown in the search boxes. */
export function describeQuestion(parsed: ParsedQuery): string {
  const values = parsed.indicators.map((id) => parsed.directions[id] ?? "any");
  const what = parsed.everything
    ? "All six measures"
    : parsed.indicators.length
      ? parsed.indicators.map((id) => INDICATORS[id].label).join(" + ")
      : `Closest measures for “${parsed.notes[0]?.phrase ?? parsed.text}”`;
  const how = !values.length ? null : values.every((d) => d === values[0]) ? { decline: "Decline", increase: "Increase", any: "Any change" }[values[0]] : "Mixed";
  return [what, how, parsed.place ? `${parsed.near ? "near " : ""}${parsed.place}` : "map view", describeTime(parsed.time)].filter(Boolean).join(" · ");
}

/** "Top 10 areas with vegetation decline in Uzbekistan, 2015→2025" */
export function resultsHeading(count: number, indicator: IndicatorId, direction: Direction, area: ScanArea, plan: PeriodPlan): string {
  const what = INDICATORS[indicator].words[direction];
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
export function analysisHref(hotspot: Hotspot, indicator: IndicatorId, area: ScanArea, plan: PeriodPlan, latestMonth: string): string {
  const end = `${plan.endYear}-12` > latestMonth ? latestMonth : `${plan.endYear}-12`;
  const params = new URLSearchParams({
    poly: encodeGeometryForLink(hotspot.geometry),
    name: hotspotTitle(hotspot),
    ctx: `${area.kind === "view" ? "Map view" : area.name} · ${formatArea(hotspot.areaKm2)}`,
    period: "custom",
    start: `${plan.startYear}-01`,
    end,
  });
  const dataset = INDICATORS[indicator].dataset;
  params.set("ds", dataset === "climate" ? "climate,vegetation" : `${dataset},climate`);
  return `/analysis?${params}`;
}

/** Swipe view of the same layer: a baseline season on the left, a recent one on the right. */
export function compareHref(hotspot: Hotspot, indicator: IndicatorId, plan: PeriodPlan, months: number[]): string {
  const month = representativeMonth(months);
  const yearFor = (seasonYear: number) => Number(seasonYearMonths(seasonYear, months).find((m) => Number(m.slice(5, 7)) === month)?.slice(0, 4) ?? seasonYear);
  const date = (seasonYear: number) => `${yearFor(seasonYear)}-${String(month).padStart(2, "0")}-01`;
  const zoom = hotspot.areaKm2 > 50_000 ? 5 : hotspot.areaKm2 > 5_000 ? 7 : hotspot.areaKm2 > 500 ? 8 : 9;
  const layer = INDICATORS[indicator].layerId;
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
