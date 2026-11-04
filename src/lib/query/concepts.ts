// Things people ask about that TerraScope's NASA monthly maps don't measure directly. Each one
// is explained in plain words with the closest real measures, so the reader never quietly swaps
// in something else.

import type { Direction, IndicatorId } from "./indicators";

export type ConceptId = "water" | "sealevel" | "groundwater" | "flood" | "fire" | "urban" | "gas" | "airPollution" | "glacier";

export interface Concept {
  id: ConceptId;
  /**
   * "unmeasured": nothing is scanned until the person picks one of the closest measures.
   * "approximate": the closest measure is used straight away, with a note on how it differs.
   */
  kind: "unmeasured" | "approximate";
  /** Global patterns, matched against lower-case text. */
  pattern: RegExp;
  /** Only when the text also matches this (e.g. a lake or sea for "drying up"). */
  requires?: RegExp;
  /** Skip when the question already names a measure ("vegetation shrinking near the Aral Sea"). */
  onlyWithoutMeasures?: boolean;
  message: string;
  closest: IndicatorId[];
  direction: Direction;
}

const WATER_BODY = /\b(?:seas?|lakes?|reservoirs?|rivers?|lagoons?|wetlands?|deltas?|ponds?|bays?)\b/;

export const CONCEPTS: Concept[] = [
  {
    id: "sealevel",
    kind: "unmeasured",
    pattern: /\bsea[\s-]+levels?(?:\s+rise)?\b/g,
    message: "Sea level isn't measured here — TerraScope reads NASA's monthly maps of land.",
    closest: [],
    direction: "increase",
  },
  {
    id: "groundwater",
    kind: "unmeasured",
    pattern: /\bground\s?water\b|\baquifers?\b/g,
    message: "Groundwater isn't measured here (that needs NASA's GRACE gravity satellites). The closest measure is root-zone soil moisture.",
    closest: ["soil"],
    direction: "decline",
  },
  {
    id: "water",
    kind: "unmeasured",
    pattern: /\bwater\s+(?:levels?|extent|area|bod(?:y|ies)|surface|loss)\b|\b(?:lake|river|reservoir)\s+levels?\b|\bdr(?:y|ies|ied|ying)\s+up\b|\bshrink(?:s|ing|age)?\b|\bshrank\b|\bshrunk(?:en)?\b|\bdisappear(?:s|ing|ed)?\b|\bwater\b/g,
    requires: WATER_BODY,
    onlyWithoutMeasures: true,
    message: "Lake, sea and river water isn't measured here — TerraScope's NASA monthly maps cover land. The closest measures are rainfall, soil moisture and vegetation around the shore.",
    closest: ["rainfall", "soil", "vegetation"],
    direction: "decline",
  },
  {
    id: "flood",
    kind: "unmeasured",
    pattern: /\bflood(?:s|ed|ing)?\b|\binundat\w*/g,
    message: "Flooded land isn't mapped here. The closest measures are rainfall and soil moisture.",
    closest: ["rainfall", "soil"],
    direction: "increase",
  },
  {
    id: "fire",
    kind: "unmeasured",
    pattern: /\b(?:wild|forest|bush)?fires?\b|\bburn(?:ed|t)\s+(?:areas?|land|forests?)\b|\bburn\s+scars?\b/g,
    message: "Fires and burned land aren't mapped here. The closest measures are vegetation (burned land loses greenness) and surface heat.",
    closest: ["vegetation", "heat"],
    direction: "decline",
  },
  {
    id: "urban",
    kind: "unmeasured",
    pattern: /\burbani[sz]ation\b|\burban\s+(?:growth|expansion|sprawl|areas?|development)\b|\bbuilt[\s-]up\b|\bcity\s+growth\b|\bsprawl\b|\bconstruction\b/g,
    message: "Built-up land isn't mapped here. The closest measures are vegetation (fields and parks give way to buildings) and surface heat.",
    closest: ["vegetation", "heat"],
    direction: "decline",
  },
  {
    id: "gas",
    kind: "unmeasured",
    pattern: /\b(?:no2|no₂|nitrogen\s+dioxide|ozone|smog|co2|co₂|carbon\s+dioxide|methane|emissions?|greenhouse\s+gas(?:es)?|sulfur\s+dioxide|so2)(?:\s+(?:pollution|levels?|concentrations?|emissions?))?(?!\w)/g,
    message: "Gases such as NO₂, CO₂, methane or ozone aren't measured here. The closest measure is aerosols and dust — tiny particles in the air.",
    closest: ["dust"],
    direction: "increase",
  },
  {
    id: "airPollution",
    kind: "approximate",
    pattern: /\bair\s+(?:quality|pollution)\b|(?<!(?:water|soil|noise|light|plastic)\s)\bpollution\b|\bpm\s?2\.?5\b|\bpm\s?10\b/g,
    message: "Air pollution is read as aerosols and dust (particles in the air, MERRA-2), not gases.",
    closest: ["dust"],
    direction: "any",
  },
  {
    id: "glacier",
    kind: "approximate",
    pattern: /\bglaciers?\b|\bglacial\b|\bice\s+(?:cover|caps?|sheets?|fields?)\b|\bpermafrost\b/g,
    message: "Glacier ice isn't measured directly. TerraScope uses MODIS snow cover, which includes snow lying on glaciers.",
    closest: ["snow"],
    direction: "any",
  },
];
