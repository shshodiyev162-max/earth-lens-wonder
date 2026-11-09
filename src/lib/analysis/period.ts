// The analysis period: a preset (1–20 years or all data), any custom month range, or a baseline
// period compared with a later one — optionally limited to a season or chosen months. Everything is
// read from and written to the URL so a report can be shared exactly.

import { addMonthsToMonth, formatMonth, monthRange } from "../gibs/time";
import { SEASONS, monthsLabel, seasonMonths, type SeasonId } from "../query/indicators";
import { monthsOfSeasonYear, type YearSpan } from "./aggregate";

/** First month of the MODIS record (Terra's first full month of science data). */
export const EARLIEST_MONTH = "2000-03";
export const EARLIEST_YEAR = 2000;

export type PresetId = "1y" | "5y" | "10y" | "20y" | "all";
export type PeriodKind = PresetId | "custom" | "compare";
export type { YearSpan };
export type SeasonChoice = Exclude<SeasonId, "custom">;

export const PERIOD_PRESETS: { id: PresetId; label: string; years: number | null }[] = [
  { id: "1y", label: "1 year", years: 1 },
  { id: "5y", label: "5 years", years: 5 },
  { id: "10y", label: "10 years", years: 10 },
  { id: "20y", label: "20 years", years: 20 },
  { id: "all", label: "All data", years: null },
];

/** Twenty years: long enough for the trend tests to tell a real change from normal ups and downs. */
export const DEFAULT_PERIOD: PresetId = "20y";

export interface PeriodSelection {
  kind: PeriodKind;
  /** First and last month covered (YYYY-MM). For comparisons: from the baseline's start to the comparison's end. */
  start: string;
  end: string;
  /** Comparisons only: whole years, inclusive. */
  baseline: YearSpan | null;
  recent: YearSpan | null;
  /** "all" = every month. */
  season: SeasonChoice;
  /** Calendar months (1–12) picked one by one; overrides `season`. */
  customMonths: number[] | null;
  /** What was adjusted while reading the link (e.g. a start before 2000). */
  notes: string[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Last complete month that NASA's monthly products normally cover. */
export function defaultEndMonth(now = new Date()): string {
  const date = new Date(now.getTime() - 33 * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last calendar year with all twelve months published. */
export function lastCompleteYear(latest = defaultEndMonth()): number {
  const year = Number(latest.slice(0, 4));
  return latest.endsWith("-12") ? year : year - 1;
}

/** Default comparison: the first decade of the record against the last complete decade. */
export function defaultComparison(latest = defaultEndMonth()): { baseline: YearSpan; recent: YearSpan } {
  const last = lastCompleteYear(latest);
  return { baseline: [2001, 2010], recent: [last - 9, last] };
}

export function presetRange(preset: PresetId, latest = defaultEndMonth()): { start: string; end: string } {
  const option = PERIOD_PRESETS.find((p) => p.id === preset) ?? PERIOD_PRESETS[3];
  if (option.years === null) return { start: EARLIEST_MONTH, end: latest };
  const start = addMonthsToMonth(latest, -(option.years * 12 - 1));
  return { start: start < EARLIEST_MONTH ? EARLIEST_MONTH : start, end: latest };
}

function parseSpan(value: string | null): YearSpan | null {
  const match = value?.match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return a <= b ? [a, b] : [b, a];
}

export function formatSpan(span: YearSpan): string {
  return span[0] === span[1] ? String(span[0]) : `${span[0]}–${span[1]}`;
}

function clampSpan(span: YearSpan, lastYear: number, notes: string[], label: string): YearSpan {
  const next: YearSpan = [Math.max(EARLIEST_YEAR, Math.min(span[0], lastYear)), Math.max(EARLIEST_YEAR, Math.min(span[1], lastYear))];
  if (next[0] !== span[0] || next[1] !== span[1]) notes.push(`The ${label} period was moved to ${formatSpan(next)}, inside the NASA record (${EARLIEST_YEAR}–${lastYear}).`);
  return next;
}

function parseSeason(value: string | null): { season: SeasonChoice; customMonths: number[] | null } {
  if (value?.startsWith("m-")) {
    const list = [...new Set(value.slice(2).split(".").map(Number))].filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
    if (list.length && list.length < 12) return { season: "all", customMonths: list };
    return { season: "all", customMonths: null };
  }
  if (value && value in SEASONS) return { season: value as SeasonChoice, customMonths: null };
  return { season: "all", customMonths: null };
}

/** Reads the period from the page address; anything missing or invalid falls back to the default period. */
export function readPeriod(params: URLSearchParams, latest = defaultEndMonth()): PeriodSelection {
  const notes: string[] = [];
  const { season, customMonths } = parseSeason(params.get("season"));
  const base = { baseline: null, recent: null, season, customMonths, notes };
  let kind = params.get("period") ?? DEFAULT_PERIOD;
  // Links made before presets were in years.
  if (kind === "12") kind = "1y";
  if (kind === "60") kind = "5y";
  if (kind === "24") return { ...base, kind: "custom", start: addMonthsToMonth(latest, -23), end: latest };

  if (kind === "compare") {
    const lastYear = Number(latest.slice(0, 4));
    const fallback = defaultComparison(latest);
    let baseline = clampSpan(parseSpan(params.get("base")) ?? fallback.baseline, lastYear, notes, "baseline");
    let recent = clampSpan(parseSpan(params.get("recent")) ?? fallback.recent, lastYear, notes, "comparison");
    if (recent[0] < baseline[0]) [baseline, recent] = [recent, baseline];
    const start = `${baseline[0]}-01` < EARLIEST_MONTH ? EARLIEST_MONTH : `${baseline[0]}-01`;
    const end = `${recent[1]}-12` > latest ? latest : `${recent[1]}-12`;
    return { ...base, kind: "compare", start, end, baseline, recent };
  }

  if (kind === "custom") {
    let start = params.get("start") ?? "";
    let end = params.get("end") ?? "";
    if (MONTH_RE.test(start) && MONTH_RE.test(end)) {
      if (start > end) [start, end] = [end, start];
      if (start < EARLIEST_MONTH) {
        notes.push(`NASA's satellite record starts in ${formatMonth(EARLIEST_MONTH, "long")}, so the period starts there.`);
        start = EARLIEST_MONTH;
      }
      if (end > latest) {
        notes.push(`NASA's monthly maps reach ${formatMonth(latest, "long")} at the moment, so the period ends there.`);
        end = latest;
      }
      if (start > end) start = end;
      return { ...base, kind: "custom", start, end };
    }
    kind = DEFAULT_PERIOD;
  }

  const preset = (PERIOD_PRESETS.some((p) => p.id === kind) ? kind : DEFAULT_PERIOD) as PresetId;
  return { ...base, kind: preset, ...presetRange(preset, latest) };
}

export interface PeriodEdit {
  kind?: PeriodKind;
  start?: string;
  end?: string;
  baseline?: YearSpan;
  recent?: YearSpan;
  season?: SeasonChoice;
  customMonths?: number[] | null;
}

/** Applies a change to the period on top of the current page address. */
export function writePeriod(current: URLSearchParams, selection: PeriodSelection, edit: PeriodEdit): URLSearchParams {
  const next = new URLSearchParams(current);
  const kind = edit.kind ?? selection.kind;
  ["period", "start", "end", "base", "recent"].forEach((key) => next.delete(key));
  if (kind !== DEFAULT_PERIOD) next.set("period", kind);
  if (kind === "custom") {
    next.set("start", edit.start ?? selection.start);
    next.set("end", edit.end ?? selection.end);
  }
  if (kind === "compare") {
    const fallback = defaultComparison();
    next.set("base", formatSpan(edit.baseline ?? selection.baseline ?? fallback.baseline));
    next.set("recent", formatSpan(edit.recent ?? selection.recent ?? fallback.recent));
  }
  const customMonths = edit.customMonths !== undefined ? edit.customMonths : edit.season !== undefined ? null : selection.customMonths;
  const season = edit.season ?? (edit.customMonths ? "all" : selection.season);
  if (customMonths?.length && customMonths.length < 12) next.set("season", `m-${[...customMonths].sort((a, b) => a - b).join(".")}`);
  else if (season !== "all") next.set("season", season);
  else next.delete("season");
  return next;
}

/** Calendar months included (1–12), with seasons flipped for places south of the equator. */
export function selectionMonths(selection: PeriodSelection, latitude = 0): number[] {
  if (selection.customMonths?.length) return selection.customMonths;
  return seasonMonths(selection.season, latitude);
}

/** Every month (YYYY-MM) the analysis reads, oldest first. */
export function requestedMonths(selection: PeriodSelection, latitude = 0, latest = defaultEndMonth()): string[] {
  const months = selectionMonths(selection, latitude);
  if (selection.kind === "compare" && selection.baseline && selection.recent) {
    const out = new Set<string>();
    for (const span of [selection.baseline, selection.recent]) {
      for (let year = span[0]; year <= span[1]; year++) {
        for (const month of monthsOfSeasonYear(year, months)) if (month >= EARLIEST_MONTH && month <= latest) out.add(month);
      }
    }
    return [...out].sort();
  }
  const wanted = new Set(months);
  return monthRange(selection.start, selection.end).filter((m) => wanted.has(Number(m.slice(5, 7))));
}

/** "Apr–Sep only", or "" for all months. */
export function seasonPhrase(months: number[]): string {
  return months.length >= 12 ? "" : `${monthsLabel(months)} only`;
}

/** "Sep 2016 – Aug 2026" or "2001–2010 vs 2016–2025", plus the months when filtered. */
export function describePeriod(selection: PeriodSelection, months: number[], style: "short" | "long" = "short"): string {
  const range =
    selection.kind === "compare" && selection.baseline && selection.recent
      ? `${formatSpan(selection.baseline)} vs ${formatSpan(selection.recent)}`
      : `${formatMonth(selection.start, style)} – ${formatMonth(selection.end, style)}`;
  const season = seasonPhrase(months);
  return season ? `${range} · ${season}` : range;
}

/** Reasons the period can't be analysed as chosen (shown instead of running). */
export function periodProblems(selection: PeriodSelection, monthCount: number): string[] {
  const problems: string[] = [];
  if (selection.kind === "compare" && selection.baseline && selection.recent && selection.recent[0] <= selection.baseline[1]) {
    problems.push(`The two periods overlap (${formatSpan(selection.baseline)} and ${formatSpan(selection.recent)}). Pick a comparison period that starts after ${selection.baseline[1]}.`);
  }
  if (!problems.length && monthCount === 0) problems.push("No month in this period matches the chosen months. Pick a longer period or other months.");
  return problems;
}

/** Friendly hints that don't stop the analysis. */
export function periodHints(selection: PeriodSelection, months: number[], monthCount: number): string[] {
  const hints: string[] = [];
  if (selection.kind === "compare" && selection.baseline && selection.recent) {
    const shortest = Math.min(selection.baseline[1] - selection.baseline[0], selection.recent[1] - selection.recent[0]) + 1;
    if (shortest < 3) hints.push("Each period has fewer than 3 years, so a difference can't be tested for significance. Use 5–10 years each for a fair comparison.");
  } else if (monthCount < 24 && months.length >= 12) {
    hints.push("A trend needs at least 2 years of data; shorter periods show the values and year-on-year changes only.");
  }
  return hints;
}

// ---------------------------------------------------------------------------
// How long it takes

/** Above this many monthly maps the analysis waits for a click instead of starting by itself. */
export const LARGE_RUN_MAPS = 500;

/** NASA GIBS returned 0.25–0.3 s per monthly map with six requests at a time (measured, Oct 2026). */
export function estimateSeconds(maps: number, climateRequests: number): [number, number] {
  return [maps * 0.22 + climateRequests * 1, maps * 0.6 + climateRequests * 6];
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const minutes = seconds / 60;
  return minutes < 10 ? `${Math.round(minutes * 2) / 2} min` : `${Math.round(minutes)} min`;
}

export function formatEstimate([low, high]: [number, number]): string {
  const a = formatSeconds(low);
  const b = formatSeconds(high);
  return a === b ? `about ${a}` : `about ${a} – ${b}`;
}
