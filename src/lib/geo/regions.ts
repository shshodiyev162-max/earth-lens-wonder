// Named regions, seas and oceans: places people look for that aren't single places in
// OpenStreetMap. Place search returns "Europe", "Mediterranean Sea" or "Sahel" as a point or a
// rough box; here they have their real extent: a continent's or a region's countries, a sea's
// water, or (for mountains and deserts, which have no agreed edge) a box.

import type { PlaceResult } from "./geocode";
import { findCountry, loadCountries, type CountryIndex } from "./countries";
import { continentPolygons, countryOnContinent, type ContinentId } from "./continents";
import { bboxOf, bboxPolygon, polygonsOf, type BBox, type LatLng, type PolygonGeometry, type Position } from "./geometry";
import { findWater, WATERS, waterShape, type WaterKind } from "./waters";

export interface NamedRegion {
  names: string[];
  label: string;
  context: string;
  /** Natural Earth country codes. "FRA:europe" keeps only that country's land on that continent. */
  countries?: string[];
  /** Whole continents, as drawn in continents.ts, less the countries in `except`. */
  continents?: ContinentId[];
  except?: string[];
  /** How the region was drawn, where that isn't obvious (shown under its name). */
  note?: string;
  bbox?: BBox;
  /** A rough outline (longitude, latitude): for seas, whose water area is loaded separately. */
  outline?: [number, number][];
  water?: WaterKind;
}

const UN_LIST = "Countries as on the UN's list of world regions.";

const CONTINENTS: NamedRegion[] = [
  {
    names: ["europe"],
    label: "Europe",
    context: "Continent",
    continents: ["europe"],
    note: `${UN_LIST} Russia, Kazakhstan and Turkey count only west of the Ural Mountains, the Ural River and the Bosporus, where Europe meets Asia. Georgia, Armenia, Azerbaijan and Cyprus count as Asia, and lands overseas, such as French Guiana, are left out.`,
  },
  {
    names: ["asia"],
    label: "Asia",
    context: "Continent",
    continents: ["asia"],
    note: `${UN_LIST} Russia, Kazakhstan and Turkey count only east of the Ural Mountains, the Ural River and the Bosporus, where Asia meets Europe. Russia's far eastern tip, across the 180° line, is left out: a scan can't wrap around it.`,
  },
  {
    names: ["africa"],
    label: "Africa",
    context: "Continent",
    continents: ["africa"],
    note: `${UN_LIST} Réunion and Mayotte are in; remote islands far out in the ocean, such as Saint Helena, are left out.`,
  },
  {
    names: ["north america"],
    label: "North America",
    context: "Continent",
    continents: ["northAmerica"],
    note: "From Canada and Greenland to Panama and the Caribbean, as on the UN's list of world regions. The last Aleutian islands, across the 180° line, are left out: a scan can't wrap around it.",
  },
  {
    names: ["south america"],
    label: "South America",
    context: "Continent",
    continents: ["southAmerica"],
    note: `${UN_LIST} French Guiana and the Falklands are in; Easter Island, 3,500 km out in the Pacific, is left out.`,
  },
  {
    names: ["oceania", "australia and oceania", "australasia"],
    label: "Oceania",
    context: "Continent",
    continents: ["oceania"],
    note: "Australia, New Zealand and the Pacific islands west of the 180° line. A scan can't wrap around that line, so Samoa, Tonga, French Polynesia and the other islands east of it are left out.",
  },
  {
    names: ["americas", "the americas"],
    label: "The Americas",
    context: "North and South America",
    continents: ["northAmerica", "southAmerica"],
    note: "North and South America together. The last Aleutian islands and Easter Island are left out.",
  },
  {
    names: ["eurasia"],
    label: "Eurasia",
    context: "Europe and Asia",
    continents: ["europe", "asia"],
    note: "Europe and Asia together. Russia's far eastern tip, across the 180° line, is left out: a scan can't wrap around it.",
  },
];

const SOUTH_AMERICA = ["ARG", "BOL", "BRA", "CHL:southAmerica", "COL", "ECU", "FLK", "FRA:southAmerica", "GUY", "PER", "PRY", "SUR", "URY", "VEN"];
const CENTRAL_AMERICA = ["BLZ", "CRI", "GTM", "HND", "NIC", "PAN", "SLV"];
const CARIBBEAN = [
  ...["ABW", "AIA", "ATG", "BHS", "BLM", "BRB", "CUB", "CUW", "CYM", "DMA", "DOM", "GRD", "HTI", "JAM", "KNA", "LCA", "MAF", "MSR", "PRI", "SXM"],
  ...["TCA", "TTO", "VCT", "VGB", "VIR", "FRA:northAmerica", "NLD:northAmerica"],
];
const NORTH_AFRICA = ["DZA", "EGY", "LBY", "MAR", "SAH", "SDN", "TUN"];

const LAND_REGIONS: NamedRegion[] = [
  // Europe
  { names: ["western europe", "west europe"], label: "Western Europe", context: "Europe", countries: ["AUT", "BEL", "CHE", "DEU", "FRA:europe", "LIE", "LUX", "MCO", "NLD:europe"], note: "France and the Netherlands without their lands overseas." },
  { names: ["eastern europe", "east europe"], label: "Eastern Europe", context: "Europe", countries: ["BGR", "BLR", "CZE", "HUN", "MDA", "POL", "ROU", "RUS:europe", "SVK", "UKR"], note: "Russia only west of the Ural Mountains and the Ural River." },
  { names: ["northern europe", "north europe"], label: "Northern Europe", context: "Europe", countries: ["ALD", "DNK", "EST", "FIN", "FRO", "GBR", "GGY", "IMN", "IRL", "ISL", "JEY", "LTU", "LVA", "NOR", "SWE"] },
  { names: ["southern europe", "south europe"], label: "Southern Europe", context: "Europe", countries: ["ALB", "AND", "BIH", "ESP", "GRC", "HRV", "ITA", "KOS", "MKD", "MLT", "MNE", "PRT", "SMR", "SRB", "SVN", "VAT"] },
  { names: ["central europe"], label: "Central Europe", context: "Europe", countries: ["AUT", "CHE", "CZE", "DEU", "HUN", "LIE", "POL", "SVK", "SVN"] },
  {
    names: ["european union", "eu", "e.u."],
    label: "European Union",
    context: "27 countries",
    countries: ["ALD", "AUT", "BEL", "BGR", "CYP", "CZE", "DEU", "DNK", "ESP", "EST", "FIN", "FRA:europe", "GRC", "HRV", "HUN", "IRL", "ITA", "LTU", "LUX", "LVA", "MLT", "NLD:europe", "POL", "PRT", "ROU", "SVK", "SVN", "SWE"],
    note: "The 27 member countries. Lands overseas, such as French Guiana and Réunion, are left out; the Canary Islands, the Azores and Madeira are in.",
  },
  { names: ["scandinavia", "scandinavian countries"], label: "Scandinavia", context: "Denmark, Norway, Sweden", countries: ["DNK", "NOR", "SWE"] },
  {
    names: ["nordic countries", "nordics", "the nordics", "nordic region"],
    label: "Nordic countries",
    context: "Europe",
    countries: ["ALD", "DNK", "FIN", "FRO", "ISL", "NOR", "SWE"],
    note: "Denmark, Finland, Iceland, Norway and Sweden, with the Faroe and Åland Islands. Greenland is left out: it counts as North America.",
  },
  { names: ["baltic states", "baltic countries", "baltics", "the baltics"], label: "Baltic states", context: "Estonia, Latvia, Lithuania", countries: ["EST", "LTU", "LVA"] },
  {
    names: ["balkans", "the balkans", "balkan peninsula", "balkan countries"],
    label: "Balkans",
    context: "Europe",
    countries: ["ALB", "BGR", "BIH", "GRC", "HRV", "KOS", "MKD", "MNE", "SRB", "TUR:europe"],
    note: "With Turkey's land west of the Bosporus. Romania and Slovenia, often counted only in part, are left out.",
  },
  { names: ["british isles"], label: "British Isles", context: "Europe", countries: ["GBR", "GGY", "IMN", "IRL", "JEY"] },
  { names: ["benelux", "low countries"], label: "Benelux", context: "Belgium, Netherlands, Luxembourg", countries: ["BEL", "LUX", "NLD:europe"] },
  { names: ["european russia"], label: "European Russia", context: "Russia", countries: ["RUS:europe"], note: "Russia west of the Ural Mountains and the Ural River, with Kaliningrad." },
  // Asia
  { names: ["central asia"], label: "Central Asia", context: "Kazakhstan, Kyrgyzstan, Tajikistan, Turkmenistan, Uzbekistan", countries: ["KAZ", "KGZ", "TJK", "TKM", "UZB"] },
  { names: ["pamirs", "pamir", "pamir mountains", "the pamirs"], label: "Pamirs", context: "Tajikistan, Afghanistan, China, Kyrgyzstan", bbox: [70.5, 36.6, 75.4, 39.7] },
  { names: ["aral sea", "the aral sea", "aral"], label: "Aral Sea", context: "Kazakhstan / Uzbekistan", bbox: [57.8, 43.3, 62.0, 47.2] },
  { names: ["fergana valley", "ferghana valley", "fergana"], label: "Fergana Valley", context: "Uzbekistan, Kyrgyzstan, Tajikistan", bbox: [70.3, 40.0, 73.6, 41.6] },
  { names: ["kyzylkum", "kyzylkum desert", "kyzyl kum", "kyzyl-kum"], label: "Kyzylkum Desert", context: "Uzbekistan / Kazakhstan", bbox: [60.5, 40.0, 66.8, 44.2] },
  { names: ["karakum", "karakum desert", "kara kum", "garagum"], label: "Karakum Desert", context: "Turkmenistan", bbox: [54.5, 36.5, 65.0, 41.8] },
  { names: ["sahel", "the sahel"], label: "Sahel", context: "Africa", bbox: [-17.5, 10.5, 38.5, 20.5] },
  // Deserts and forests that OpenStreetMap knows only as a single point.
  { names: ["sahara", "sahara desert"], label: "Sahara", context: "North Africa", bbox: [-17.0, 16.0, 38.0, 32.0] },
  { names: ["gobi", "gobi desert"], label: "Gobi Desert", context: "Mongolia / China", bbox: [92.0, 38.5, 113.0, 46.0] },
  { names: ["taklamakan", "taklamakan desert", "taklimakan", "taklimakan desert"], label: "Taklamakan Desert", context: "China", bbox: [77.0, 36.5, 89.0, 41.5] },
  { names: ["thar", "thar desert", "great indian desert"], label: "Thar Desert", context: "India / Pakistan", bbox: [69.5, 24.5, 76.0, 30.0] },
  { names: ["kalahari", "kalahari desert"], label: "Kalahari Desert", context: "Botswana, Namibia, South Africa", bbox: [19.5, -28.0, 26.5, -18.0] },
  { names: ["atacama", "atacama desert"], label: "Atacama Desert", context: "Chile", bbox: [-71.0, -27.5, -68.0, -18.0] },
  { names: ["congo basin", "congo rainforest", "congo forest"], label: "Congo Basin", context: "Central Africa", bbox: [11.0, -6.0, 30.0, 5.5] },
  { names: ["amazon", "amazon basin", "amazon rainforest", "amazonia"], label: "Amazon", context: "South America", bbox: [-79.5, -17.5, -45.5, 5.5] },
  { names: ["himalayas", "himalaya", "the himalayas"], label: "Himalayas", context: "Asia", bbox: [72.5, 26.5, 95.5, 36.5] },
  { names: ["tibetan plateau", "tibet plateau", "qinghai-tibet plateau"], label: "Tibetan Plateau", context: "China", bbox: [78.0, 27.5, 103.0, 39.5] },
  {
    names: ["middle east", "the middle east"],
    label: "Middle East",
    context: "Western Asia and Egypt",
    countries: ["ARE", "BHR", "CYN", "CYP", "EGY", "IRN", "IRQ", "ISR", "JOR", "KWT", "LBN", "OMN", "PSX", "QAT", "SAU", "SYR", "TUR", "YEM"],
  },
  {
    names: ["western asia", "west asia"],
    label: "Western Asia",
    context: "Asia",
    countries: ["ARE", "ARM", "AZE", "BHR", "CYN", "CYP", "GEO", "IRQ", "ISR", "JOR", "KWT", "LBN", "OMN", "PSX", "QAT", "SAU", "SYR", "TUR:asia", "YEM"],
    note: "Turkey only east of the Bosporus.",
  },
  { names: ["arabian peninsula", "arabia"], label: "Arabian Peninsula", context: "Asia", countries: ["ARE", "BHR", "KWT", "OMN", "QAT", "SAU", "YEM"] },
  { names: ["south caucasus", "southern caucasus", "transcaucasia"], label: "South Caucasus", context: "Armenia, Azerbaijan, Georgia", countries: ["ARM", "AZE", "GEO"] },
  { names: ["east asia", "eastern asia"], label: "East Asia", context: "Asia", countries: ["CHN", "HKG", "JPN", "KOR", "MAC", "MNG", "PRK", "TWN"] },
  {
    names: ["southeast asia", "south-east asia", "south east asia", "south-eastern asia", "southeastern asia"],
    label: "Southeast Asia",
    context: "Asia",
    countries: ["BRN", "IDN", "KHM", "LAO", "MMR", "MYS", "PHL", "SGP", "THA", "TLS", "VNM"],
  },
  { names: ["indochina", "indochinese peninsula", "mainland southeast asia"], label: "Indochina", context: "Asia", countries: ["KHM", "LAO", "MMR", "THA", "VNM"] },
  { names: ["south asia", "southern asia"], label: "South Asia", context: "Asia", countries: ["AFG", "BGD", "BTN", "IND", "KAS", "LKA", "MDV", "NPL", "PAK"] },
  {
    names: ["siberia", "north asia", "northern asia"],
    label: "Siberia",
    context: "Russia",
    countries: ["RUS:asia"],
    note: "All of Russia east of the Ural Mountains, as the name is often used, the Russian Far East included. Its far eastern tip, across the 180° line, is left out.",
  },
  // Africa
  { names: ["north africa", "northern africa"], label: "North Africa", context: "Africa", countries: NORTH_AFRICA },
  { names: ["maghreb", "the maghreb"], label: "Maghreb", context: "North Africa", countries: ["DZA", "LBY", "MAR", "MRT", "SAH", "TUN"] },
  { names: ["west africa", "western africa"], label: "West Africa", context: "Africa", countries: ["BEN", "BFA", "CIV", "CPV", "GHA", "GIN", "GMB", "GNB", "LBR", "MLI", "MRT", "NER", "NGA", "SEN", "SLE", "TGO"] },
  { names: ["central africa", "middle africa"], label: "Central Africa", context: "Africa", countries: ["AGO", "CAF", "CMR", "COD", "COG", "GAB", "GNQ", "STP", "TCD"] },
  { names: ["southern africa"], label: "Southern Africa", context: "Africa", countries: ["BWA", "LSO", "NAM", "SWZ", "ZAF:africa"] },
  {
    names: ["sub-saharan africa", "subsaharan africa", "sub saharan africa"],
    label: "Sub-Saharan Africa",
    context: "Africa",
    continents: ["africa"],
    except: NORTH_AFRICA,
    note: "Africa without Algeria, Egypt, Libya, Morocco, Sudan, Tunisia and Western Sahara, as on the UN's list of world regions.",
  },
  { names: ["horn of africa"], label: "Horn of Africa", context: "East Africa", countries: ["ETH", "SOM", "SOL", "DJI", "ERI"] },
  { names: ["east africa", "eastern africa"], label: "East Africa", context: "Africa", countries: ["KEN", "TZA", "UGA", "ETH", "SOM", "SOL", "RWA", "BDI", "SDS", "ERI", "DJI"] },
  { names: ["alps", "the alps"], label: "Alps", context: "Europe", bbox: [5.0, 43.6, 16.5, 48.4] },
  // The Americas
  {
    names: ["central america"],
    label: "Central America",
    context: "North America",
    countries: CENTRAL_AMERICA,
    note: "Belize, Costa Rica, El Salvador, Guatemala, Honduras, Nicaragua and Panama. Mexico counts as North America.",
  },
  { names: ["caribbean islands", "west indies", "the west indies", "antilles"], label: "Caribbean islands", context: "North America", countries: CARIBBEAN },
  {
    names: ["latin america", "latin america and the caribbean"],
    label: "Latin America",
    context: "The Americas",
    countries: ["MEX", ...CENTRAL_AMERICA, ...CARIBBEAN, ...SOUTH_AMERICA],
    note: "Mexico, Central America, the Caribbean and South America, as on the UN's list of world regions. Easter Island is left out.",
  },
];

export const NAMED_REGIONS: NamedRegion[] = [
  ...CONTINENTS,
  ...LAND_REGIONS,
  ...WATERS.map((water) => ({ names: water.names, label: water.label, context: water.kind === "sea" ? "Sea" : "Ocean", outline: water.outline, water: water.kind })),
];

export const normalizeName = (text: string) => text.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

export function findNamedRegion(text: string): NamedRegion | null {
  const key = normalizeName(text);
  return NAMED_REGIONS.find((region) => region.label.toLowerCase() === key || region.names.some((name) => normalizeName(name) === key)) ?? null;
}

function merge(geometries: PolygonGeometry[]): PolygonGeometry {
  const polygons = geometries.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

/** How the region was drawn, when it matters: its own note, or that a box takes in land at its edges. */
export function regionNote(region: NamedRegion): string | undefined {
  if (region.note) return region.note;
  if (region.bbox) return "Drawn as a box around it, so it takes in some land at its edges.";
  return undefined;
}

/** Made of countries or continents, so it needs the country outlines. */
const fromCountries = (region: NamedRegion) => Boolean(region.countries?.length || region.continents?.length);

/** A whole continent (not part of one, or two together). */
export const isContinent = (region: NamedRegion) => region.continents?.length === 1 && !region.countries && !region.except;

/** The land of a region made of countries or continents: every country's outline, side by side. */
function regionLand(region: NamedRegion, countries: CountryIndex | null): PolygonGeometry | null {
  if (!countries) return null;
  const polygons: Position[][][] = [];
  for (const continent of region.continents ?? []) polygons.push(...continentPolygons(countries, continent, region.except));
  for (const entry of region.countries ?? []) {
    const [code, continent] = entry.split(":");
    const land = continent ? countryOnContinent(countries, code, continent as ContinentId) : (findCountry(countries, code)?.geometry ?? null);
    if (land) polygons.push(...polygonsOf(land));
  }
  return polygons.length ? merge([{ type: "MultiPolygon", coordinates: polygons }]) : null;
}

/**
 * The region's area: a sea's or ocean's water (land cut out), a box, or its countries together.
 * `countries` defaults to the bundled outlines (pass null to leave countries-based regions out).
 */
export async function regionGeometry(region: NamedRegion, countries?: CountryIndex | null): Promise<PolygonGeometry | null> {
  const water = region.water ? findWater(region.label) : null;
  if (water) return waterShape(water);
  if (region.outline) return { type: "Polygon", coordinates: [region.outline] };
  if (region.bbox) return bboxPolygon(region.bbox);
  return regionLand(region, countries === undefined ? await loadCountries() : countries);
}

/** The extent to show and scan: the outline or box (stable, whatever the water's exact shape). */
export function regionBBox(region: NamedRegion, countries: CountryIndex | null): BBox | null {
  if (region.outline) return bboxOf({ type: "Polygon", coordinates: [region.outline] });
  if (region.bbox) return region.bbox;
  const land = regionLand(region, countries);
  return land ? bboxOf(land) : null;
}

/**
 * Regions, seas and oceans whose name starts with the typed words, then those with a word that
 * does ("asia" → Central Asia), then, from 4 letters, those that contain them anywhere (Eurasia).
 */
export function searchNamedRegions(query: string, limit = 3): NamedRegion[] {
  const key = normalizeName(query);
  if (key.length < 3) return [];
  const words = (region: NamedRegion) => [region.label.toLowerCase(), ...region.names.map(normalizeName)];
  const starts = NAMED_REGIONS.filter((region) => words(region).some((w) => w.startsWith(key)));
  const wordStarts = NAMED_REGIONS.filter((region) => !starts.includes(region) && words(region).some((w) => w.includes(` ${key}`) || w.includes(`-${key}`)));
  const found = [...starts, ...wordStarts];
  const contains = key.length >= 4 ? NAMED_REGIONS.filter((region) => !found.includes(region) && words(region).some((w) => w.includes(key))) : [];
  return [...found, ...contains].slice(0, limit);
}

/** A named region as a place-search result (its shape comes from `regionGeometry`). */
export async function regionPlace(region: NamedRegion): Promise<PlaceResult | null> {
  const bbox = regionBBox(region, fromCountries(region) ? await loadCountries() : null);
  if (!bbox) return null;
  const center: LatLng = [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2];
  return { id: `region:${region.label}`, name: region.label, context: region.context, kind: region.water ? "water" : "region", center, bbox, region: region.label, source: "terrascope" };
}
