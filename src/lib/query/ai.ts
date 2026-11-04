// Optional help for questions the rules can't read. Only used when VITE_AI_ANALYSIS_ENDPOINT points
// at your own backend; the answer is checked field by field and anything unexpected is dropped.
// Without the endpoint the rule-based parser is all there is — and it handles the common phrasings.

import { AI_ENDPOINT } from "../analysisClient";
import { INDICATOR_ORDER, INDICATORS, type Direction, type IndicatorId } from "./indicators";
import type { TimeSpec } from "./parse";

export interface AiInterpretation {
  /** One or more measures, in the order of INDICATOR_ORDER. */
  indicators: IndicatorId[];
  direction: Direction;
  place: string | null;
  time: TimeSpec;
}

const YEAR = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1980 && value <= 2100 ? value : null);

/** Keeps only well-formed fields from the endpoint's JSON answer. */
export function sanitizeInterpretation(json: unknown): AiInterpretation | null {
  if (!json || typeof json !== "object") return null;
  const data = json as Record<string, unknown>;
  // "indicators": [...] (several measures), or the older single "indicator".
  const asked = Array.isArray(data.indicators) ? data.indicators : [data.indicator];
  const wanted = new Set(asked.filter((id): id is IndicatorId => typeof id === "string" && id in INDICATORS));
  const indicators = INDICATOR_ORDER.filter((id) => wanted.has(id));
  if (!indicators.length) return null;
  const direction: Direction = data.direction === "decline" || data.direction === "increase" ? data.direction : "any";
  const place = typeof data.place === "string" && data.place.trim() && data.place.length <= 80 ? data.place.trim() : null;
  let time: TimeSpec = { kind: "default" };
  const t = data.time as Record<string, unknown> | undefined;
  if (t && typeof t === "object") {
    const start = YEAR(t.start);
    const end = YEAR(t.end);
    const years = typeof t.years === "number" && t.years >= 1 && t.years <= 40 ? Math.round(t.years) : null;
    if (t.kind === "since" && start) time = { kind: "since", start };
    else if (t.kind === "range" && start && end) time = { kind: "range", start: Math.min(start, end), end: Math.max(start, end) };
    else if (t.kind === "last" && years) time = { kind: "last", years };
  }
  return { indicators, direction, place, time };
}

export function isQueryAiConfigured(): boolean {
  return Boolean(AI_ENDPOINT);
}

/** Asks the configured endpoint to read a question; null when it isn't configured or can't help. */
export async function interpretWithAi(text: string, signal?: AbortSignal): Promise<AiInterpretation | null> {
  if (!AI_ENDPOINT) return null;
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      task: "interpret-trend-question",
      text,
      instructions:
        `Return JSON {"indicators": a list of one or more of ${INDICATOR_ORDER.map((id) => `"${id}"`).join(",")}; "direction": "decline"|"increase"|"any"; "place": string or null; "time": {"kind":"since","start":year} | {"kind":"range","start":year,"end":year} | {"kind":"last","years":n} | {"kind":"default"}}. Do not add any other text.`,
    }),
  });
  if (!response.ok) return null;
  return sanitizeInterpretation(await response.json());
}
