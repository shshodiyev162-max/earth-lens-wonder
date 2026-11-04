// A rule-based reader for trend questions such as
//   "where did vegetation decline in Uzbekistan since 2015"
//   "vegetation and rainfall decline in Uzbekistan since 2015"
//   "summer 2023 vs summer 2013 heat in Tashkent"
// Each part of the text is claimed once, in this order: time → things TerraScope can't measure
// → measures → directions → place, so a word is never read twice. No AI service is needed.

import { CONCEPTS, type ConceptId } from "./concepts";
import { CORE_INDICATORS, type Direction, type IndicatorId, type SeasonId } from "./indicators";

export type TimeSpec =
  | { kind: "default" }
  | { kind: "since"; start: number }
  | { kind: "range"; start: number; end: number }
  | { kind: "last"; years: number }
  | { kind: "year"; year: number }
  | { kind: "versus"; baseline: number; recent: number };

export interface ReaderNote {
  id: ConceptId;
  kind: "unmeasured" | "approximate";
  /** The words that raised the note, as typed. */
  phrase: string;
  message: string;
  /** The closest real measures to offer. */
  closest: IndicatorId[];
  direction: Direction;
}

export interface ParsedQuery {
  text: string;
  /** True when the text asks about change (a measure, "what changed", or something we can't measure). */
  isTrendQuery: boolean;
  /** Every measure mentioned, in the order written (all six for "what changed…"). */
  indicators: IndicatorId[];
  /** "What changed", "everything": no measure named, so all of them. */
  everything: boolean;
  /** The direction asked for each measure. */
  directions: Partial<Record<IndicatorId, Direction>>;
  /** The first measure (or null). */
  indicator: IndicatorId | null;
  /** The shared direction, or the first measure's when they differ. */
  direction: Direction;
  place: string | null;
  /** "near the Aral Sea": widen the area around the place. */
  near: boolean;
  time: TimeSpec;
  season: Exclude<SeasonId, "custom"> | null;
  /** Explicit months ("July 2023 vs July 2013"), 1–12. */
  months: number[] | null;
  /** Things that can't be measured directly, with the closest measures. */
  notes: ReaderNote[];
}

const YEAR = String.raw`((?:19|20)\d{2})`;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_WORD = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const SEASON_WORD = String.raw`(?:summer|winter|spring|autumn|fall|growing season|monsoon)`;
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  few: 5,
  several: 5,
  couple: 2,
};

/**
 * Words for each measure. "Strong" words name the measure; "weak" words describe weather
 * ("hotter", "drought") and only count when no measure is named, or when they're listed with one
 * ("heat and drought"), so "vegetation decline during the drought" stays about vegetation.
 */
const MEASURES: { id: IndicatorId; strong: RegExp; weak?: RegExp }[] = [
  // Air and sea measures first: their names contain words other measures use ("air temperature").
  { id: "upperAir", strong: /\bupper[-\s](?:air|atmosphere|troposphere)(?:\s+temperatures?)?\b|\b250\s?hpa\b|\bair\s+temperatures?\s+(?:10\s?km|high)\s+up\b/ },
  {
    id: "sst",
    strong:
      /\b(?:sea|ocean|marine)(?:\s+surface)?(?:\s+water)?\s+temperatures?\b|\bsst\b|\bmarine\s+heat\s?waves?\b|\b(?:ocean|sea)\s+(?:warming|heat(?:ing)?)\b|\bwarm(?:er|ing)\s+(?:seas|oceans|waters)\b/,
  },
  { id: "airTemp", strong: /\b(?:near[-\s]surface\s+)?air\s+temperatures?\b|\b2[-\s]?m(?:etre|eter)?\s+temperatures?\b|\bsurface\s+air\b/ },
  { id: "ozone", strong: /(?<!(?:ground[-\s]level|surface)\s)\bozone(?:\s+(?:layer|hole|levels?|concentrations?|depletion|column))?\b/ },
  { id: "so2", strong: /\bso2\b|\bso₂\b|\bsul(?:ph|f)ur\s+dioxide\b|\bsul(?:ph|f)ur\s+(?:pollution|emissions?)\b/ },
  { id: "co", strong: /\bcarbon\s+monoxide\b|\bco\s+(?:pollution|levels?|concentrations?|emissions?)\b/ },
  { id: "evaporation", strong: /\bevapo(?:ration|transpiration|rating|rates?|rated)\b|\bwater\s+loss\s+to\s+the\s+air\b/ },
  { id: "soil", strong: /\bsoils?(?:\s+(?:moisture|water|wetness))?\b|\bmoisture\b/ },
  { id: "snow", strong: /\bsnow(?:\s?cover|pack|fall|line|y)?\b/ },
  {
    id: "vegetation",
    strong:
      /\bvegetation\b|\bndvi\b|\bevi\b|\bgreen(?:ness|er|ing)\b|\bplants?\b|\bcrops?\b|\bcropland\b|\bfarm(?:land|s)?\b|\bforests?\b|\bdeforestation\b|\bdesertification\b|\bbrowning\b|\bpastures?\b|\bgrass(?:land)?s?\b|\brain\s?forests?\b|\bjungles?\b|\bwoodlands?\b|\btrees?\b|\bland\s+(?:is\s+)?degrad\w*|\bland\s+degradation\b|\bdegraded\s+land\b/,
  },
  { id: "dust", strong: /\bdust(?:y|ier|storms?)?\b|\baerosols?\b|\bhaz(?:e|y|ier)\b|\baod\b|\bsand\s?storms?\b|\bparticulates?\b/ },
  { id: "heat", strong: /\bheat(?:\s?waves?|ing)?\b|\btemperatures?\b|\blst\b/, weak: /\bhot(?:ter|test)?\b|\bwarm(?:er|ing|est|th)?\b|\bcool(?:er|ing)\b/ },
  { id: "rainfall", strong: /\brain(?:fall|s|y|ier)?\b|\bprecipitation\b|\bmonsoon\b/, weak: /\bdroughts?\b|\bdr(?:y|ier|ying|ied)\b|\barid(?:ity)?\b|\bwetter\b/ },
];

// A direction carried by the measure's own word ("hotter" is a rise in heat).
const OWN_DIRECTION: { indicator: IndicatorId; direction: Exclude<Direction, "any">; pattern: RegExp }[] = [
  { indicator: "heat", direction: "increase", pattern: /hotter|hottest|warm(?:er|ing)|heat\s?waves?|heating/ },
  { indicator: "heat", direction: "decline", pattern: /cool(?:er|ing)/ },
  { indicator: "rainfall", direction: "decline", pattern: /drought|dr(?:y|ier|ying|ied)|arid/ },
  { indicator: "rainfall", direction: "increase", pattern: /wetter|rainier/ },
  { indicator: "vegetation", direction: "increase", pattern: /greening|greener/ },
  { indicator: "vegetation", direction: "decline", pattern: /browning|deforestation|desertification|degrad/ },
  { indicator: "dust", direction: "increase", pattern: /dustier|hazier|sand\s?storms?/ },
  { indicator: "sst", direction: "increase", pattern: /warming|warmer|heat\s?waves?|heating/ },
  { indicator: "ozone", direction: "decline", pattern: /depletion/ },
];

// A direction implied by other words in the same part of the sentence ("drying soils").
const CLAUSE_DIRECTION: { indicator: IndicatorId; direction: Exclude<Direction, "any">; pattern: RegExp }[] = [
  { indicator: "soil", direction: "decline", pattern: /\bdr(?:y|ier|ying|ied)\b|\bdroughts?\b/ },
  { indicator: "vegetation", direction: "decline", pattern: /\bdroughts?\b|\bdie-?(?:off|back)\b/ },
  { indicator: "snow", direction: "decline", pattern: /\bmelt(?:s|ing|ed)?\b|\bretreat(?:s|ing|ed)?\b/ },
];

const DECLINE =
  /\b(?:declin\w*|decreas\w*|loss(?:es)?|lost|losing|lose|less|fewer|drop\w*|fell|falling|fallen|falls|shrink\w*|shrank|degrad\w*|retreat\w*|melt\w*|reduc\w*|lower\w*|weaken\w*|worsen\w*|die-?off|die-?back|dying|thinn\w*|disappear\w*|vanish\w*|deplet\w*|fail\w*|collaps\w*|downward)\b/;
const INCREASE = /\b(?:increas\w*|gain\w*|more|ris(?:e|es|ing|en)|rose|grow(?:s|ing|n|th)?|higher|expand\w*|spread\w*|surg\w*|spik\w*|intensif\w*|boost\w*|recover\w*|heal(?:s|ing|ed)?|upward)\b/;
const ANY = /\b(?:chang(?:e|es|ed|ing)|trends?|trending|shift(?:s|ed|ing)?|anomal(?:y|ies|ous)|differen(?:ce|ces|t)|evolv(?:e|es|ed|ing)|variation|variations)\b/;
const UP = String.raw`(?:increases?|rises?|gains?|growth|grow|up)`;
const DOWN = String.raw`(?:decreases?|declines?|loss|losses|drops?|falls?|down)`;
/** "increase or decrease", "gains and losses", "both ways": either direction. */
const BOTH = new RegExp(
  String.raw`\b${UP}\s*(?:or|and|/|&)\s*${DOWN}\b|\b${DOWN}\s*(?:or|and|/|&)\s*${UP}\b|\bups\s+and\s+downs\b|\bboth\s+(?:ways|directions)\b|\beither\s+(?:way|direction)\b|\bany\s+(?:change|direction)\b`,
);
/** No measure named, but asking what changed: all six measures. */
const EVERYTHING = /\b(?:everything|anything|all\s+(?:the\s+)?(?:measures|indicators|changes|data|datasets))\b/;
/** Joins the parts of a sentence that can each carry their own direction. */
const CLAUSE_BREAK = /,|;|\band\b|\bbut\b|\bwhile\b|\bwhereas\b|\bplus\b|\bas\s+well\s+as\b/g;
/** Words that may sit between two listed measures ("heat and drought", "rain, soil and snow"). */
const LIST_GAP = /^\s*(?:(?:,|&|\/|\band\b|\bor\b|\bplus\b|\bas\s+well\s+as\b)\s*)+(?:the\s+)?$/;

const FILLER = new Set(
  (
    "where which what when how show find me list map top most strongest biggest largest worst best significant significantly strong strongly " +
    "area areas place places region regions zone zones spot spots hotspot hotspots part parts land lands " +
    "that have has had did does do is are was were been be being experienced experiencing experience saw seen see getting got gets get become became becoming " +
    "with a an the of in on near around over during and or to by for from at within inside across throughout between than since after before " +
    "health cover index level levels condition conditions amount amounts value values rate rates there it its this these those any all some " +
    "years year decade decades last past previous recent recently ago now today vs versus compared against per " +
    "up down out away off happening happened happen going much many very still really both either way ways direction directions"
  ).split(" "),
);

const NOT_A_PLACE = /^(?:the\s+)?(?:world|globe|earth|planet|everywhere|anywhere|map|view|map view|this area|this view|here|my area)$/i;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Same-length normalisation so indices still point into the original text. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[–—−]/g, "-").replace(/[’']/g, "'");
}

function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + " ".repeat(end - start) + text.slice(end);
}

/** Every match of a pattern (the pattern's own flags are ignored). */
function matchesOf(pattern: RegExp, text: string): RegExpExecArray[] {
  const global = new RegExp(pattern.source, "g");
  const out: RegExpExecArray[] = [];
  for (let match = global.exec(text); match; match = global.exec(text)) {
    if (match[0].length === 0) global.lastIndex += 1;
    else out.push(match);
  }
  return out;
}

function seasonFromWord(word: string | undefined): Exclude<SeasonId, "custom"> | null {
  if (!word) return null;
  if (word === "summer") return "summer";
  if (word === "winter") return "winter";
  if (word === "spring") return "spring";
  if (word === "autumn" || word === "fall") return "autumn";
  if (word.startsWith("growing")) return "growing";
  if (word === "monsoon") return "summer";
  return null;
}

function monthFromWord(word: string | undefined): number | null {
  if (!word) return null;
  const index = MONTHS.findIndex((m) => m.startsWith(word.slice(0, 3)));
  return index >= 0 ? index + 1 : null;
}

function parseCount(word: string | undefined): number {
  if (!word) return 1;
  const n = Number(word);
  return Number.isFinite(n) ? n : (NUMBER_WORDS[word] ?? 1);
}

interface TimeResult {
  time: TimeSpec;
  season: Exclude<SeasonId, "custom"> | null;
  months: number[] | null;
  /** Lower-cased text with the time phrases blanked out. */
  rest: string;
}

function parseTime(lower: string): TimeResult {
  let rest = lower;
  let season: Exclude<SeasonId, "custom"> | null = null;
  let months: number[] | null = null;
  const take = (match: RegExpExecArray) => {
    rest = blank(rest, match.index, match.index + match[0].length);
  };

  // "summer 2023 vs summer 2013", "July 2013 compared to July 2023", "2013 versus 2023"
  const versus = new RegExp(
    String.raw`(?:\b(${SEASON_WORD}|${MONTH_WORD})\s+(?:of\s+)?)?\b${YEAR}\s*(?:vs\.?|versus|compared\s+(?:to|with)|against|and)\s*(?:(?:the\s+)?(${SEASON_WORD}|${MONTH_WORD})\s+(?:of\s+)?)?${YEAR}\b`,
  ).exec(rest);
  const versusExplicit = versus && /vs|versus|compared|against/.test(versus[0]);
  if (versus && (versusExplicit || versus[1] || versus[3])) {
    take(versus);
    const a = Number(versus[2]);
    const b = Number(versus[4]);
    const word = versus[1] ?? versus[3];
    season = seasonFromWord(word);
    const month = season ? null : monthFromWord(word);
    if (month) months = [month];
    return { time: { kind: "versus", baseline: Math.min(a, b), recent: Math.max(a, b) }, ...readMonths(rest, season, months) };
  }

  const range = new RegExp(String.raw`(?:\b(?:from|between|in|during|over)\s+)?\b${YEAR}\s*(?:-|to|until|till|through|thru|and)\s*${YEAR}\b`).exec(rest);
  let time: TimeSpec = { kind: "default" };
  if (range) {
    take(range);
    const a = Number(range[1]);
    const b = Number(range[2]);
    time = { kind: "range", start: Math.min(a, b), end: Math.max(a, b) };
  } else {
    const since = new RegExp(String.raw`\b(?:since|from|after|starting(?:\s+in)?|beginning(?:\s+in)?)\s+${YEAR}\b`).exec(rest);
    const last = /\b(?:(?:over|in|during|for|within)\s+)?(?:the\s+)?(?:last|past|previous|recent)\s+(?:(\d{1,2}|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|few|several|couple(?:\s+of)?)\s+)?(years?|decades?)\b/.exec(rest);
    const decadeOnly = /\b(?:(?:over|in|during|for)\s+)?(?:the\s+)?(?:last|past)\s+decade\b|\ba\s+decade\b/.exec(rest);
    if (since) {
      take(since);
      time = { kind: "since", start: Number(since[1]) };
    } else if (last) {
      take(last);
      const count = parseCount(last[1]?.replace(/\s+of$/, ""));
      time = { kind: "last", years: Math.max(1, Math.min(40, last[2].startsWith("decade") ? count * 10 : count)) };
    } else if (decadeOnly) {
      take(decadeOnly);
      time = { kind: "last", years: 10 };
    } else {
      const single = new RegExp(String.raw`(?:\b(?:in|during|for|of)\s+)?(?:(?:the\s+)?(${SEASON_WORD}|${MONTH_WORD})\s+(?:of\s+)?)?\b${YEAR}\b`).exec(rest);
      if (single) {
        take(single);
        time = { kind: "year", year: Number(single[2]) };
        season = seasonFromWord(single[1]);
        const month = season ? null : monthFromWord(single[1]);
        if (month) months = [month];
      }
    }
  }

  return { time, ...readMonths(rest, season, months) };
}

const FULL_MONTH = String.raw`(?:january|february|march|april|may|june|july|august|september|october|november|december)`;

/** Months asked without a year: "April to September", "June, July and August", "all year round", "in summer". */
function readMonths(
  rest: string,
  season: Exclude<SeasonId, "custom"> | null,
  months: number[] | null,
): { season: Exclude<SeasonId, "custom"> | null; months: number[] | null; rest: string } {
  if (season || months) return { season, months, rest };
  const take = (match: RegExpExecArray) => {
    rest = blank(rest, match.index, match.index + match[0].length);
  };
  const allYear = /\b(?:all\s+year(?:\s+round)?|year[\s-]round|every\s+month|all\s+months|(?:the\s+)?whole\s+year)\b/.exec(rest);
  if (allYear) {
    take(allYear);
    return { season: "all", months: null, rest };
  }
  const cold = /\b(?:(?:in|during|over)\s+)?(?:the\s+)?(?:snow|cold)\s+(?:season|months)\b/.exec(rest);
  if (cold) {
    take(cold);
    return { season: "cold", months: null, rest };
  }
  // Two or more months: a range ("April to September") or a list ("June, July and August").
  const word = String.raw`${MONTH_WORD}\b`;
  const list = new RegExp(String.raw`\b(?:(?:in|during|for|from|between|each|every)\s+)?${word}(?:\s*(?:,|and|&|to|through|thru|until|till|-)\s*${word})+`).exec(rest);
  if (list) {
    take(list);
    const named = matchesOf(new RegExp(String.raw`\b${word}`), list[0]).map((m) => monthFromWord(m[0]) as number);
    const isRange = named.length === 2 && /\b(?:to|through|thru|until|till)\b|-/.test(list[0]);
    if (isRange) {
      const run: number[] = [];
      for (let m = named[0], i = 0; i < 12; m = (m % 12) + 1, i++) {
        run.push(m);
        if (m === named[1]) break;
      }
      return { season: null, months: run, rest };
    }
    return { season: null, months: [...new Set(named)].sort((a, b) => a - b), rest };
  }
  const single = new RegExp(String.raw`\b(?:in|during|each|every)\s+(${FULL_MONTH})\b`).exec(rest);
  if (single) {
    take(single);
    return { season: null, months: [monthFromWord(single[1]) as number], rest };
  }
  // A season word on its own ("in summer", "during the growing season").
  const seasonWord = new RegExp(String.raw`\b(?:(?:in|during|over|for)\s+)?(?:the\s+)?(summer|winter|spring|autumn|growing season|monsoon)s?(?:\s+(?:season|months?))?\b`).exec(rest);
  if (seasonWord) {
    take(seasonWord);
    return { season: seasonFromWord(seasonWord[1]), months: null, rest };
  }
  return { season, months, rest };
}

// ---------------------------------------------------------------------------
// Measures, directions and things we can't measure

interface Mention {
  indicator: IndicatorId;
  start: number;
  end: number;
  strong: boolean;
  /** Direction carried by the word itself ("hotter"). */
  own: Exclude<Direction, "any"> | null;
  /** The words describe the opposite of the measure: a shrinking ozone hole is more ozone. */
  inverted?: boolean;
}

interface DirectionWord {
  direction: Direction;
  start: number;
}

function ownDirection(indicator: IndicatorId, word: string): Exclude<Direction, "any"> | null {
  return OWN_DIRECTION.find((rule) => rule.indicator === indicator && rule.pattern.test(word))?.direction ?? null;
}

function hasMeasureWord(text: string, includeWeak = true): boolean {
  return MEASURES.some((m) => m.strong.test(text) || (includeWeak && Boolean(m.weak?.test(text))));
}

function readConcepts(text: string, lower: string, rest: string): { notes: ReaderNote[]; mentions: Mention[]; rest: string } {
  const notes: ReaderNote[] = [];
  const mentions: Mention[] = [];
  const measured = hasMeasureWord(rest, false);
  for (const concept of CONCEPTS) {
    if (concept.onlyWithoutMeasures && measured) continue;
    if (concept.requires && !concept.requires.test(lower)) continue;
    const found = matchesOf(concept.pattern, rest);
    if (!found.length) continue;
    for (const match of found) {
      rest = blank(rest, match.index, match.index + match[0].length);
      if (concept.kind === "approximate") {
        for (const indicator of concept.closest) mentions.push({ indicator, start: match.index, end: match.index + match[0].length, strong: true, own: null });
      }
    }
    const first = found[0];
    notes.push({
      id: concept.id,
      kind: concept.kind,
      phrase: text.slice(first.index, first.index + first[0].length),
      message: concept.message,
      closest: concept.closest,
      direction: concept.direction,
    });
  }
  return { notes, mentions, rest };
}

function readMeasures(rest: string, lower: string): { mentions: Mention[]; rest: string } {
  const strong: Mention[] = [];
  const weak: Mention[] = [];
  for (const measure of MEASURES) {
    for (const match of matchesOf(measure.strong, rest)) {
      const inverted = measure.id === "ozone" && /\bhole\b/.test(match[0]);
      strong.push({ indicator: measure.id, start: match.index, end: match.index + match[0].length, strong: true, own: ownDirection(measure.id, match[0]), inverted });
      rest = blank(rest, match.index, match.index + match[0].length);
    }
  }
  for (const measure of MEASURES) {
    if (!measure.weak) continue;
    for (const match of matchesOf(measure.weak, rest)) {
      weak.push({ indicator: measure.id, start: match.index, end: match.index + match[0].length, strong: false, own: ownDirection(measure.id, match[0]) });
      rest = blank(rest, match.index, match.index + match[0].length);
    }
  }
  // Weather words count when nothing is named, or when listed next to another measure.
  const listed = (a: Mention, b: Mention) => {
    const [first, second] = a.start < b.start ? [a, b] : [b, a];
    return LIST_GAP.test(lower.slice(first.end, second.start));
  };
  const all = [...strong, ...weak];
  const keptWeak = strong.length ? weak.filter((w) => all.some((other) => other !== w && listed(w, other))) : weak;
  return { mentions: [...strong, ...keptWeak].sort((a, b) => a.start - b.start), rest };
}

/** "increase or decrease": read before measures are removed, so "decline and heat increase" stays two directions. */
function readBothWays(rest: string): { words: DirectionWord[]; rest: string } {
  const words: DirectionWord[] = [];
  for (const match of matchesOf(BOTH, rest)) {
    words.push({ direction: "any", start: match.index });
    rest = blank(rest, match.index, match.index + match[0].length);
  }
  return { words, rest };
}

function readDirectionWords(rest: string, both: DirectionWord[]): { words: DirectionWord[]; rest: string } {
  const words: DirectionWord[] = [...both];
  for (const [direction, pattern] of [
    ["decline", DECLINE],
    ["increase", INCREASE],
    ["any", ANY],
  ] as const) {
    for (const match of matchesOf(pattern, rest)) {
      words.push({ direction, start: match.index });
      rest = blank(rest, match.index, match.index + match[0].length);
    }
  }
  return { words: words.sort((a, b) => a.start - b.start), rest };
}

/** Gives each measure the direction asked for it. */
function assignDirections(mentions: Mention[], words: DirectionWord[], clauseText: string): Partial<Record<IndicatorId, Direction>> {
  const breaks = matchesOf(CLAUSE_BREAK, clauseText).map((m) => m.index);
  const clauseOf = (position: number) => breaks.filter((b) => b < position).length;
  const clauseBounds = (clause: number) => [clause === 0 ? 0 : breaks[clause - 1], clause < breaks.length ? breaks[clause] : clauseText.length] as const;
  const resolved = new Map<Mention, Direction>();
  /** Directions written as words ("decline"), which listed measures may share. */
  const asked = new Set<Mention>();
  const flip = (mention: Mention, direction: Direction): Direction =>
    !mention.inverted || direction === "any" ? direction : direction === "decline" ? "increase" : "decline";

  for (const mention of mentions) {
    if (mention.own) {
      resolved.set(mention, mention.own);
      continue;
    }
    const clause = clauseOf(mention.start);
    const near = words.filter((w) => clauseOf(w.start) === clause).sort((a, b) => Math.abs(a.start - mention.start) - Math.abs(b.start - mention.start))[0];
    if (near) {
      resolved.set(mention, flip(mention, near.direction));
      asked.add(mention);
      continue;
    }
    const [from, to] = clauseBounds(clause);
    const implied = CLAUSE_DIRECTION.find((rule) => rule.indicator === mention.indicator && rule.pattern.test(clauseText.slice(from, to)));
    if (implied) resolved.set(mention, implied.direction);
  }
  // "vegetation and rainfall decline": a listed measure shares its neighbour's direction.
  for (const mention of mentions) {
    if (resolved.has(mention)) continue;
    const neighbour = [...asked].sort((a, b) => Math.abs(a.start - mention.start) - Math.abs(b.start - mention.start))[0];
    resolved.set(mention, neighbour ? (resolved.get(neighbour) as Direction) : "any");
  }

  const out: Partial<Record<IndicatorId, Direction>> = {};
  for (const indicator of new Set(mentions.map((m) => m.indicator))) {
    const asked = new Set(mentions.filter((m) => m.indicator === indicator).map((m) => resolved.get(m) as Direction).filter((d) => d !== "any"));
    // Two different directions for one measure ("greening and browning"): either way.
    out[indicator] = asked.size === 1 ? [...asked][0] : "any";
  }
  return out;
}

function isDescriptorOnly(phrase: string): boolean {
  const lower = phrase.toLowerCase();
  if (hasMeasureWord(lower)) return true;
  if (DECLINE.test(lower) || INCREASE.test(lower) || ANY.test(lower)) return true;
  return lower.split(/\s+/).every((word) => FILLER.has(word) || /^\d+$/.test(word));
}

function cleanPlace(phrase: string): string {
  return phrase
    .replace(/[?.!,;:]+$/g, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\s+(?:area|areas|vicinity|surroundings)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlace(text: string, rest: string): { place: string | null; near: boolean } {
  // The original text (with its capitals) minus everything already read.
  const original = Array.from(text, (char, i) => (rest[i] === " " ? " " : char)).join("");
  // Candidates follow a preposition and run until a stop word or the end.
  const pattern = /\b(in|near|around|across|over|of|at|within|inside|throughout|for|close to|next to)\s+([^,?.!;]+)/g;
  const stop = /\s+(?:since|from|between|during|over|after|before|vs|versus|compared|in the|over the|for the|with|that|which|where|when|while|because|due)\b/;
  const candidates: { text: string; near: boolean }[] = [];
  for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
    const start = match.index + match[0].length - match[2].length;
    let segment = match[2];
    const cut = stop.exec(` ${segment}`);
    if (cut) segment = segment.slice(0, Math.max(0, cut.index - 1));
    // Read the words back from the original text to keep their capitals.
    const raw = cleanPlace(original.slice(start, start + segment.length).trim());
    if (raw && !isDescriptorOnly(raw) && wordCount(raw) <= 6) candidates.push({ text: raw, near: /near|around|close|next/.test(match[1]) });
    pattern.lastIndex = match.index + match[1].length + 1;
  }
  const chosen = candidates[candidates.length - 1];
  if (chosen) return NOT_A_PLACE.test(chosen.text) ? { place: null, near: false } : { place: chosen.text, near: chosen.near };

  // No preposition: whatever is left once the known words are removed ("Uzbekistan vegetation 2015-2024").
  const words: string[] = [];
  const tokens = rest.split(/(\s+)/);
  let offset = 0;
  for (const token of tokens) {
    const word = token.trim();
    if (word) {
      const lowerWord = word.replace(/[?.!,;:]+$/, "");
      const keep = lowerWord.length >= 2 && !FILLER.has(lowerWord) && !/^\d+$/.test(lowerWord) && !isDescriptorOnly(lowerWord);
      if (keep) words.push(original.slice(offset, offset + lowerWord.length));
    }
    offset += token.length;
  }
  const leftover = cleanPlace(words.join(" "));
  if (!leftover || NOT_A_PLACE.test(leftover)) return { place: null, near: false };
  return { place: leftover, near: false };
}

/** Words that, with no measure named, ask about every measure ("what changed in Uzbekistan"). */
const ASKS_FOR_CHANGE = /\b(?:declin\w*|decreas\w*|increas\w*|chang(?:e|es|ed|ing)|trends?|shift(?:s|ed|ing)?|anomal(?:y|ies|ous))\b/;

/** Reads a free-text question into its parts. Never throws. */
export function parseTrendQuery(input: string): ParsedQuery {
  const text = input.trim().replace(/\s+/g, " ");
  const lower = normalise(text);
  const time = parseTime(lower);
  const concepts = readConcepts(text, lower, time.rest);
  const both = readBothWays(concepts.rest);
  const measures = readMeasures(both.rest, time.rest);
  const directions = readDirectionWords(measures.rest, both.words);
  const mentions = [...concepts.mentions, ...measures.mentions].sort((a, b) => a.start - b.start);

  let indicators = [...new Set(mentions.map((m) => m.indicator))];
  const clauseText = both.words.length ? matchesOf(BOTH, time.rest).reduce((acc, m) => blank(acc, m.index, m.index + m[0].length), time.rest) : time.rest;
  let perIndicator = assignDirections(mentions, directions.words, clauseText);
  let everything = false;
  const unmeasured = concepts.notes.some((n) => n.kind === "unmeasured");
  if (!indicators.length && !unmeasured && (EVERYTHING.test(time.rest) || BOTH.test(time.rest) || ASKS_FOR_CHANGE.test(time.rest))) {
    everything = true;
    indicators = [...CORE_INDICATORS];
    const direction = directions.words[0]?.direction ?? "any";
    perIndicator = Object.fromEntries(indicators.map((id) => [id, direction]));
  }
  const values = indicators.map((id) => perIndicator[id] ?? "any");
  const direction: Direction = values.length && values.every((d) => d === values[0]) ? values[0] : (values[0] ?? (directions.words[0]?.direction ?? "any"));

  // Everything is read except the place: remove it all, and what's left (after a preposition) is the place.
  const placeText = matchesOf(EVERYTHING, directions.rest).reduce((acc, m) => blank(acc, m.index, m.index + m[0].length), directions.rest);
  const { place, near } = parsePlace(text, placeText);
  return {
    text,
    isTrendQuery: indicators.length > 0 || unmeasured,
    indicators,
    everything,
    directions: perIndicator,
    indicator: indicators[0] ?? null,
    direction,
    place,
    near,
    time: time.time,
    season: time.season,
    months: time.months,
    notes: concepts.notes,
  };
}
