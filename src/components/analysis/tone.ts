// Colour means one thing across the site: a tested change. Amber is the worrying direction, green the
// welcome one, plain ink a change with no good or bad side, and grey means no clear change at all.

type Direction = "decline" | "increase" | "none";
type Concern = "decline" | "increase" | "none";

export type Tone = "warn" | "good" | "plain" | "none";

export function toneOf(direction: Direction, concern: Concern): Tone {
  if (direction === "none") return "none";
  if (concern === "none") return "plain";
  return direction === concern ? "warn" : "good";
}

/** For text. */
export const TONE_TEXT: Record<Tone, string> = {
  warn: "text-tone-warn",
  good: "text-tone-good",
  plain: "text-foreground",
  none: "text-muted-foreground",
};

/** For a trend drawn in a chart. */
export const TONE_COLOUR: Record<Tone, string> = {
  warn: "hsl(var(--tone-warn))",
  good: "hsl(var(--tone-good))",
  plain: "currentColor",
  none: "currentColor",
};
