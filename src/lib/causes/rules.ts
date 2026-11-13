// From evidence to possible causes. Fixed, written-down rules turn the checks in model.ts into a short
// ranked list, each cause with the measured evidence for it and how strong that evidence is. It never
// names "the" cause: it says which causes fit the data, and what this site can't measure.

import type { MetricId } from "../analysis/metrics";
import { formatP, signed } from "../analysis/stats";
import type { IndicatorId } from "../query/indicators";
import { COVER_LABEL, describeCover, type CoverGroup, type LandCover } from "../trends/landcover";
import type { ChangeShape, DriverEffect, DriverId, DriverWindow, FireCheck, PeopleCheck, WeatherCheck } from "./model";

/** Kinds of measure that share the same possible causes and the same weather to test. */
export type Family = "plants" | "heat" | "water" | "snow" | "dust";

const INDICATOR_FAMILY: Partial<Record<IndicatorId, Family>> = {
  vegetation: "plants",
  evi: "plants",
  heat: "heat",
  nightHeat: "heat",
  soil: "water",
  topsoil: "water",
  waterStorage: "water",
  evaporation: "water",
  snow: "snow",
  snowWater: "snow",
  dust: "dust",
  fineDust: "dust",
  haze: "dust",
};

const METRIC_FAMILY: Partial<Record<MetricId, Family>> = {
  ndvi: "plants",
  evi: "plants",
  lst: "heat",
  nightHeat: "heat",
  topsoil: "water",
  waterStorage: "water",
  evaporation: "water",
  snow: "snow",
  snowWater: "snow",
  dust: "dust",
  fineDust: "dust",
  aod: "dust",
};

/** The kind of measure, or null when the site can't look for causes of it (the weather itself, gases, the sea, the upper air). */
export function familyOfIndicator(id: IndicatorId): Family | null {
  return INDICATOR_FAMILY[id] ?? null;
}

export function familyOfMetric(id: MetricId): Family | null {
  return METRIC_FAMILY[id] ?? null;
}

/** The weather each kind of measure is tested against. */
export const FAMILY_DRIVERS: Record<Family, { id: DriverId; window: DriverWindow }[]> = {
  plants: [
    { id: "rain", window: "year" },
    { id: "temp", window: "season" },
  ],
  heat: [
    { id: "temp", window: "season" },
    { id: "soil", window: "season" },
  ],
  water: [
    { id: "rain", window: "year" },
    { id: "temp", window: "season" },
  ],
  snow: [
    { id: "temp", window: "season" },
    { id: "rain", window: "season" },
  ],
  dust: [
    { id: "soil", window: "season" },
    { id: "wind", window: "season" },
  ],
};

/** Fires are looked for after a sudden loss of plants or a sudden rise in ground heat (burnt ground is hot). */
export function firesApply(family: Family, direction: "decline" | "increase"): boolean {
  return (family === "plants" && direction === "decline") || (family === "heat" && direction === "increase");
}

/** People change plants, heat, water and dust; snow is left to the weather. */
export function peopleApply(family: Family): boolean {
  return family !== "snow";
}

const NOT_MEASURED: Record<Family, string> = {
  plants: "grazing, watering of crops, farming choices, pests and disease, and trees planted or cut",
  heat: "building, watering of fields, and changes in plants and soil",
  water: "water pumped for farms and towns, dams and canals",
  snow: "dust or soot settling on the snow, and shifts in the winds that bring snow",
  dust: "drying lakes and rivers, ploughing, grazing, and dust or smoke blown in from far away",
};

// ---------------------------------------------------------------------------
// The evidence and the report

export type Strength = "strong" | "some" | "weak";
export type CauseId = "drier" | "wetter" | "warmer" | "cooler" | "windier" | "calmer" | "fire" | "oneOff" | "notWeather" | "people";

export interface Cause {
  id: CauseId;
  title: string;
  strength: Strength;
  /** The measured evidence, one sentence each. */
  because: string[];
  /** What the land was, and the human causes that would fit it (never found, only possible). */
  fitsWith?: string[];
  /** The year of the land cover map behind `fitsWith`. */
  landYear?: number;
}

export type CheckId = "weather" | "shape" | "fire" | "people" | "land";

export interface CheckLine {
  id: CheckId;
  label: string;
  result: string;
}

export interface CauseReport {
  causes: Cause[];
  /** Every check, and what it found (or why it couldn't). */
  checks: CheckLine[];
  /** Causes this site has no data for, in a phrase. */
  notMeasured: string;
}

export type FireEvidence = { status: "checked"; check: FireCheck } | { status: "skipped"; reason: "measure" | "notSudden" } | { status: "failed" };
export type PeopleEvidence = { status: "checked"; check: PeopleCheck } | { status: "skipped"; reason: "measure" | "after2020" } | { status: "failed" };

export interface CauseEvidence {
  family: Family;
  direction: "decline" | "increase";
  /** Mid-sentence name of the measure: "plant greenness". */
  noun: string;
  /** Calendar months measured each year. */
  months: number[];
  /** Null when NASA POWER couldn't be reached. */
  weather: WeatherCheck | null;
  shape: ChangeShape;
  fire: FireEvidence;
  people: PeopleEvidence;
  /** What the land is today; null when the map couldn't be read. */
  cover: LandCover | null;
}

// ---------------------------------------------------------------------------
// Words

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "about 62%", "nearly all", "almost none". */
export function shareWords(share: number): string {
  if (share >= 0.95) return "all or nearly all";
  if (share <= 0.05) return share < -0.05 ? "none (the weather alone would have moved it the other way)" : "almost none";
  return `about ${Math.round(share * 100)}%`;
}

function driverName(id: DriverId, family: Family): string {
  if (id === "rain") return family === "snow" ? "rain and snow" : "rainfall";
  return { temp: "air temperature", soil: "soil wetness", wind: "wind" }[id];
}

function windowWords(window: DriverWindow, months: number[]): string {
  if (months.length >= 12) return "each year";
  return window === "year" ? "in the 12 months up to the end of each season" : "during each season";
}

/** "the weather (rainfall and air temperature)". */
export function driversPhrase(family: Family): string {
  return joinWithAnd(FAMILY_DRIVERS[family].map((d) => driverName(d.id, family)));
}

/** "fell by about 14% a decade", "rose by +0.42 °C a decade". */
function driverChange(effect: DriverEffect): string {
  const perDecade = effect.slopePerYear * 10;
  const verb = perDecade < 0 ? "fell" : "rose";
  if (effect.id === "rain") {
    if (effect.mean > 0) return `${verb} by about ${Math.abs(Math.round((perDecade / effect.mean) * 100))}% a decade`;
    return `${verb} by ${Math.abs(perDecade).toFixed(0)} mm a decade`;
  }
  if (effect.id === "temp") return `${verb} by ${Math.abs(perDecade).toFixed(2)} °C a decade`;
  if (effect.id === "soil") return `${verb} by ${Math.abs(perDecade).toFixed(1)} percentage points a decade`;
  return `${verb} by ${Math.abs(perDecade).toFixed(2)} m/s a decade`;
}

function trendTag(effect: DriverEffect): string {
  const v = effect.verdict;
  if (!v) return "";
  if (v.direction !== "none") return ` (a clear trend, ${formatP(v.p)})`;
  if (v.p < 0.1) return ` (a lean, not a clear trend: ${formatP(v.p)})`;
  return ` (not a clear trend on its own: ${formatP(v.p)})`;
}

const MORE: Record<DriverId, [string, string]> = {
  rain: ["more rain", "less rain"],
  temp: ["warmer", "cooler"],
  soil: ["wetter soil", "drier soil"],
  wind: ["windier", "calmer"],
};

/** "In years with less rain, plant greenness here is lower." */
function relation(effect: DriverEffect, noun: string): string {
  const [more, less] = MORE[effect.id];
  const down = effect.slopePerYear < 0;
  const word = down ? less : more;
  const higher = effect.coefficient * effect.slopePerYear > 0;
  const years = effect.id === "temp" || effect.id === "wind" ? `In ${word} years` : `In years with ${word}`;
  return `${years}, ${noun} here is ${higher ? "higher" : "lower"}.`;
}

const WEATHER_CAUSE: Record<DriverId, [CauseId, string, CauseId, string]> = {
  rain: ["wetter", "Wetter years", "drier", "Drier years"],
  soil: ["wetter", "Wetter years", "drier", "Drier years"],
  temp: ["warmer", "Warmer years", "cooler", "Cooler years"],
  wind: ["windier", "Windier years", "calmer", "Calmer years"],
};

const ORDER: CauseId[] = ["fire", "oneOff", "drier", "wetter", "warmer", "cooler", "windier", "calmer", "notWeather", "people"];
const STRENGTH_RANK: Record<Strength, number> = { strong: 0, some: 1, weak: 2 };

/** Most causes shown at once. */
export const MAX_CAUSES = 3;

function between(a?: number, b?: number): string {
  return a !== undefined && b !== undefined ? `between ${a} and ${b}` : "";
}

const formatDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

function peopleWords(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
  if (n >= 1e4) return `${Math.round(n / 1000).toLocaleString("en-US")},000`;
  if (n >= 100) return `${Math.round(n / 10) * 10}`;
  return `${Math.round(n)}`;
}

// ---------------------------------------------------------------------------
// What the land is, and what would fit it

interface FitRule {
  groups: CoverGroup[];
  min: number;
  text: string;
}

const FITS: Record<Family, Record<"decline" | "increase", FitRule[]>> = {
  plants: {
    decline: [
      { groups: ["forest"], min: 0.15, text: "trees cut down or burnt" },
      { groups: ["cropland"], min: 0.1, text: "changes in farming, such as fields left or less water for crops" },
      { groups: ["grass"], min: 0.3, text: "heavier grazing, or shrubs and scattered trees lost" },
      { groups: ["urban"], min: 0.03, text: "building on green land" },
      { groups: ["water", "wetland"], min: 0.05, text: "lakes or wetlands drying out" },
    ],
    increase: [
      { groups: ["cropland"], min: 0.1, text: "more fields, or more watering of crops" },
      { groups: ["forest"], min: 0.15, text: "forest growing back, or trees planted" },
      { groups: ["barren"], min: 0.2, text: "new fields or plants on bare land" },
      { groups: ["grass"], min: 0.3, text: "lighter grazing, or shrubs and trees growing back" },
    ],
  },
  heat: {
    increase: [
      { groups: ["urban"], min: 0.03, text: "building (streets and roofs hold heat)" },
      { groups: ["cropland"], min: 0.1, text: "less watering of fields" },
      { groups: ["forest"], min: 0.15, text: "trees lost" },
      { groups: ["water", "wetland"], min: 0.05, text: "water drying up" },
    ],
    decline: [
      { groups: ["cropland"], min: 0.1, text: "more watering of fields" },
      { groups: ["forest"], min: 0.15, text: "more trees" },
    ],
  },
  water: {
    decline: [
      { groups: ["cropland"], min: 0.1, text: "water pumped for crops" },
      { groups: ["urban"], min: 0.03, text: "water used by towns" },
      { groups: ["water", "wetland"], min: 0.05, text: "lakes, rivers or wetlands drying out" },
    ],
    increase: [
      { groups: ["cropland"], min: 0.1, text: "more watering of crops" },
      { groups: ["water"], min: 0.05, text: "new reservoirs or flooding" },
    ],
  },
  snow: { decline: [], increase: [] },
  dust: {
    increase: [
      { groups: ["barren"], min: 0.2, text: "bare ground spreading" },
      { groups: ["water", "wetland"], min: 0.03, text: "lakes or wetlands drying out" },
      { groups: ["cropland"], min: 0.1, text: "ploughed or abandoned fields" },
      { groups: ["grass"], min: 0.3, text: "heavier grazing" },
    ],
    decline: [{ groups: ["cropland"], min: 0.1, text: "more plant cover on fields" }],
  },
};

/** Human causes that would fit what the land is here, with the share that makes them possible. */
export function fitsWith(family: Family, direction: "decline" | "increase", cover: LandCover | null): string[] {
  if (!cover || !cover.totalKm2) return [];
  return FITS[family][direction]
    .map((rule) => ({ rule, share: rule.groups.reduce((s, g) => s + cover.shares[g], 0) }))
    .filter(({ rule, share }) => share >= rule.min)
    .map(({ rule, share }) => `${rule.text} (${rule.groups.map((g) => COVER_LABEL[g].toLowerCase()).join(" and ")}: ${Math.round(share * 100)}% of the area)`);
}

// ---------------------------------------------------------------------------
// The checks, one line each

function weatherLine(evidence: CauseEvidence): CheckLine {
  const label = "Weather (NASA POWER)";
  const w = evidence.weather;
  const drivers = driversPhrase(evidence.family);
  if (!w) return { id: "weather", label, result: "NASA POWER couldn't be reached, so the weather wasn't checked." };
  if (w.outcome === "tooFewYears") return { id: "weather", label, result: `Needs at least 8 years with both measurements; there ${w.years === 1 ? "was" : "were"} ${w.years}.` };
  const skill = w.skill !== null && w.skill > 0 ? `about ${Math.round(w.skill * 100)}%` : "none";
  const fit = `${capitalise(drivers)} predict ${skill} of the ups and downs from year to year, tested on years left out.`;
  if (w.outcome === "noLink") return { id: "weather", label, result: `${fit} That's too little to say whether the weather is behind the trend.` };
  const explained = shareWords(w.explained ?? 0);
  if (w.outcome === "weather") return { id: "weather", label, result: `${fit} The weather accounts for ${explained} of the trend, and nothing clear is left over.` };
  if (w.outcome === "notWeather") return { id: "weather", label, result: `${fit} But the weather accounts for ${explained} of the trend.` };
  return { id: "weather", label, result: `${fit} The weather accounts for ${explained} of the trend.` };
}

function shapeLine(evidence: CauseEvidence): CheckLine {
  const label = "Sudden or gradual";
  const s = evidence.shape;
  const moved = evidence.direction === "decline" ? "dropped" : "jumped";
  if (s.kind === "tooFewYears") return { id: "shape", label, result: "Needs at least 8 years with data." };
  if (s.kind === "sudden") return { id: "shape", label, result: `Sudden: it ${moved} all at once ${between(s.before, s.after)}${s.recovering ? ", and has been moving back since" : ""}.` };
  if (s.kind === "gradual") return { id: "shape", label, result: "Gradual: it drifted over the years rather than jumping." };
  return { id: "shape", label, result: "Neither a single jump nor a steady drift." };
}

function fireLine(evidence: CauseEvidence): CheckLine | null {
  const label = "Fires (MODIS)";
  const f = evidence.fire;
  if (f.status === "skipped" && f.reason === "measure") return null;
  if (f.status === "skipped") return { id: "fire", label, result: "Looked for only after a sudden change, and this one wasn't sudden." };
  if (f.status === "failed") return { id: "fire", label, result: "NASA's fire maps couldn't be reached." };
  const { during, before } = f.check;
  return {
    id: "fire",
    label,
    result: `Fires seen on ${during.withFire} of ${during.checked} days checked from ${formatDay(during.from)} to ${formatDay(during.to)}, against ${before.withFire} of ${before.checked} days in the same length of time before.`,
  };
}

function peopleLine(evidence: CauseEvidence): CheckLine | null {
  const label = "People (NASA SEDAC estimates from censuses)";
  const p = evidence.people;
  if (p.status === "skipped" && p.reason === "measure") return null;
  if (p.status === "skipped") return { id: "people", label, result: "NASA's population estimates stop at 2020, before these years." };
  if (p.status === "failed") return { id: "people", label, result: "NASA's population maps couldn't be reached." };
  const { first, last, growth } = p.check;
  const capped = Math.max(first.crowdedShare, last.crowdedShare) >= 0.05 ? " (at least: the map doesn't count above 1,000 people per km²)" : "";
  return {
    id: "people",
    label,
    result: `About ${peopleWords(first.people)} people in ${first.year} and ${peopleWords(last.people)} in ${last.year}${capped}: ${signed(growth * 100, 0)}%. Read from the map's colour bands, so the totals are rough; the change is the useful part.`,
  };
}

function landLine(evidence: CauseEvidence): CheckLine {
  const cover = evidence.cover;
  if (!cover) return { id: "land", label: "Land (MODIS land cover)", result: "NASA's land cover map couldn't be read here." };
  return { id: "land", label: `Land in ${cover.year} (MODIS land cover)`, result: describeCover(cover) };
}

// ---------------------------------------------------------------------------
// The causes

function weatherCauses(evidence: CauseEvidence): Cause[] {
  const w = evidence.weather;
  if (!w || w.outcome === "noLink" || w.outcome === "tooFewYears") return [];
  const out: Cause[] = [];
  const effects = [...w.effects].filter((e) => e.share >= 0.2).sort((a, b) => b.share - a.share);
  for (const effect of effects.slice(0, 2)) {
    const [upId, upTitle, downId, downTitle] = WEATHER_CAUSE[effect.id];
    const down = effect.slopePerYear < 0;
    const id = down ? downId : upId;
    if (out.some((c) => c.id === id)) continue;
    const clearDriver = effect.verdict !== null && effect.verdict.p < 0.1;
    const strength: Strength = w.outcome === "weather" && effect.share >= 0.6 && clearDriver && (w.skill ?? 0) >= 0.4 ? "strong" : effect.share >= 0.35 ? "some" : "weak";
    const because = [
      `${capitalise(driverName(effect.id, evidence.family))} ${windowWords(effect.window, evidence.months)} ${driverChange(effect)}${trendTag(effect)}.`,
      relation(effect, evidence.noun),
      `On its own, that accounts for ${shareWords(Math.min(effect.share, 1))} of the trend in ${evidence.noun}${w.outcome === "weather" ? ", and once the weather is taken out, no clear trend is left" : ""}.`,
    ];
    out.push({ id, title: down ? downTitle : upTitle, strength, because });
  }
  return out;
}

function leftOverSentence(evidence: CauseEvidence): string | null {
  const w = evidence.weather;
  if (!w?.residual || !w.leftOver) return null;
  const way = w.residual.direction === "decline" ? "falls" : "rises";
  return `Once the weather is taken out, ${evidence.noun} still ${way} clearly (${formatP(w.residual.p)}).`;
}

/** The causes that fit the evidence, strongest first, and every check behind them. */
export function possibleCauses(evidence: CauseEvidence): CauseReport {
  const { family, direction, noun, shape, weather } = evidence;
  const causes: Cause[] = [];
  const fits = fitsWith(family, direction, evidence.cover);
  const moved = direction === "decline" ? "dropped" : "jumped";
  const weatherExplains = weather?.outcome === "weather";
  const notWeather = weather?.outcome === "notWeather";
  const leftOver = leftOverSentence(evidence);

  // Fire: a sudden change, with fires far more often than before.
  const fire = evidence.fire.status === "checked" ? evidence.fire.check : null;
  if (fire && fire.outcome === "unusual" && shape.kind === "sudden") {
    const rate = fire.during.withFire / Math.max(1, fire.during.checked);
    const before = fire.before.withFire / Math.max(1, fire.before.checked);
    // Strong: a week's worth of fire days or more, five times as often as before (or where none burned before).
    const strong = rate >= 0.1 || (fire.during.withFire >= 5 && rate >= 5 * before);
    const after = family === "heat" ? "cooling back down as plants regrow" : "coming back, as plants do after a fire";
    causes.push({
      id: "fire",
      title: "Fire",
      strength: strong ? "strong" : "some",
      because: [
        `${capitalise(noun)} ${moved} all at once ${between(shape.before, shape.after)}.`,
        `NASA's satellites saw fires on ${fire.during.withFire} of ${fire.during.checked} days checked in that time, against ${fire.before.withFire} of ${fire.before.checked} days in the same length of time before.`,
        ...(shape.recovering ? [`Since then it has been ${after}.`] : []),
      ],
    });
  }

  // A one-off event: a sudden change that unusual fire doesn't account for.
  if (shape.kind === "sudden" && !causes.some((c) => c.id === "fire") && !weatherExplains) {
    const fireNote =
      fire?.outcome === "usual"
        ? ["Fires burn here, but no more often than before, so a fire seen from space doesn't account for it."]
        : fire?.outcome === "few"
          ? [`Fires were seen on ${fire.during.withFire} of the ${fire.during.checked} days checked, too few to tell whether one caused it.`]
          : [];
    causes.push({
      id: "oneOff",
      title: "A one-off event",
      strength: notWeather ? "strong" : "some",
      because: [
        `${capitalise(noun)} ${moved} all at once ${between(shape.before, shape.after)} rather than drifting, and ${shape.recovering ? "has been moving back since" : "hasn't moved back since"}.`,
        "Slow changes in climate don't do this; an event such as land clearing, building, a new dam, a flood or a fire too small to be seen from space can.",
        ...(notWeather && weather ? [`The weather accounts for ${shareWords(weather.explained ?? 0)} of the trend.`] : []),
        ...fireNote,
      ],
      fitsWith: fits.length ? fits : undefined,
      landYear: evidence.cover?.year,
    });
  }

  causes.push(...weatherCauses(evidence));

  // Not the weather: the weather follows the ups and downs but leaves the trend.
  if (!causes.some((c) => c.id === "oneOff") && weather && (notWeather || (weather.outcome === "partly" && leftOver))) {
    causes.push({
      id: "notWeather",
      title: "Something other than the weather",
      strength: notWeather ? ((weather.residual?.p ?? 1) < 0.01 ? "strong" : "some") : "weak",
      because: [
        notWeather
          ? `${capitalise(driversPhrase(family))} follow the ups and downs of ${noun} from year to year, but account for ${shareWords(weather.explained ?? 0)} of its trend.`
          : `The weather accounts for ${shareWords(weather.explained ?? 0)} of the trend in ${noun}, not all of it.`,
        ...(leftOver ? [leftOver] : []),
      ],
      fitsWith: fits.length ? fits : undefined,
      landYear: evidence.cover?.year,
    });
  }

  // More people: only when the weather doesn't already account for the change.
  const people = evidence.people.status === "checked" ? evidence.people.check : null;
  if (people?.strength && !weatherExplains) {
    const crowded =
      people.last.crowdedShare - people.first.crowdedShare >= 0.01
        ? [`Land with over 1,000 people per km² went from ${Math.round(people.first.crowdedShare * 100)}% to ${Math.round(people.last.crowdedShare * 100)}% of the area.`]
        : [];
    causes.push({
      id: "people",
      title: "More people living here",
      strength: people.strength,
      because: [
        `NASA's population estimates (from censuses) went from about ${peopleWords(people.first.people)} people in ${people.first.year} to ${peopleWords(people.last.people)} in ${people.last.year} (${signed(people.growth * 100, 0)}%).`,
        ...crowded,
        "More people usually means more building, farming and water use, though the numbers alone can't show which.",
      ],
    });
  }

  const ranked = causes
    .map((cause, index) => ({ cause, index }))
    .sort((a, b) => STRENGTH_RANK[a.cause.strength] - STRENGTH_RANK[b.cause.strength] || ORDER.indexOf(a.cause.id) - ORDER.indexOf(b.cause.id) || a.index - b.index)
    .map(({ cause }) => cause)
    .slice(0, MAX_CAUSES);

  const checks = [weatherLine(evidence), shapeLine(evidence), fireLine(evidence), peopleLine(evidence), landLine(evidence)].filter((line): line is CheckLine => line !== null);
  return { causes: ranked, checks, notMeasured: NOT_MEASURED[family] };
}
