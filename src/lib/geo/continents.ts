// Continents made of their real countries, from the bundled Natural Earth outlines, so "Europe"
// is Europe's land and not a box drawn around it.
//
// Countries follow the UN's list of world regions (the M49 standard), with these choices:
// - Europe and Asia meet at the Ural Mountains, the Ural River, the Caspian Sea, the Caucasus and
//   the Bosporus. Russia, Kazakhstan and Turkey cross that line, so each is cut along it (the UN
//   lists all of Russia in Europe, which would put Siberia there).
// - Overseas lands go with the continent they are on, as on the UN's list: French Guiana with
//   South America, Réunion and Mayotte with Africa, Martinique, Guadeloupe and the Dutch Caribbean
//   islands with North America.
// - A scan can't wrap around the 180° line, so land across it from the rest of its continent is
//   left out: the eastern tip of Russia's Chukotka, the last Aleutian islands, and the Pacific
//   islands east of 180° (Samoa, Tonga, French Polynesia…).
// - A few remote islands would stretch a continent's scan over thousands of kilometres of ocean,
//   so they are left out too: Easter Island, Saint Helena, the Chagos, Christmas Island and the
//   islands near Antarctica (Kerguelen, Heard, South Georgia, Macquarie, Prince Edward…). Those
//   that are places of their own can still be chosen on their own.

import { clipPolygon } from "./clip";
import type { CountryIndex } from "./countries";
import { bboxOf, polygonsOf, type BBox, type PolygonGeometry, type Position } from "./geometry";

export type ContinentId = "europe" | "asia" | "africa" | "northAmerica" | "southAmerica" | "oceania";

export const CONTINENT_LABELS: Record<ContinentId, string> = {
  europe: "Europe",
  asia: "Asia",
  africa: "Africa",
  northAmerica: "North America",
  southAmerica: "South America",
  oceania: "Oceania",
};

/** Natural Earth codes by continent (its own codes for places like Somaliland and Kosovo). */
const MEMBERS: Record<ContinentId, string[]> = {
  europe: [
    ...["ALB", "ALD", "AND", "AUT", "BEL", "BGR", "BIH", "BLR", "CHE", "CZE", "DEU", "DNK", "ESP", "EST", "FIN", "FRA", "FRO", "GBR", "GGY", "GRC", "HRV"],
    ...["HUN", "IMN", "IRL", "ISL", "ITA", "JEY", "KOS", "LIE", "LTU", "LUX", "LVA", "MCO", "MDA", "MKD", "MLT", "MNE", "NLD", "NOR", "POL", "PRT"],
    ...["ROU", "SMR", "SRB", "SVK", "SVN", "SWE", "UKR", "VAT"],
  ],
  asia: [
    ...["AFG", "ARE", "ARM", "AZE", "BGD", "BHR", "BRN", "BTN", "CHN", "CYN", "CYP", "GEO", "HKG", "IDN", "IND", "IRN", "IRQ", "ISR", "JOR", "JPN"],
    ...["KAS", "KGZ", "KHM", "KOR", "KWT", "LAO", "LBN", "LKA", "MAC", "MDV", "MMR", "MNG", "MYS", "NPL", "OMN", "PAK", "PHL", "PRK", "PSX", "QAT"],
    ...["SAU", "SGP", "SYR", "THA", "TJK", "TKM", "TLS", "TUR", "TWN", "UZB", "VNM", "YEM"],
  ],
  africa: [
    ...["AGO", "BDI", "BEN", "BFA", "BWA", "CAF", "CIV", "CMR", "COD", "COG", "COM", "CPV", "DJI", "DZA", "EGY", "ERI", "ETH", "GAB", "GHA", "GIN"],
    ...["GMB", "GNB", "GNQ", "KEN", "LBR", "LBY", "LSO", "MAR", "MDG", "MLI", "MOZ", "MRT", "MUS", "MWI", "NAM", "NER", "NGA", "RWA", "SAH", "SDN"],
    ...["SDS", "SEN", "SLE", "SOL", "SOM", "STP", "SWZ", "SYC", "TCD", "TGO", "TUN", "TZA", "UGA", "ZAF", "ZMB", "ZWE"],
  ],
  northAmerica: [
    ...["ABW", "AIA", "ATG", "BHS", "BLM", "BLZ", "BMU", "BRB", "CAN", "CRI", "CUB", "CUW", "CYM", "DMA", "DOM", "GRD", "GRL", "GTM", "HND", "HTI"],
    ...["JAM", "KNA", "LCA", "MAF", "MEX", "MSR", "NIC", "PAN", "PRI", "SLV", "SPM", "SXM", "TCA", "TTO", "USA", "VCT", "VGB", "VIR"],
  ],
  southAmerica: ["ARG", "BOL", "BRA", "CHL", "COL", "ECU", "FLK", "GUY", "PER", "PRY", "SUR", "URY", "VEN"],
  oceania: ["ATC", "AUS", "FJI", "FSM", "GUM", "KIR", "MHL", "MNP", "NCL", "NFK", "NRU", "NZL", "PLW", "PNG", "SLB", "TUV", "VUT"],
};

/** Places in no continent, and why (each can still be chosen on its own). */
export const LEFT_OUT: Record<string, string> = {
  ATA: "Antarctica is a continent of its own",
  ASM: "east of the 180° line",
  COK: "east of the 180° line",
  NIU: "east of the 180° line",
  PCN: "east of the 180° line",
  PYF: "east of the 180° line",
  TON: "east of the 180° line",
  WLF: "east of the 180° line",
  WSM: "east of the 180° line",
  ATF: "a remote island near Antarctica",
  HMD: "a remote island near Antarctica",
  SGS: "a remote island near Antarctica",
  IOA: "remote islands far out in the ocean",
  IOT: "remote islands far out in the ocean",
  SHN: "remote islands far out in the ocean",
};

/** Each country's continent (null: in none). Russia and Kazakhstan are cut instead (see `CUT`). */
export const CONTINENT_OF: Record<string, ContinentId | null> = {
  ...Object.fromEntries(Object.keys(LEFT_OUT).map((code) => [code, null])),
  ...Object.fromEntries((Object.keys(MEMBERS) as ContinentId[]).flatMap((continent) => MEMBERS[continent].map((code) => [code, continent]))),
  RUS: "asia",
  KAZ: "asia",
};

/** Parts of a country that lie away from it: each piece of land is placed by its middle. */
const AWAY: Record<string, { box: BBox; to: ContinentId | null }[]> = {
  FRA: [
    { box: [-55, 1.5, -51, 6.5], to: "southAmerica" }, // French Guiana
    { box: [-62, 14, -60.5, 17], to: "northAmerica" }, // Martinique, Guadeloupe
    { box: [44, -22, 56, -12], to: "africa" }, // Réunion, Mayotte
  ],
  NLD: [{ box: [-69, 11.5, -62.5, 18.5], to: "northAmerica" }], // Bonaire, Saba, Sint Eustatius
  TUR: [{ box: [25.5, 39.9, 29.2, 42.2], to: "europe" }], // Thrace and Gökçeada, west of the Bosporus
  USA: [{ box: [0, -90, 180, 90], to: null }], // the Aleutian islands across the 180° line
  CHL: [{ box: [-110, -28, -100, -25], to: null }], // Easter Island
  NZL: [
    { box: [-180, -90, 0, 90], to: null }, // the Chatham Islands, across the 180° line
    { box: [165, -53, 170, -50], to: null }, // the Auckland and Campbell Islands, near Antarctica
  ],
  AUS: [{ box: [158, -55.5, 159.5, -54], to: null }], // Macquarie Island, near Antarctica
  ZAF: [{ box: [37, -47.5, 38.5, -46.5], to: null }], // the Prince Edward Islands, near Antarctica
  FJI: [{ box: [-180, -90, 0, 90], to: null }],
  KIR: [{ box: [-180, -90, 0, 90], to: null }],
};

/**
 * Where Europe meets Asia, north to south, as [longitude, latitude]: from the Kara Sea (leaving
 * Novaya Zemlya and Franz Josef Land in Europe) along the main ridge of the Ural Mountains to the
 * source of the Ural River, down the river past Magnitogorsk, Orsk, Orenburg, Oral and Atyrau to
 * the Caspian Sea, and across the sea to the Caucasus. Drawn to within about 20 km; continents are
 * scanned on a grid of about 50 km. South of the Caspian, Russia's own border follows the Caucasus.
 */
export const EUROPE_ASIA_LINE: Position[] = [
  [72.0, 85.0],
  [72.0, 77.5],
  [69.5, 76.0],
  [65.5, 72.5],
  [65.5, 70.0],
  [66.17, 68.47], // Konstantinov Kamen, the north end of the Urals
  [65.2, 67.1],
  [64.42, 66.72], // Payer
  [63.4, 66.2],
  [62.3, 65.75],
  [61.0, 65.35],
  [60.12, 65.03], // Narodnaya, the highest peak
  [59.6, 64.5],
  [59.35, 63.8],
  [59.25, 63.0],
  [59.3, 62.3],
  [59.25, 61.85], // Otorten
  [59.4, 61.3],
  [59.35, 60.6],
  [59.15, 59.9],
  [59.05, 59.3],
  [59.15, 58.6],
  [59.5, 57.9],
  [59.85, 57.2],
  [60.05, 56.85], // west of Yekaterinburg
  [60.35, 56.1],
  [60.0, 55.6],
  [59.85, 55.1], // east of Zlatoust
  [59.6, 54.8],
  [59.4, 54.6], // the source of the Ural River
  [59.3, 54.2],
  [59.22, 53.88],
  [59.0, 53.4], // Magnitogorsk
  [59.15, 52.95],
  [59.0, 52.4],
  [58.75, 51.9],
  [58.6, 51.55],
  [58.6, 51.2], // Orsk
  [58.3, 51.2],
  [57.85, 51.35],
  [57.2, 51.45],
  [56.6, 51.55],
  [56.0, 51.65],
  [55.1, 51.74], // Orenburg
  [54.5, 51.6],
  [53.4, 51.5],
  [52.6, 51.4],
  [51.95, 51.33],
  [51.37, 51.25], // Oral
  [51.25, 50.8],
  [51.17, 50.25],
  [51.5, 49.6],
  [51.77, 48.55],
  [51.75, 48.0],
  [51.9, 47.4],
  [51.9, 47.1], // Atyrau
  [51.85, 46.9],
  [51.7, 46.6], // the Caspian Sea
  [50.0, 46.2],
  [48.9, 44.5],
  [49.3, 42.5],
  [49.6, 41.0],
];

const EUROPE_SIDE: Position[] = [...EUROPE_ASIA_LINE, [18, 41], [18, 85], EUROPE_ASIA_LINE[0]];
// Slightly past 180°, so Russia's land at exactly 180° is cut cleanly.
const ASIA_SIDE: Position[] = [...EUROPE_ASIA_LINE, [49.6, 38], [180.5, 38], [180.5, 85], EUROPE_ASIA_LINE[0]];

/** Countries cut along the line between Europe and Asia. */
const CUT: Record<string, true> = { RUS: true, KAZ: true };

const inBox = ([x, y]: Position, [w, s, e, n]: BBox) => x >= w && x <= e && y >= s && y <= n;

type Pieces = Map<ContinentId, Position[][][]>;

/** A country's land by continent. */
function splitCountry(id: string, geometry: PolygonGeometry): Pieces {
  const pieces: Pieces = new Map();
  const add = (continent: ContinentId | null, polygon: Position[][]) => {
    if (!continent) return;
    const list = pieces.get(continent) ?? [];
    list.push(polygon);
    pieces.set(continent, list);
  };
  for (const polygon of polygonsOf(geometry)) {
    if (CUT[id]) {
      // Land across the 180° line falls outside both sides, so it is left out here too.
      for (const part of clipPolygon(polygon, EUROPE_SIDE)) add("europe", part);
      for (const part of clipPolygon(polygon, ASIA_SIDE)) add("asia", part);
      continue;
    }
    const [w, s, e, n] = bboxOf({ type: "Polygon", coordinates: polygon });
    const middle: Position = [(w + e) / 2, (s + n) / 2];
    const away = AWAY[id]?.find((rule) => inBox(middle, rule.box));
    add(away ? away.to : (CONTINENT_OF[id] ?? null), polygon);
  }
  return pieces;
}

const splits = new WeakMap<CountryIndex, Map<string, Pieces>>();

function piecesOf(index: CountryIndex, id: string): Pieces | null {
  let known = splits.get(index);
  if (!known) {
    known = new Map();
    splits.set(index, known);
  }
  const cached = known.get(id);
  if (cached) return cached;
  const country = index.countries.find((c) => c.id === id);
  if (!country) return null;
  const pieces = splitCountry(id, country.geometry);
  known.set(id, pieces);
  return pieces;
}

const asGeometry = (polygons: Position[][][]): PolygonGeometry | null =>
  polygons.length === 0 ? null : polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };

/** A country's land on one continent (null when it has none there), e.g. Russia in Europe. */
export function countryOnContinent(index: CountryIndex, id: string, continent: ContinentId): PolygonGeometry | null {
  return asGeometry(piecesOf(index, id.toUpperCase())?.get(continent) ?? []);
}

/** The countries with land on a continent. */
export function continentCountries(index: CountryIndex, continent: ContinentId): string[] {
  return index.countries.map((c) => c.id).filter((id) => piecesOf(index, id)?.has(continent));
}

/** Every polygon of a continent's land, less the countries in `except`. */
export function continentPolygons(index: CountryIndex, continent: ContinentId, except: string[] = []): Position[][][] {
  const skip = new Set(except.map((code) => code.toUpperCase()));
  return continentCountries(index, continent)
    .filter((id) => !skip.has(id))
    .flatMap((id) => piecesOf(index, id)?.get(continent) ?? []);
}

/** A continent's land, side by side in one shape. */
export function continentLand(index: CountryIndex, continent: ContinentId): PolygonGeometry | null {
  return asGeometry(continentPolygons(index, continent));
}
