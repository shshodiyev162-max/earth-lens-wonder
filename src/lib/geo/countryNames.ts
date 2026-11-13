// Short and older names people type for countries ("USA", "UK", "Burma"), with the country's code
// in the bundled outlines and the name OpenStreetMap knows it by.

import { findCountry, type Country, type CountryIndex } from "./countries";
import { normalizeName } from "./regions";

export interface CountryAlias {
  /** The country's code in the bundled outlines. */
  code: string;
  /** Its name in OpenStreetMap, which place search finds. */
  name: string;
}

const USA = { code: "USA", name: "United States" };
const GBR = { code: "GBR", name: "United Kingdom" };
const RUS = { code: "RUS", name: "Russia" };
const COD = { code: "COD", name: "Democratic Republic of the Congo" };
const KOR = { code: "KOR", name: "South Korea" };
const NLD = { code: "NLD", name: "Netherlands" };
const TUR = { code: "TUR", name: "Turkey" };
const ARE = { code: "ARE", name: "United Arab Emirates" };

export const COUNTRY_ALIASES: Record<string, CountryAlias> = {
  usa: USA,
  us: USA,
  "u.s.": USA,
  "u.s.a.": USA,
  "united states": USA,
  "united states of america": USA,
  america: USA,
  uk: GBR,
  "u.k.": GBR,
  britain: GBR,
  "great britain": GBR,
  "united kingdom": GBR,
  russia: RUS,
  "russian federation": RUS,
  drc: COD,
  "dr congo": COD,
  "congo kinshasa": COD,
  "ivory coast": { code: "CIV", name: "Côte d'Ivoire" },
  "czech republic": { code: "CZE", name: "Czechia" },
  "south korea": KOR,
  korea: KOR,
  "north korea": { code: "PRK", name: "North Korea" },
  uae: ARE,
  "u.a.e.": ARE,
  burma: { code: "MMR", name: "Myanmar" },
  holland: NLD,
  turkey: TUR,
  turkiye: TUR,
  türkiye: TUR,
  swaziland: { code: "SWZ", name: "Eswatini" },
  "east timor": { code: "TLS", name: "Timor-Leste" },
  // OpenStreetMap's names that differ from the bundled outlines' own.
  "côte d'ivoire": { code: "CIV", name: "Côte d'Ivoire" },
  "cote d'ivoire": { code: "CIV", name: "Côte d'Ivoire" },
  "timor-leste": { code: "TLS", name: "Timor-Leste" },
  tanzania: { code: "TZA", name: "Tanzania" },
  micronesia: { code: "FSM", name: "Micronesia" },
  "cape verde": { code: "CPV", name: "Cape Verde" },
  "congo-brazzaville": { code: "COG", name: "Congo-Brazzaville" },
  "republic of congo": { code: "COG", name: "Republic of the Congo" },
  macedonia: { code: "MKD", name: "North Macedonia" },
  "palestinian territories": { code: "PSX", name: "Palestinian Territories" },
};

/** The country a short or older name stands for ("usa" → United States), if it is one. */
export function countryAlias(text: string): CountryAlias | null {
  return COUNTRY_ALIASES[normalizeName(text)] ?? null;
}

/** A country from the bundled outlines by name, alias or 3-letter code. */
export function matchCountry(index: CountryIndex, text: string): Country | null {
  const key = normalizeName(text);
  const alias = countryAlias(key);
  if (alias) return findCountry(index, alias.code);
  if (/^[a-z]{3}$/.test(key)) {
    const byCode = findCountry(index, key);
    if (byCode) return byCode;
  }
  return index.countries.find((country) => normalizeName(country.name) === key) ?? null;
}
