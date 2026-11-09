import { monthRange } from "../gibs/time";
import { formatSpan } from "./period";
import { formatP } from "./stats";
import { analysisTrends, periodOf } from "./trend";
import type { AnalysisResult } from "./types";

const fmt = (value: number | null | undefined, decimals = 3) =>
  value === null || value === undefined || !Number.isFinite(value) ? "" : value.toFixed(decimals);

/** "# Trend, Vegetation (NDVI): Significant decline, -0.0042 per year (95% range …), p = 0.01, years 2001–2025" */
export function trendLines(result: AnalysisResult): string[] {
  const compare = periodOf(result).compare;
  return analysisTrends(result).map(({ metric, verdict, comparison, span, note }) => {
    const unit = metric.unit ? ` ${metric.unit}` : "";
    const d = metric.decimals + 1;
    if (comparison && compare) {
      const parts: string[] = [comparison.label];
      if (comparison.baselineMean !== null && comparison.recentMean !== null) parts.push(`${formatSpan(compare.baseline)} average ${comparison.baselineMean.toFixed(metric.decimals)}${unit}, ${formatSpan(compare.recent)} average ${comparison.recentMean.toFixed(metric.decimals)}${unit}`);
      if (comparison.p !== null) parts.push(`Welch's t-test ${formatP(comparison.p)}`);
      return `# Comparison, ${metric.label}: ${parts.join(", ")}`;
    }
    if (!verdict) return `# Trend, ${metric.label}: not tested (${note ?? "too few years"})`;
    return `# Trend, ${metric.label}: ${verdict.label}, ${verdict.slopePerYear.toFixed(d)}${unit} per year (95% range ${verdict.lowerPerYear.toFixed(d)} to ${verdict.upperPerYear.toFixed(d)}), Mann-Kendall ${formatP(verdict.p)}${span ? `, years ${formatSpan(span)}` : ""}`;
  });
}

/** One row per month read, with every series side by side (blank = no data). */
export function buildCsv(result: AnalysisResult): string {
  const months = result.months ?? monthRange(result.start, result.end);
  const sat = result.satellite;
  const climate = new Map((result.climate?.points ?? []).map((p) => [p.month, p]));
  const columns: { header: string; value: (month: string) => string }[] = [{ header: "month", value: (m) => m }];

  const satColumn = (key: keyof typeof sat, header: string, decimals: number) => {
    const series = sat[key];
    if (!series) return;
    const byMonth = new Map(series.points.map((p) => [p.month, p]));
    columns.push({ header, value: (m) => fmt(byMonth.get(m)?.value, decimals) });
    if (key !== "snow" && key !== "snowWater") columns.push({ header: `${header}_coverage`, value: (m) => fmt(byMonth.get(m)?.coverage, 2) });
  };
  satColumn("vegetation", "ndvi_mean", 3);
  satColumn("evi", "evi_mean", 3);
  satColumn("surfaceHeat", "land_surface_temp_c", 2);
  satColumn("nightHeat", "land_surface_temp_night_c", 2);
  satColumn("air", "aerosol_optical_depth", 3);
  satColumn("dust", "dust_surface_ug_m3", 2);
  satColumn("fineDust", "dust_pm25_surface_ug_m3", 2);
  satColumn("snow", "snow_cover_pct", 1);
  satColumn("snowWater", "snow_water_mm", 1);
  satColumn("snowfall", "snowfall_mm_month", 1);
  satColumn("evaporation", "evaporation_mm_month", 1);
  satColumn("topsoil", "topsoil_moisture_pct_vol", 1);
  satColumn("waterStorage", "water_storage_cm", 2);
  satColumn("waterVapour", "water_vapour_mm", 1);
  satColumn("sst", "sea_surface_temp_night_c", 2);
  satColumn("salinity", "sea_surface_salinity_psu", 2);
  satColumn("so2", "so2_column_mg_m2", 3);
  satColumn("co", "co_500hpa_ppb", 1);
  satColumn("coGround", "co_surface_ppb", 1);
  satColumn("methane", "methane_400hpa_ppb", 0);
  satColumn("upperAir", "air_temp_250hpa_c", 2);
  satColumn("ozone", "ozone_50hpa_ppm", 3);
  satColumn("heatLeaving", "outgoing_longwave_w_m2", 1);

  if (result.climate?.points.length) {
    columns.push(
      { header: "air_temp_c", value: (m) => fmt(climate.get(m)?.temp, 2) },
      { header: "air_temp_normal_c", value: (m) => fmt(climate.get(m)?.tempNormal, 2) },
      { header: "air_temp_month_max_c", value: (m) => fmt(climate.get(m)?.tempMax, 2) },
      { header: "air_temp_month_min_c", value: (m) => fmt(climate.get(m)?.tempMin, 2) },
      { header: "precip_mm", value: (m) => fmt(climate.get(m)?.precip, 1) },
      { header: "precip_normal_mm", value: (m) => fmt(climate.get(m)?.precipNormal, 1) },
      { header: "solar_kwh_m2_day", value: (m) => fmt(climate.get(m)?.solar, 2) },
      { header: "humidity_pct", value: (m) => fmt(climate.get(m)?.humidity, 1) },
      { header: "wind_m_s", value: (m) => fmt(climate.get(m)?.wind, 2) },
      { header: "soil_wetness_pct", value: (m) => fmt(climate.get(m)?.soil, 1) },
    );
  }

  const header = [
    `# ${result.target.name} — ${result.start} to ${result.end}`,
    `# Area ${result.target.areaKm2.toFixed(1)} km², centre ${result.target.center[0].toFixed(4)}, ${result.target.center[1].toFixed(4)}`,
    "# Sources: NASA GIBS (MODIS, MERRA-2, AIRS, MOPITT, GLDAS, GRACE, AMSR2, SMAP) decoded from official colormaps; NASA POWER monthly + 2001-2020 climatology",
    ...trendLines(result),
  ];
  const lines = [columns.map((c) => c.header).join(",")];
  for (const month of months) lines.push(columns.map((c) => c.value(month)).join(","));
  return [...header, ...lines].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60) || "area";
}
