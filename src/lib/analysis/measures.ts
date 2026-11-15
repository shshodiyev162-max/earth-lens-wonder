// Which measures an analysis reads, as they appear in its link (`ds`): map measures by name, and the
// six climate measures one by one ("airTemp,rain") or all together ("climate").

import { CLIMATE_METRICS, type MetricId } from "./metrics";
import { DATASETS, DEFAULT_DATASETS } from "./run";
import type { DatasetId } from "./types";

const ALL_DATASETS = DATASETS.map((d) => d.id);

/** What a lake is read for when nothing else is chosen: its area of open water, with the climate around it. */
export const LAKE_DATASETS: DatasetId[] = ["climate", "water", "vegetation"];

/** Every measure there is: the six climate measures (one quick request) and every map measure. */
export const MEASURE_COUNT = CLIMATE_METRICS.length + DATASETS.length - 1;

/**
 * The measures in the link. All six climate measures come from one request, read when any is chosen;
 * nothing usable in the link means the usual choice (a lake's, for a lake).
 */
export function parseDatasets(value: string | null, lake = false): { datasets: DatasetId[]; climate: MetricId[] } {
  const everything = (datasets: DatasetId[]) => ({ datasets, climate: datasets.includes("climate") ? CLIMATE_METRICS : [] });
  if (!value) return everything(lake ? LAKE_DATASETS : DEFAULT_DATASETS);
  const parts = value.split(",");
  const climate = parts.includes("climate") ? CLIMATE_METRICS : CLIMATE_METRICS.filter((id) => parts.includes(id));
  const wanted: string[] = parts.filter((id) => id !== "climate" && (ALL_DATASETS as string[]).includes(id));
  if (climate.length) wanted.push("climate");
  return wanted.length ? { datasets: ALL_DATASETS.filter((id) => wanted.includes(id)), climate } : everything(DEFAULT_DATASETS);
}

/** The link's list of measures ("climate" for all six climate measures), or null for the usual choice. */
export function writeDatasets(datasets: DatasetId[], climate: MetricId[]): string | null {
  const all = climate.length === CLIMATE_METRICS.length;
  if (all && datasets.length === DEFAULT_DATASETS.length && DEFAULT_DATASETS.every((id) => datasets.includes(id))) return null;
  return datasets.flatMap((id) => (id === "climate" ? (all ? ["climate"] : climate) : [id])).join(",");
}
