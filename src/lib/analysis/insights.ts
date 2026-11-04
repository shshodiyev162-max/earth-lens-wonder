// Turns the measured series into plain-language findings. Nothing here is
// invented: every sentence is computed from the numbers returned by NASA GIBS
// and NASA POWER, and the thresholds are stated in the text.

import { formatMonth } from "../gibs/time";
import { climateValues, satelliteValues } from "./metrics";
import { formatSpan, seasonPhrase } from "./period";
import { explainVerdict, extremes, formatP, latestValid, mean, signed, sum, yearOverYear, type MonthlyValue } from "./stats";
import { analysisTrends, isConcerning, periodOf, type MetricTrend } from "./trend";
import type { AnalysisResult, DatasetId } from "./types";

export type Tone = "positive" | "neutral" | "warning" | "critical";

export interface Finding {
  id: string;
  dataset: DatasetId;
  tone: Tone;
  title: string;
  detail: string;
}

export interface Kpi {
  id: string;
  dataset: DatasetId;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  spark: (number | null)[];
}

export type ConcernLevel = "low" | "moderate" | "elevated" | "high";

export interface InsightReport {
  headline: string;
  summary: string;
  findings: Finding[];
  kpis: Kpi[];
  concern: { level: ConcernLevel; score: number; reasons: string[] };
  caveats: string[];
}

function hasData(values: MonthlyValue[]): boolean {
  return values.some((v) => v.value !== null);
}

function ndviClass(value: number): string {
  if (value < 0.1) return "barren land, desert, rock or built-up surfaces";
  if (value < 0.2) return "sparse vegetation";
  if (value < 0.4) return "moderate vegetation such as grassland, shrubs or crops";
  if (value < 0.6) return "dense vegetation";
  return "very dense, healthy vegetation";
}

function aodClass(value: number): string {
  if (value < 0.1) return "clean";
  if (value < 0.2) return "slightly hazy";
  if (value < 0.4) return "hazy";
  return "very hazy or dusty";
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

export function buildInsights(result: AnalysisResult): InsightReport {
  const findings: Finding[] = [];
  const kpis: Kpi[] = [];
  const reasons: string[] = [];
  const caveats: string[] = [];
  const headline: { text: string; priority: number }[] = [];
  let score = 0;
  const place = result.target.name;
  const climatePoints = result.climate?.status === "ok" ? result.climate.points : [];

  // ── Vegetation ─────────────────────────────────────────────────────────
  const ndvi = satelliteValues(result.satellite.vegetation);
  if (hasData(ndvi)) {
    const values = ndvi.map((v) => v.value).filter((v): v is number => v !== null);
    const avg = mean(values);
    const ext = extremes(ndvi);
    const latest = latestValid(ndvi);
    const yoy = yearOverYear(ndvi);

    findings.push({
      id: "veg-level",
      dataset: "vegetation",
      tone: "neutral",
      title: `Average NDVI ${avg.toFixed(2)} — ${ndviClass(avg)}`,
      detail: ext
        ? `Greenest in ${formatMonth(ext.max.month, "long")} (${(ext.max.value as number).toFixed(2)}), least green in ${formatMonth(ext.min.month, "long")} (${(ext.min.value as number).toFixed(2)}).`
        : "",
    });

    let tone: Tone = "neutral";
    let sub = latest ? formatMonth(latest.month) : "";
    if (yoy && yoy.previous > 0.05) {
      const change = (yoy.change / yoy.previous) * 100;
      tone = change <= -20 ? "critical" : change <= -10 ? "warning" : change >= 10 ? "positive" : "neutral";
      sub = `${signed(change, 0)}% vs ${formatMonth(`${Number(yoy.month.slice(0, 4)) - 1}${yoy.month.slice(4)}`)}`;
      if (Math.abs(change) >= 10) {
        headline.push({ text: change > 0 ? "vegetation greener than a year ago" : "vegetation less green than a year ago", priority: 3 });
        findings.push({
          id: "veg-yoy",
          dataset: "vegetation",
          tone,
          title: change < 0 ? `Vegetation is ${Math.abs(Math.round(change))}% less green than a year earlier` : `Vegetation is ${Math.round(change)}% greener than a year earlier`,
          detail: `${formatMonth(yoy.month, "long")}: NDVI ${yoy.value.toFixed(2)} vs ${yoy.previous.toFixed(2)} in the same month last year.`,
        });
        if (change <= -20) {
          score += 2;
          reasons.push("vegetation greenness fell more than 20% year-on-year");
        } else if (change <= -10) {
          score += 1;
          reasons.push("vegetation greenness fell 10–20% year-on-year");
        }
      }
    }
    kpis.push({
      id: "kpi-veg",
      dataset: "vegetation",
      label: "Vegetation (NDVI)",
      value: latest ? (latest.value as number).toFixed(2) : "—",
      sub,
      tone,
      spark: ndvi.map((v) => v.value),
    });
    const lowCoverage = result.satellite.vegetation?.points.filter((p) => p.value !== null && p.coverage < 0.5).length ?? 0;
    if (lowCoverage > 0) caveats.push(`${lowCoverage} month(s) of vegetation data cover less than half of the area (water, snow or persistent cloud).`);
  }

  // ── Surface heat ───────────────────────────────────────────────────────
  const lst = satelliteValues(result.satellite.surfaceHeat);
  if (hasData(lst)) {
    const ext = extremes(lst);
    const latest = latestValid(lst);
    const yoy = yearOverYear(lst);
    if (ext) {
      const peak = ext.max.value as number;
      let tone: Tone = "neutral";
      if (peak >= 50) {
        tone = "critical";
        score += 2;
        reasons.push(`monthly land surface temperature peaked at ${peak.toFixed(0)} °C`);
      } else if (peak >= 45) {
        tone = "warning";
        score += 1;
        reasons.push(`monthly land surface temperature reached ${peak.toFixed(0)} °C`);
      }
      if (peak >= 45) headline.push({ text: "extreme surface heat", priority: 4 });
      let detail = `Coolest month: ${formatMonth(ext.min.month, "long")} at ${(ext.min.value as number).toFixed(1)} °C.`;
      const airPeak = climatePoints.find((p) => p.month === ext.max.month)?.temp;
      if (typeof airPeak === "number") {
        const gap = peak - airPeak;
        const when = `In ${formatMonth(ext.max.month, "long")} the daytime ground`;
        const air = `the average air temperature (${airPeak.toFixed(1)} °C)`;
        if (gap >= 8) detail += ` ${when} was ${gap.toFixed(1)} °C hotter than ${air} — typical of bare soil, rock and built-up land.`;
        else if (gap >= 2) detail += ` ${when} was ${gap.toFixed(1)} °C hotter than ${air}.`;
        else if (gap > -2) detail += ` ${when} was close to ${air}.`;
        else detail += ` ${when} was ${Math.abs(gap).toFixed(1)} °C cooler than ${air} — vegetation, water or snow keep the surface cool.`;
      }
      findings.push({
        id: "lst-peak",
        dataset: "surfaceHeat",
        tone,
        title: `Hottest ground temperature: ${peak.toFixed(1)} °C in ${formatMonth(ext.max.month, "long")}`,
        detail: `${detail}${peak >= 45 ? " Surface temperatures above 45 °C stress crops, soils and people outdoors." : ""}`,
      });
      kpis.push({
        id: "kpi-lst",
        dataset: "surfaceHeat",
        label: "Peak surface heat",
        value: `${peak.toFixed(1)} °C`,
        sub: yoy
          ? Math.abs(yoy.change) < 0.05
            ? `${formatMonth(yoy.month)} same as last year`
            : `${formatMonth(yoy.month)} ${signed(yoy.change)} °C vs last year`
          : formatMonth(ext.max.month),
        tone,
        spark: lst.map((v) => v.value),
      });
    }
    if (yoy && Math.abs(yoy.change) >= 2) {
      findings.push({
        id: "lst-yoy",
        dataset: "surfaceHeat",
        tone: yoy.change > 0 ? "warning" : "neutral",
        title: `${formatMonth(yoy.month, "long")} was ${Math.abs(yoy.change).toFixed(1)} °C ${yoy.change > 0 ? "hotter" : "cooler"} at the surface than a year earlier`,
        detail: `Land surface ${yoy.value.toFixed(1)} °C vs ${yoy.previous.toFixed(1)} °C.`,
      });
    }
    if (latest && !yoy) caveats.push("Pick a period of at least 13 months to compare surface heat with the previous year.");
  }

  // ── Climate (NASA POWER) ───────────────────────────────────────────────
  if (climatePoints.length) {
    const anomalies = climatePoints.map((p) => p.tempAnomaly).filter((v): v is number => v !== null);
    if (anomalies.length) {
      const avgAnomaly = mean(anomalies);
      const warmMonths = anomalies.filter((a) => a > 0).length;
      let tone: Tone = "neutral";
      if (avgAnomaly >= 2) {
        tone = "critical";
        score += 2;
        reasons.push(`air temperature ran ${avgAnomaly.toFixed(1)} °C above the 2001–2020 normal`);
      } else if (avgAnomaly >= 1) {
        tone = "warning";
        score += 1;
        reasons.push(`air temperature ran ${avgAnomaly.toFixed(1)} °C above normal`);
      } else if (avgAnomaly <= -1) {
        tone = "neutral";
      }
      if (avgAnomaly >= 0.5) headline.push({ text: `${avgAnomaly.toFixed(1)} °C warmer than normal`, priority: 1 });
      else if (avgAnomaly <= -0.5) headline.push({ text: `${Math.abs(avgAnomaly).toFixed(1)} °C cooler than normal`, priority: 1 });
      // NASA POWER's monthly T2M_MAX is the hottest hour of the month, not an
      // average of daily maxima.
      const hottest = extremes(climateValues(climatePoints, "tempMax"));
      findings.push({
        id: "clim-temp",
        dataset: "climate",
        tone,
        title:
          Math.abs(avgAnomaly) < 0.3
            ? "Air temperature close to the 2001–2020 normal"
            : `Air temperature ${signed(avgAnomaly)} °C ${avgAnomaly > 0 ? "warmer" : "cooler"} than the 2001–2020 normal`,
        detail: `${warmMonths} of ${anomalies.length} months were warmer than normal.${
          hottest ? ` Peak air temperature: ${(hottest.max.value as number).toFixed(1)} °C in ${formatMonth(hottest.max.month, "long")}.` : ""
        }`,
      });
      kpis.push({
        id: "kpi-temp",
        dataset: "climate",
        label: "Temperature vs normal",
        value: `${signed(avgAnomaly)} °C`,
        sub: "average anomaly, 2001–2020 baseline",
        tone,
        spark: climatePoints.map((p) => p.tempAnomaly),
      });
    }

    const rainPairs = climatePoints.filter((p) => p.precip !== null && p.precipNormal !== null);
    if (rainPairs.length) {
      const total = sum(rainPairs.map((p) => p.precip as number));
      const normal = sum(rainPairs.map((p) => p.precipNormal as number));
      const ratio = normal > 1 ? (total / normal) * 100 : null;
      let tone: Tone = "neutral";
      if (ratio !== null) {
        if (ratio < 40) {
          tone = "critical";
          score += 2;
          reasons.push(`rainfall was only ${pct(ratio)} of normal`);
        } else if (ratio < 60) {
          tone = "warning";
          score += 1;
          reasons.push(`rainfall was ${pct(ratio)} of normal`);
        } else if (ratio > 150) {
          tone = "warning";
          score += 1;
          reasons.push(`rainfall was ${pct(ratio)} of normal (flood risk)`);
        } else if (ratio >= 90 && ratio <= 115) {
          tone = "positive";
        }
      }
      if (ratio !== null && ratio < 80) headline.push({ text: "drier than normal", priority: 2 });
      else if (ratio !== null && ratio > 125) headline.push({ text: "wetter than normal", priority: 2 });
      // Longest run of dry months (< 50 % of a meaningful normal).
      let run = 0;
      let longest = 0;
      for (const p of rainPairs) {
        if ((p.precipNormal as number) >= 5 && (p.precip as number) < (p.precipNormal as number) * 0.5) {
          run += 1;
          longest = Math.max(longest, run);
        } else run = 0;
      }
      findings.push({
        id: "clim-rain",
        dataset: "climate",
        tone,
        title: ratio !== null ? `Rainfall: ${Math.round(total)} mm — ${pct(ratio)} of normal` : `Rainfall: ${Math.round(total)} mm`,
        detail: `The 2001–2020 normal for these months is ${Math.round(normal)} mm.${
          longest >= 2 ? ` Longest dry spell: ${longest} consecutive months with less than half the usual rain.` : ""
        }`,
      });
      kpis.push({
        id: "kpi-rain",
        dataset: "climate",
        label: "Rainfall vs normal",
        value: ratio !== null ? pct(ratio) : `${Math.round(total)} mm`,
        sub: `${Math.round(total)} mm vs ${Math.round(normal)} mm normal`,
        tone,
        spark: climatePoints.map((p) => p.precip),
      });
    }

    const soilPairs = climatePoints.filter((p) => p.soil !== null && p.soilNormal !== null);
    const lastSoil = soilPairs[soilPairs.length - 1];
    if (lastSoil) {
      const diff = (lastSoil.soil as number) - (lastSoil.soilNormal as number);
      if (Math.abs(diff) >= 5) {
        const dry = diff < 0;
        if (dry && diff <= -15) {
          score += 1;
          reasons.push("root-zone soil moisture well below normal");
        }
        findings.push({
          id: "clim-soil",
          dataset: "climate",
          tone: dry ? (diff <= -15 ? "warning" : "neutral") : "positive",
          title: `Soil ${dry ? "drier" : "wetter"} than normal in ${formatMonth(lastSoil.month, "long")}`,
          detail: `Root-zone soil wetness ${Math.round(lastSoil.soil as number)}% vs ${Math.round(lastSoil.soilNormal as number)}% normal (${signed(diff, 0)} points).`,
        });
      }
    }

    const solarMonths = climatePoints.filter((p) => p.solar !== null);
    if (solarMonths.length) {
      const avgSolar = mean(solarMonths.map((p) => p.solar as number));
      const normals = solarMonths.map((p) => p.solarNormal).filter((v): v is number => v !== null);
      const avgNormal = normals.length === solarMonths.length ? mean(normals) : null;
      const resource =
        avgSolar >= 5
          ? "a strong solar-energy resource (above 5 kWh/m²/day)"
          : avgSolar >= 3.5
            ? "a moderate solar-energy resource"
            : "a limited solar-energy resource for these months";
      findings.push({
        id: "clim-solar",
        dataset: "climate",
        tone: avgSolar >= 5 ? "positive" : "neutral",
        title: `Sunshine: ${avgSolar.toFixed(1)} kWh/m² per day on average`,
        detail: `That is ${resource}${avgNormal ? `, ${pct((avgSolar / avgNormal) * 100)} of the 2001–2020 normal for the same months` : ""}.`,
      });
      const lastSolar = solarMonths[solarMonths.length - 1].month;
      const lastClimate = climatePoints[climatePoints.length - 1].month;
      if (lastSolar < lastClimate) {
        caveats.push(`Sunshine data runs to ${formatMonth(lastSolar, "long")} — NASA POWER publishes it a few months after temperature and rainfall.`);
      }
    }
    if (result.climate && result.climate.samplePoints.length > 1) {
      caveats.push(`Climate values are averaged over ${result.climate.samplePoints.length} points inside the area (NASA POWER grid ≈ 50 km).`);
    } else {
      caveats.push("Climate values come from NASA POWER's ≈50 km grid cell at the centre of the area.");
    }
  }

  // ── Air ────────────────────────────────────────────────────────────────
  const aod = satelliteValues(result.satellite.air);
  if (hasData(aod)) {
    const values = aod.map((v) => v.value).filter((v): v is number => v !== null);
    const avg = mean(values);
    const ext = extremes(aod);
    let tone: Tone = avg >= 0.4 ? "warning" : avg < 0.15 ? "positive" : "neutral";
    if (avg >= 0.6) {
      tone = "critical";
      score += 2;
      reasons.push(`air was very hazy (mean aerosol optical depth ${avg.toFixed(2)})`);
    } else if (avg >= 0.4) {
      score += 1;
      reasons.push(`air was often hazy or dusty (mean AOD ${avg.toFixed(2)})`);
    }
    if (avg >= 0.4) headline.push({ text: "hazy, dusty air", priority: 5 });
    findings.push({
      id: "air-level",
      dataset: "air",
      tone,
      title: `Air was ${aodClass(avg)} on average (AOD ${avg.toFixed(2)})`,
      detail: ext ? `Haziest month: ${formatMonth(ext.max.month, "long")} (AOD ${(ext.max.value as number).toFixed(2)}) — dust storms, smoke or pollution.` : "",
    });
    kpis.push({
      id: "kpi-air",
      dataset: "air",
      label: "Aerosols (AOD)",
      value: avg.toFixed(2),
      sub: aodClass(avg),
      tone,
      spark: aod.map((v) => v.value),
    });
  }

  // ── Snow ───────────────────────────────────────────────────────────────
  const snow = satelliteValues(result.satellite.snow);
  if (hasData(snow)) {
    const ext = extremes(snow);
    if (ext && (ext.max.value as number) >= 1) {
      const snowyMonths = snow.filter((v) => (v.value ?? 0) >= 10).length;
      findings.push({
        id: "snow",
        dataset: "snow",
        tone: "neutral",
        title: `Snow covered up to ${pct(ext.max.value as number)} of the area (${formatMonth(ext.max.month, "long")})`,
        detail: `${snowyMonths} month(s) had at least 10% snow cover.`,
      });
      kpis.push({
        id: "kpi-snow",
        dataset: "snow",
        label: "Peak snow cover",
        value: pct(ext.max.value as number),
        sub: formatMonth(ext.max.month),
        tone: "neutral",
        spark: snow.map((v) => v.value),
      });
    } else {
      findings.push({ id: "snow", dataset: "snow", tone: "neutral", title: "No significant snow cover in this period", detail: "" });
    }
  }

  // ── Trends over the years (or two periods compared) ───────────────────
  const trends = analysisTrends(result);
  const steady: MetricTrend[] = [];
  for (const trend of trends) {
    const { metric, verdict, comparison } = trend;
    const noun = nounOf(metric.label);
    const value = (v: number, d = metric.decimals) => `${v.toFixed(d)}${metric.unit ? ` ${metric.unit}` : ""}`;
    if (comparison) {
      const spans = periodOf(result).compare;
      if (!spans || comparison.label === "Not enough years to test" || comparison.change === null || comparison.p === null) continue;
      if (comparison.label === "No clear difference") {
        steady.push(trend);
        continue;
      }
      const lower = comparison.label === "Significantly lower";
      const concerning = isConcerning(metric, lower ? "decline" : "increase");
      const percent = comparison.percent !== null ? `, ${signed(comparison.percent, Math.abs(comparison.percent) < 10 ? 1 : 0)}%` : "";
      findings.push({
        id: `compare-${metric.id}`,
        dataset: metric.dataset,
        tone: concerning ? "warning" : metric.concern === "none" ? "neutral" : "positive",
        title: `${metric.label} significantly ${lower ? "lower" : "higher"} in ${formatSpan(spans.recent)} than in ${formatSpan(spans.baseline)}`,
        detail: `Yearly average ${value(comparison.baselineMean as number)} then, ${value(comparison.recentMean as number)} now (${signed(comparison.change, metric.decimals)}${metric.unit ? ` ${metric.unit}` : ""}${percent}). Welch's t-test on the yearly values: ${formatP(comparison.p)}.`,
      });
      headline.push({ text: `${noun} ${lower ? "lower" : "higher"} than in ${formatSpan(spans.baseline)}`, priority: 0 });
      if (concerning) {
        score += 1;
        reasons.push(`${noun} was significantly ${lower ? "lower" : "higher"} than in ${formatSpan(spans.baseline)}`);
      }
      continue;
    }
    if (!verdict) continue;
    if (verdict.direction === "none") {
      steady.push(trend);
      continue;
    }
    const concerning = isConcerning(metric, verdict.direction);
    const years = trend.span ? `, ${formatSpan(trend.span)}` : "";
    findings.push({
      id: `trend-${metric.id}`,
      dataset: metric.dataset,
      tone: concerning ? "warning" : metric.concern === "none" ? "neutral" : "positive",
      title: `${metric.label}: ${verdict.label.toLowerCase()}${years}`,
      detail: explainVerdict(verdict, metric.subject, metric.unit, metric.decimals + 1),
    });
    headline.push({ text: `significant ${noun} ${verdict.direction === "decline" ? "decline" : "rise"}`, priority: 0 });
    if (concerning) {
      score += 1;
      reasons.push(`a significant ${verdict.direction === "decline" ? "downward" : "upward"} trend in ${noun} (${formatP(verdict.p)})`);
    }
  }
  if (steady.length) {
    const names = joinWithAnd(steady.map((t) => nounOf(t.metric.label)));
    const comparing = Boolean(periodOf(result).compare);
    findings.push({
      id: "trend-none",
      dataset: steady[0].metric.dataset,
      tone: "neutral",
      title: comparing ? `No clear difference between the two periods in ${names}` : `No clear trend in ${names}`,
      detail: comparing
        ? "The two periods' yearly values overlap too much to call the difference real (t-test, p ≥ 0.05). See the trend cards for the numbers."
        : "These measures went up and down without a consistent direction (Mann–Kendall test, p ≥ 0.05). See the trend cards for the numbers and the likely range.",
    });
  }

  // ── Coverage of the requested period ───────────────────────────────────
  for (const series of Object.values(result.satellite)) {
    if (!series) continue;
    if (series.latestAvailable && series.latestAvailable < result.end) {
      caveats.push(`${series.label}: NASA has published data up to ${formatMonth(series.latestAvailable, "long")} so far.`);
    }
  }

  const level: InsightReport["concern"]["level"] = score >= 5 ? "high" : score >= 3 ? "elevated" : score >= 1 ? "moderate" : "low";
  const findingsOrdered = [...findings].sort((a, b) => toneWeight(b.tone) - toneWeight(a.tone));

  return {
    headline: buildHeadline(place, headline),
    summary: buildSummary(result, findings, level, reasons),
    findings: findingsOrdered,
    kpis,
    concern: { level, score, reasons },
    caveats,
  };
}

function toneWeight(tone: Tone): number {
  return tone === "critical" ? 3 : tone === "warning" ? 2 : tone === "positive" ? 1 : 0;
}

function buildHeadline(place: string, parts: { text: string; priority: number }[]): string {
  if (!parts.length) return `${place}: conditions close to normal`;
  const text = [...parts]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map((p) => p.text)
    .join(", ");
  return `${place}: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "vegetation" from "Vegetation (NDVI)". */
function nounOf(label: string): string {
  return label.replace(/\s*\(.*\)$/, "").toLowerCase();
}

/** "Mar 2016 – Feb 2026 (Apr–Sep only)" or "2001–2010 and 2016–2025". */
export function describeResultPeriod(result: AnalysisResult): { text: string; comparing: boolean } {
  const period = periodOf(result);
  const months = seasonPhrase(period.calendarMonths);
  const range = period.compare ? `${formatSpan(period.compare.baseline)} and ${formatSpan(period.compare.recent)}` : `${formatMonth(result.start, "long")} – ${formatMonth(result.end, "long")}`;
  return { text: months ? `${range} (${months})` : range, comparing: Boolean(period.compare) };
}

function buildSummary(result: AnalysisResult, findings: Finding[], level: string, reasons: string[]): string {
  const period = describeResultPeriod(result);
  const sentences: string[] = [];
  const veg = findings.find((f) => f.id === "veg-level");
  const temp = findings.find((f) => f.id === "clim-temp");
  const rain = findings.find((f) => f.id === "clim-rain");
  const air = findings.find((f) => f.id === "air-level");
  const trends = findings.filter((f) => f.id.startsWith("trend-") || f.id.startsWith("compare-"));

  sentences.push(
    period.comparing
      ? `This report compares ${result.target.name} in ${period.text}, using NASA satellite and climate records.`
      : `This report covers ${result.target.name} from ${period.text}, using NASA satellite and climate records.`,
  );
  const significant = trends.filter((f) => f.id !== "trend-none");
  if (significant.length) sentences.push(`${significant.map((f) => f.title).join("; ")}.`);
  else if (trends.length) sentences.push(`${trends[0].title}.`);
  if (veg) sentences.push(`${veg.title.replace(/^Average NDVI/, "Average plant greenness (NDVI) was")}.`);
  if (temp) sentences.push(`${temp.title}.`);
  if (rain) sentences.push(`${rain.title.replace(/^Rainfall:/, "Rainfall totalled")}.`);
  if (air) sentences.push(`${air.title}.`);
  if (reasons.length) {
    sentences.push(`Overall concern is ${level} because ${joinWithAnd(reasons)}.`);
  } else {
    sentences.push(`Overall concern is ${level}: none of the warning thresholds were crossed.`);
  }
  return sentences.join(" ");
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
