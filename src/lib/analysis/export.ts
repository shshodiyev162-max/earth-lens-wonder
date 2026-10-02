import { monthRange } from "../gibs/time";
import type { AnalysisResult } from "./types";

const fmt = (value: number | null | undefined, decimals = 3) =>
  value === null || value === undefined || !Number.isFinite(value) ? "" : value.toFixed(decimals);

/** One row per month with every series side by side (blank = no data). */
export function buildCsv(result: AnalysisResult): string {
  const months = monthRange(result.start, result.end);
  const sat = result.satellite;
  const climate = new Map((result.climate?.points ?? []).map((p) => [p.month, p]));
  const columns: { header: string; value: (month: string) => string }[] = [{ header: "month", value: (m) => m }];

  const satColumn = (key: keyof typeof sat, header: string, decimals: number) => {
    const series = sat[key];
    if (!series) return;
    const byMonth = new Map(series.points.map((p) => [p.month, p]));
    columns.push({ header, value: (m) => fmt(byMonth.get(m)?.value, decimals) });
    if (key !== "snow") columns.push({ header: `${header}_coverage`, value: (m) => fmt(byMonth.get(m)?.coverage, 2) });
  };
  satColumn("vegetation", "ndvi_mean", 3);
  satColumn("surfaceHeat", "land_surface_temp_c", 2);
  satColumn("air", "aerosol_optical_depth", 3);
  satColumn("snow", "snow_cover_pct", 1);

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
    "# Sources: NASA GIBS (MODIS, MERRA-2) decoded from official colormaps; NASA POWER monthly + 2001-2020 climatology",
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
