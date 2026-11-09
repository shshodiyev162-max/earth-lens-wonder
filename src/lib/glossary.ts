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
  airTemp: "The temperature of the air about 2 metres above the ground or sea — what a thermometer in the shade would read — from NASA's MERRA-2 model.",
  evaporation: "How much water rises from the land into the air each month — from soil, lakes and leaves — in millimetres, from NASA's MERRA-2 model.",
  sst: "The temperature of the top layer of the sea at night, measured from space by the MODIS satellite instrument.",
  so2: "How much sulphur dioxide is in the air above each spot. It comes from burning coal and oil, metal smelters and volcanoes.",
  co: "How much carbon monoxide is in the air about 5 km up, in parts per billion, measured by the AIRS satellite instrument. Fires, traffic and industry release it.",
  upperAir: "The air temperature about 10 km up, near the height airliners fly (the 250 hPa level), from NASA's MERRA-2 model.",
  ozone: "Ozone about 20 km up, in the layer that shields the ground from the Sun's ultraviolet light, in parts per million. The ozone hole shows as very low values.",
  evi: "A satellite index of how leafy plants are (EVI) that keeps responding over thick forest, where NDVI levels off. Bare ground is near 0 and dense forest about 0.6.",
  nightHeat: "How warm the ground stays at night, measured by satellite. Cities, dry land and warm air keep it high, so it shows a side of warming that daytime readings miss.",
  sunlight: "How much sunlight reaches the land after clouds and haze, in watts per square metre, from NASA's MERRA-2 model.",
  topsoil: "How much water is in the top 10 cm of soil, as a share of the soil's volume, from NASA's GLDAS land model. It reacts to rain within days; deeper soil moisture reacts more slowly.",
  waterStorage: "All the water the land holds (ice, snow, lakes, soil, groundwater), from small changes in Earth's gravity, in cm above or below the 2004–2009 average. Each reading blurs about 300 km.",
  snowWater: "How much water the snowpack would make if it melted, in millimetres, measured by microwave from the AMSR2 satellite instrument. It can read too low under deep snow and in forests.",
  snowfall: "How much snow falls each month, as millimetres of melted water, from NASA's MERRA-2 model.",
  humidity: "How close the air near the surface is to being full of water vapour (relative humidity), in the daytime, measured by the AIRS satellite instrument.",
  waterVapour: "All the water vapour in the air above each spot, as the millimetres of water it would make if it fell as rain, from NASA's MERRA-2 model. Warmer air can hold more.",
  wind: "How fast the wind blows near the surface, in metres per second, from NASA's MERRA-2 model. Calm averages below 2 m/s are all shown as 2.",
  heatLeaving: "How much heat Earth radiates out to space, in watts per square metre, measured by the AIRS satellite instrument. Hot, dry, cloud-free places send out the most.",
  fineDust: "The smallest desert dust near the ground, fine enough to reach the lungs (PM2.5), in micrograms per cubic metre, from NASA's MERRA-2 model. It counts dust only, not smoke or traffic soot.",
  haze: "How hazy the air is: how much sunlight dust, smoke and pollution block (aerosol optical depth). Below 0.1 is clean air; above 0.4 is hazy.",
  coGround: "How much carbon monoxide is in the air near the ground, in parts per billion, from the MOPITT satellite instrument. Fires, traffic and industry release it.",
  methane: "How much methane is in the air about 7 km up, in parts per billion, measured by the AIRS satellite instrument. Methane mixes around the whole planet, so this shows the global rise more than local sources.",
  salinity: "How salty the top of the sea is, in practical salinity units (about grams of salt per kilogram of water), measured by the SMAP satellite since 2015. Rain and rivers freshen it; evaporation makes it saltier.",
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
  evaporation: MEASURE_DEFINITIONS.evaporation,
  sst: MEASURE_DEFINITIONS.sst,
  so2: MEASURE_DEFINITIONS.so2,
  co: MEASURE_DEFINITIONS.co,
  upperAir: MEASURE_DEFINITIONS.upperAir,
  ozone: MEASURE_DEFINITIONS.ozone,
  evi: MEASURE_DEFINITIONS.evi,
  nightHeat: MEASURE_DEFINITIONS.nightHeat,
  sunshine: "How much of the Sun's energy reaches the ground, after clouds and haze, in kilowatt-hours per square metre per day.",
  humidity: "How close the air 2 metres above the ground is to being full of water vapour (relative humidity).",
  wind: "How fast the wind blows 2 metres above the ground, in metres per second.",
  topsoil: MEASURE_DEFINITIONS.topsoil,
  waterStorage: MEASURE_DEFINITIONS.waterStorage,
  snowWater: MEASURE_DEFINITIONS.snowWater,
  snowfall: "How much snow falls, as millimetres of melted water. Each year's value is the total of the chosen months.",
  waterVapour: MEASURE_DEFINITIONS.waterVapour,
  heatLeaving: MEASURE_DEFINITIONS.heatLeaving,
  dust: MEASURE_DEFINITIONS.dust,
  fineDust: MEASURE_DEFINITIONS.fineDust,
  coGround: MEASURE_DEFINITIONS.coGround,
  methane: MEASURE_DEFINITIONS.methane,
  salinity: MEASURE_DEFINITIONS.salinity,
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
