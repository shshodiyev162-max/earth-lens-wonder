// A rule-based reader for trend questions such as
//   "where did vegetation decline in Uzbekistan since 2015"
//   "summer 2023 vs summer 2013 heat in Tashkent"
// It pulls out the indicator, the direction of change, the place and the time, and leaves
// anything it can't place in `place` (to be geocoded) — no AI service is needed.

import type { Direction, IndicatorId, SeasonId } from "./indicators";

export type TimeSpec =
  | { kind: "default" }
  | { kind: "since"; start: number }
  | { kind: "range"; start: number; end: number }
  | { kind: "last"; years: number }
  | { kind: "year"; year: number }
  | { kind: "versus"; baseline: number; recent: number };

export interface ParsedQuery {
  text: string;
  /** True when the text asks about an environmental indicator (not just a place). */
  isTrendQuery: boolean;
  indicator: IndicatorId | null;
  direction: Direction;
  place: string | null;
  /** "near the Aral Sea": widen the area around the place. */
  near: boolean;
  time: TimeSpec;
  season: Exclude<SeasonId, "custom"> | null;
  /** Explicit months ("July 2023 vs July 2013"), 1–12. */
  months: number[] | null;
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

// Indicator words, most specific first (that order also breaks ties).
const INDICATOR_PATTERNS: [IndicatorId, RegExp][] = [
  ["soil", /\bsoils?(?:\s+(?:moisture|water|wetness))?\b|\bmoisture\b/],
  ["snow", /\bsnow(?:\s?cover|pack|fall|line)?\b|\bglaciers?\b|\bice\s+cover\b/],
  ["vegetation", /\bvegetation\b|\bndvi\b|\bevi\b|\bgreen(?:ness|er|ing)\b|\bplants?\b|\bcrops?\b|\bcropland\b|\bfarm(?:land|s)?\b|\bforests?\b|\bdeforestation\b|\bdesertification\b|\bbrowning\b|\bpastures?\b|\bgrass(?:land)?s?\b/],
  ["dust", /\bdust(?:y|ier|storms?)?\b|\baerosols?\b|\bhaz(?:e|y|ier)\b|\baod\b|\bsand\s?storms?\b|\bair\s+(?:quality|pollution)\b|\bparticulates?\b/],
  ["heat", /\bhot(?:ter|test)?\b|\bheat(?:\s?waves?|ing)?\b|\bwarm(?:er|ing|est|th)?\b|\btemperatures?\b|\blst\b|\bcool(?:er|ing)\b/],
  ["rainfall", /\brain(?:fall|s|y|ier)?\b|\bprecipitation\b|\bdroughts?\b|\bdr(?:y|ier|ying|ied)\b|\bwetter\b|\bmonsoon\b|\barid(?:ity)?\b/],
];

// Words that imply a direction for one indicator ("hotter" is an increase in heat).
const IMPLIED: { indicator: IndicatorId | "any"; direction: Exclude<Direction, "any">; pattern: RegExp }[] = [
  { indicator: "rainfall", direction: "decline", pattern: /\bdroughts?\b|\bdr(?:y|ier|ying|ied)\b|\barid(?:ity)?\b/ },
  { indicator: "soil", direction: "decline", pattern: /\bdr(?:y|ier|ying|ied)\b|\bdroughts?\b/ },
  { indicator: "vegetation", direction: "decline", pattern: /\bbrowning\b|\bdeforestation\b|\bdesertification\b|\bdie-?off\b|\bdroughts?\b/ },
  { indicator: "vegetation", direction: "increase", pattern: /\bgreening\b|\bgreener\b/ },
  { indicator: "heat", direction: "increase", pattern: /\bhotter\b|\bhottest\b|\bwarm(?:er|ing)\b|\bheat\s?waves?\b|\bheating\b/ },
  { indicator: "heat", direction: "decline", pattern: /\bcool(?:er|ing)\b/ },
  { indicator: "rainfall", direction: "increase", pattern: /\bwetter\b|\brainier\b|\bflood(?:s|ing)?\b/ },
  { indicator: "snow", direction: "decline", pattern: /\bmelt(?:s|ing|ed)?\b|\bretreat(?:s|ing|ed)?\b/ },
  { indicator: "dust", direction: "increase", pattern: /\bdustier\b|\bhazier\b|\bsand\s?storms?\b/ },
];

const DECLINE = /\b(?:declin\w*|decreas\w*|loss(?:es)?|lost|losing|lose|less|fewer|drop\w*|fell|falling|fallen|falls|shrink\w*|shrank|degrad\w*|retreat\w*|melt\w*|reduc\w*|lower\w*|weaken\w*|worsen\w*|die-?off|dying|thinn\w*|disappear\w*|vanish\w*|deplet\w*)\b/;
const INCREASE = /\b(?:increas\w*|gain\w*|more|ris(?:e|es|ing|en)|rose|grow(?:s|ing|n|th)?|higher|expand\w*|spread\w*|surg\w*|spik\w*|intensif\w*|boost\w*)\b/;
const ANY = /\b(?:chang\w*|trend\w*|shift\w*|anomal\w*|differen\w*|evolv\w*)\b/;

const FILLER = new Set(
  (
    "where which what when how show find me list map top most strongest biggest largest worst best significant significantly strong strongly " +
    "area areas place places region regions zone zones spot spots hotspot hotspots part parts land lands " +
    "that have has had did does do is are was were been be being experienced experiencing experience saw seen see getting got gets get become became becoming " +
    "with a an the of in on near around over during and or to by for from at within inside across throughout between than since after before " +
    "health cover index level levels condition conditions amount amounts value values rate rates there it its this these those any all some " +
    "years year decade decades last past previous recent recently ago now today vs versus compared against per"
  ).split(" "),
);

const NOT_A_PLACE = /^(?:the\s+)?(?:world|globe|earth|planet|everywhere|anywhere|map|view|this area|here|my area)$/i;

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
    return { time: { kind: "versus", baseline: Math.min(a, b), recent: Math.max(a, b) }, season, months, rest };
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

  // A season word on its own ("in summer", "during the growing season").
  if (!season && !months) {
    const word = new RegExp(String.raw`\b(?:(?:in|during|over|for)\s+)?(?:the\s+)?(summer|winter|spring|autumn|growing season|monsoon)s?(?:\s+(?:season|months?))?\b`).exec(rest);
    if (word) {
      take(word);
      season = seasonFromWord(word[1]);
    }
  }
  return { time, season, months, rest };
}

function firstMatch(pattern: RegExp, text: string): number {
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

function parseIndicator(lower: string): IndicatorId | null {
  // Specific nouns win over generic weather words ("vegetation decline during a drought" is about vegetation).
  for (const [id, pattern] of INDICATOR_PATTERNS) if (pattern.test(lower)) return id;
  return null;
}

function parseDirection(lower: string, indicator: IndicatorId | null): Direction {
  for (const rule of IMPLIED) {
    if ((rule.indicator === indicator || rule.indicator === "any") && rule.pattern.test(lower)) return rule.direction;
  }
  const positions: [Direction, number][] = [
    ["decline", firstMatch(DECLINE, lower)],
    ["increase", firstMatch(INCREASE, lower)],
    ["any", firstMatch(ANY, lower)],
  ];
  const found = positions.filter(([, index]) => index >= 0).sort((a, b) => a[1] - b[1]);
  return found.length ? found[0][0] : "any";
}

function isDescriptorOnly(phrase: string): boolean {
  const lower = phrase.toLowerCase();
  if (INDICATOR_PATTERNS.some(([, pattern]) => pattern.test(lower))) return true;
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
  // The original text (with its capitals) minus everything the time parser already used.
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

/** Reads a free-text question into its parts. Never throws. */
export function parseTrendQuery(input: string): ParsedQuery {
  const text = input.trim().replace(/\s+/g, " ");
  const lower = normalise(text);
  const { time, season, months, rest } = parseTime(lower);
  const indicator = parseIndicator(rest);
  const direction = parseDirection(rest, indicator);
  const { place, near } = parsePlace(text, rest);
  return { text, isTrendQuery: indicator !== null, indicator, direction, place, near, time, season, months };
}
