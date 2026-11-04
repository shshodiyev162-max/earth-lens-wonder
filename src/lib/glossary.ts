// Plain-language definitions: what each NASA measure is, and the statistics words the app uses.
// Written for students and the public — one or two sentences, no jargon left unexplained.

import type { MetricId } from "./analysis/metrics";
import type { IndicatorId } from "./query/indicators";

/** What each Trends measure is. */
export const MEASURE_DEFINITIONS: Record<IndicatorId, string> = {
  vegetation:
    "How green and leafy plants are, seen from space (NDVI). Bare ground and water are near 0, grass and crops about 0.2–0.5, and thick forest up to about 0.9.",
  heat: "How hot the ground itself gets in the daytime, measured by satellite. Bare soil, rock and cities get much hotter than the air above them; plants and water stay cooler.",
  rainfall: "How much rain and snow falls, in millimetres per month, from NASA's MERRA-2 model, corrected with rain-gauge and satellite rainfall records.",
  soil: "How much water the soil holds where plant roots grow (the top metre or so), as a share of the soil's volume. Low values mean dry soil that roots struggle to draw from.",
  dust: "How much desert dust is in the air near the ground, in micrograms per cubic metre. Dust storms, dried-up lakes and bare land raise it.",
  snow: "The share of the ground covered by snow, from 0% (none) to 100% (all), seen by the MODIS satellite instrument.",
};

/** What each Analysis-page measure is. */
export const METRIC_DEFINITIONS: Record<MetricId, string> = {
  ndvi: MEASURE_DEFINITIONS.vegetation,
  lst: MEASURE_DEFINITIONS.heat,
  airTemp: "The temperature of the air about 2 metres above the ground — what a thermometer in the shade would read.",
  rain: "How much rain and snow falls. Each year's value is the total of the chosen months, in millimetres.",
  soil: "How wet the soil is where plant roots grow, from 0% (completely dry) to 100% (soaked).",
  aod: "How hazy the air is: how much sunlight dust, smoke and pollution block. Below 0.1 is clean air; above 0.4 is hazy.",
  snow: "The average share of the area covered by snow.",
};

export interface Term {
  term: string;
  meaning: string;
}

/** Words used in results, in the order they're usually met. */
export const TERMS: Term[] = [
  { term: "Trend", meaning: "A steady rise or fall over the years, rather than ups and downs." },
  { term: "Baseline", meaning: "The early years that later years are compared with." },
  { term: "Sen's slope", meaning: "The typical change per year: the middle value of the slopes between every pair of years, so one odd year can't pull it far." },
  {
    term: "Mann–Kendall test",
    meaning: "Checks whether later years are higher (or lower) than earlier ones more often than chance would allow. It doesn't need the change to be a straight line.",
  },
  { term: "p-value", meaning: "The chance of seeing a pattern at least this strong if nothing were really changing. The smaller it is, the stronger the evidence." },
  { term: "Significant", meaning: "Unlikely to be chance: p is below 0.05, so a pattern like this would appear without a real change less than 1 time in 20." },
  {
    term: "95% range",
    meaning: "The rates of change that fit the data. If the range includes zero, “no change” can't be ruled out; a longer record usually narrows it.",
  },
  { term: "t-test", meaning: "Compares the average of two periods, allowing for how much single years vary within each (Welch's version, which doesn't assume both vary equally)." },
  { term: "Hotspot", meaning: "A patch of neighbouring land that changed the same way by at least the chosen amount, where most of the patch shows a steady trend." },
  { term: "Anomaly", meaning: "How far a value is from what's usual for that time of year." },
];
