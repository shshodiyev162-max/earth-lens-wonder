import { describe, expect, it } from "vitest";
import { MEASURE_DEFINITIONS, METRIC_DEFINITIONS, TERMS } from "../glossary";
import { METRICS } from "../analysis/metrics";
import { INDICATOR_ORDER } from "../query/indicators";

const JARGON = /\b(JSON|API|pipeline|LLM|token|endpoint|raster|WMS|GIBS|colormap|null|NaN|undefined)\b/i;

describe("plain definitions", () => {
  const all = [
    ...INDICATOR_ORDER.map((id) => [`measure ${id}`, MEASURE_DEFINITIONS[id]] as const),
    ...METRICS.map((m) => [`metric ${m.id}`, METRIC_DEFINITIONS[m.id]] as const),
    ...TERMS.map((t) => [`term ${t.term}`, t.meaning] as const),
  ];

  it.each(all)("%s is defined in one or two short sentences", (_, text) => {
    expect(text?.trim().length).toBeGreaterThan(20);
    expect(text.length).toBeLessThanOrEqual(220);
    expect(text.split(/(?<=[.!?])\s+(?=[A-Z“])/).length).toBeLessThanOrEqual(2);
    expect(text).toMatch(/[.)]$/);
  });

  it.each(all)("%s avoids technical jargon", (_, text) => {
    expect(text).not.toMatch(JARGON);
  });

  it("explains every statistics word the results use", () => {
    const terms = TERMS.map((t) => t.term);
    for (const word of ["Trend", "Sen's slope", "Mann–Kendall test", "p-value", "Significant", "95% range", "t-test", "Hotspot"]) expect(terms).toContain(word);
  });
});
