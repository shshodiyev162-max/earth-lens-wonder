// Turns the measured series into plain words. Nothing here is invented: every sentence is computed
// from the numbers returned by NASA GIBS and NASA POWER. The answer comes from the trend tests alone:
// one month's reading or one hot summer says nothing about whether a place is changing.

import { formatMonth } from "../gibs/time";
import { formatValue, type MetricDef } from "./metrics";
import { formatSpan, seasonPhrase } from "./period";
import { explainVerdict, extremes, formatP, mean, signed, SIGNIFICANCE, sum, validValues, type MonthlyValue } from "./stats";
import { analysisTrends, directionOf, isConcerning, periodOf, type MetricTrend } from "./trend";
import type { AnalysisResult, ClimatePoint, DatasetId } from "./types";

export type Tone = "positive" | "neutral" | "warning";

export interface Finding {
  id: string;
  dataset: DatasetId;
  tone: Tone;
  title: string;
  detail: string;
}

/** One figure in "the latest months against the 2001–2020 normal". */
export interface RecentFigure {
  id: "temp" | "rain" | "soil" | "solar";
  label: string;
  value: string;
  note: string;
}

export interface RecentConditions {
  from: string;
  to: string;
  months: number;
  figures: RecentFigure[];
}

export interface TrendCounts {
  rising: number;
  falling: number;
  steady: number;
  untested: number;
}

export interface InsightReport {
  /** The answer in a sentence, from the tests alone. */
  headline: string;
  /** How it was tested and how far to trust it. */
  summary: string;
  counts: TrendCounts;
  findings: Finding[];
  recent: RecentConditions | null;
  caveats: string[];
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A word for how green an NDVI value is. */
function ndviClass(value: number): string {
  if (value < 0.1) return "barren land, desert, rock or built-up surfaces";
  if (value < 0.2) return "sparse vegetation";
  if (value < 0.4) return "moderate vegetation such as grassland, shrubs or crops";
  if (value < 0.6) return "dense vegetation";
  return "very dense vegetation";
}

function aodClass(value: number): string {
  if (value < 0.1) return "clean air";
  if (value < 0.2) return "slightly hazy air";
  if (value < 0.4) return "hazy air";
  return "very hazy or dusty air";
}

/** "Typical month: 0.21 (sparse vegetation). Highest 0.42 in July 2021, lowest 0.05 in January 2008." */
export function levelNote(metric: MetricDef, values: MonthlyValue[]): string | null {
  const valid = validValues(values);
  const ext = extremes(values);
  if (!valid.length || !ext) return null;
  const typical = mean(valid);
  const word = metric.id === "ndvi" ? ndviClass(typical) : metric.id === "aod" ? aodClass(typical) : null;
  const decimals = metric.unit ? metric.decimals : Math.min(metric.decimals, 2);
  const show = (value: number) => formatValue(value, metric, decimals);
  return `Typical month: ${show(typical)}${word ? ` (${word})` : ""}. Highest ${show(ext.max.value as number)} in ${formatMonth(ext.max.month, "long")}, lowest ${show(ext.min.value as number)} in ${formatMonth(ext.min.month, "long")}.`;
}

/**
 * The latest months against the 2001–2020 normal for the same calendar months. This is what the
 * normals are for: a whole period's rainfall total would mean nothing beside them.
 */
export function recentConditions(points: ClimatePoint[], count = 12): RecentConditions | null {
  const latest = points.filter((p) => p.temp !== null || p.precip !== null).slice(-count);
  if (!latest.length) return null;
  const figures: RecentFigure[] = [];

  const temps = latest.filter((p) => p.temp !== null && p.tempNormal !== null);
  if (temps.length) {
    const gap = mean(temps.map((p) => (p.temp as number) - (p.tempNormal as number)));
    figures.push({ id: "temp", label: "Air temperature", value: `${signed(gap)} °C`, note: Math.abs(gap) < 0.05 ? "same as normal" : gap > 0 ? "warmer than normal" : "cooler than normal" });
  }
  const rain = latest.filter((p) => p.precip !== null && p.precipNormal !== null);
  const rainNormal = sum(rain.map((p) => p.precipNormal as number));
  if (rain.length && rainNormal > 1) {
    const total = sum(rain.map((p) => p.precip as number));
    figures.push({ id: "rain", label: "Rainfall", value: `${Math.round((total / rainNormal) * 100)}%`, note: `of normal (${Math.round(total)} mm vs ${Math.round(rainNormal)} mm)` });
  }
  const soil = latest.filter((p) => p.soil !== null && p.soilNormal !== null);
  if (soil.length) {
    const gap = mean(soil.map((p) => (p.soil as number) - (p.soilNormal as number)));
    figures.push({ id: "soil", label: "Soil wetness", value: `${signed(gap, 0)} points`, note: Math.abs(gap) < 0.5 ? "same as normal" : gap > 0 ? "wetter than normal" : "drier than normal" });
  }
  const solar = latest.filter((p) => p.solar !== null && p.solarNormal !== null);
  const solarNormal = sum(solar.map((p) => p.solarNormal as number));
  if (solar.length && solarNormal > 0) {
    figures.push({ id: "solar", label: "Sunshine", value: `${Math.round((sum(solar.map((p) => p.solar as number)) / solarNormal) * 100)}%`, note: "of normal" });
  }
  return figures.length ? { from: latest[0].month, to: latest[latest.length - 1].month, months: latest.length, figures } : null;
}

function countTrends(trends: MetricTrend[]): TrendCounts {
  const counts: TrendCounts = { rising: 0, falling: 0, steady: 0, untested: 0 };
  for (const trend of trends) {
    const direction = directionOf(trend);
    if (direction === "increase") counts.rising += 1;
    else if (direction === "decline") counts.falling += 1;
    else if (trend.verdict || (trend.comparison && trend.comparison.label !== "Not enough years to test")) counts.steady += 1;
    else counts.untested += 1;
  }
  return counts;
}

/** The answer: which measures changed, and that the others didn't show a change. */
function buildHeadline(trends: MetricTrend[], counts: TrendCounts, comparing: boolean): string {
  const tested = counts.rising + counts.falling + counts.steady;
  if (!trends.length) return "No NASA readings for this area and period.";
  if (!tested) return comparing ? "Too few years in each period to test for a difference." : "Too few years to test for a trend.";
  const noChange = comparing ? "difference" : "trend";
  if (!counts.rising && !counts.falling) {
    return tested === 1 ? `No clear ${noChange} in ${trends[0].metric.noun}.` : `No clear ${noChange} in any of the ${tested} measures tested.`;
  }
  const names = (direction: "increase" | "decline") => trends.filter((t) => directionOf(t) === direction).map((t) => t.metric.noun);
  const clause = (list: string[], word: string) => `${joinWithAnd(list)} ${list.length > 1 ? "are" : "is"} ${word}`;
  const parts: string[] = [];
  if (counts.rising) parts.push(clause(names("increase"), comparing ? "higher" : "rising"));
  if (counts.falling) parts.push(clause(names("decline"), comparing ? "lower" : "falling"));
  const others = counts.steady ? ` ${counts.steady === 1 ? "The other measure shows" : `The other ${counts.steady} measures show`} no clear ${noChange}.` : "";
  return `${capitalise(parts.join(", and "))}.${others}`;
}

/** "Mar 2016 – Feb 2026 (Apr–Sep only)" or "2001–2010 and 2016–2025". */
export function describeResultPeriod(result: AnalysisResult): { text: string; comparing: boolean } {
  const period = periodOf(result);
  const months = seasonPhrase(period.calendarMonths);
  const range = period.compare ? `${formatSpan(period.compare.baseline)} and ${formatSpan(period.compare.recent)}` : `${formatMonth(result.start, "long")} – ${formatMonth(result.end, "long")}`;
  return { text: months ? `${range} (${months})` : range, comparing: Boolean(period.compare) };
}

/** What was tested, and what the answer can and can't say. */
function buildSummary(result: AnalysisResult, trends: MetricTrend[], counts: TrendCounts): string {
  const { compare } = periodOf(result);
  const tested = counts.rising + counts.falling + counts.steady;
  const sentences: string[] = [];
  if (compare) {
    sentences.push(`Each year became one value, and ${formatSpan(compare.baseline)} was compared with ${formatSpan(compare.recent)} using a t-test (a difference counts when p < 0.05).`);
  } else {
    const spans = trends.flatMap((t) => (t.verdict && t.span ? [t.span] : []));
    const from = spans.length ? Math.min(...spans.map((s) => s[0])) : null;
    const to = spans.length ? Math.max(...spans.map((s) => s[1])) : null;
    const years = from !== null && to !== null ? ` (${formatSpan([from, to])})` : "";
    sentences.push(`Each year became one value${years}, and each measure was tested for a steady rise or fall with the Mann–Kendall test (a trend counts when p < 0.05).`);
  }
  if (counts.steady) {
    sentences.push(`“No clear ${compare ? "difference" : "trend"}” means the test can't tell a change from normal ups and downs in this record. It doesn't prove nothing changed.`);
  }
  // Several tests at once: about 1 in 20 unchanging measures looks significant by chance.
  const borderline = trends.some((t) => directionOf(t) !== "none" && (t.verdict?.p ?? t.comparison?.p ?? 0) >= 0.01);
  if (tested >= 5 && borderline) {
    sentences.push(`With ${tested} measures tested at once, about 1 test in 20 can look real by chance, so treat a lone result close to p = ${SIGNIFICANCE} with care.`);
  }
  return sentences.join(" ");
}

function buildFindings(result: AnalysisResult, trends: MetricTrend[]): Finding[] {
  const findings: Finding[] = [];
  const { compare } = periodOf(result);
  for (const trend of trends) {
    const { metric, verdict, comparison } = trend;
    const direction = directionOf(trend);
    if (direction === "none") continue;
    const tone: Tone = isConcerning(metric, direction) ? "warning" : metric.concern === "none" ? "neutral" : "positive";
    if (comparison && compare && comparison.baselineMean !== null && comparison.recentMean !== null && comparison.change !== null && comparison.p !== null) {
      const percent = comparison.percent !== null ? `, ${signed(comparison.percent, Math.abs(comparison.percent) < 10 ? 1 : 0)}%` : "";
      findings.push({
        id: `compare-${metric.id}`,
        dataset: metric.dataset,
        tone,
        title: `${metric.label} significantly ${direction === "decline" ? "lower" : "higher"} in ${formatSpan(compare.recent)} than in ${formatSpan(compare.baseline)}`,
        detail: `Yearly average ${formatValue(comparison.baselineMean, metric)} then, ${formatValue(comparison.recentMean, metric)} now (${signed(comparison.change, metric.decimals)}${metric.unit ? ` ${metric.unit}` : ""}${percent}). Welch's t-test on the yearly values: ${formatP(comparison.p)}.`,
      });
    } else if (verdict) {
      findings.push({
        id: `trend-${metric.id}`,
        dataset: metric.dataset,
        tone,
        title: `${metric.label}: ${verdict.label.toLowerCase()}${trend.span ? `, ${formatSpan(trend.span)}` : ""}`,
        detail: explainVerdict(verdict, metric.subject, metric.unit, metric.decimals + 1),
      });
    }
  }
  return findings;
}

function buildCaveats(result: AnalysisResult): string[] {
  const caveats: string[] = [];
  const low = result.satellite.vegetation?.points.filter((p) => p.value !== null && p.coverage < 0.5).length ?? 0;
  if (low > 0) caveats.push(`${low} month(s) of vegetation data cover less than half of the area (water, snow or persistent cloud).`);
  if (result.climate?.status === "ok" && result.climate.points.length) {
    const points = result.climate.points;
    const lastSolar = [...points].reverse().find((p) => p.solar !== null)?.month;
    const lastClimate = points[points.length - 1].month;
    if (lastSolar && lastSolar < lastClimate) caveats.push(`Sunshine data runs to ${formatMonth(lastSolar, "long")}: NASA POWER publishes it a few months after temperature and rainfall.`);
    caveats.push(
      result.climate.samplePoints.length > 1
        ? `Climate values are averaged over ${result.climate.samplePoints.length} points inside the area (NASA POWER grid ≈ 50 km).`
        : "Climate values come from NASA POWER's ≈50 km grid cell at the centre of the area.",
    );
  }
  for (const series of Object.values(result.satellite)) {
    if (series?.latestAvailable && series.latestAvailable < result.end) caveats.push(`${series.label}: NASA has published data up to ${formatMonth(series.latestAvailable, "long")} so far.`);
  }
  return caveats;
}

export function buildInsights(result: AnalysisResult): InsightReport {
  const trends = analysisTrends(result);
  const counts = countTrends(trends);
  const comparing = Boolean(periodOf(result).compare);
  return {
    headline: buildHeadline(trends, counts, comparing),
    summary: buildSummary(result, trends, counts),
    counts,
    findings: buildFindings(result, trends),
    recent: result.climate?.status === "ok" ? recentConditions(result.climate.points) : null,
    caveats: buildCaveats(result),
  };
}
