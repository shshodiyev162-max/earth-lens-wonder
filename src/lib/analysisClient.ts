// Optional AI narrative. When VITE_AI_ANALYSIS_ENDPOINT points at your own
// backend, the measured facts are POSTed to it (see buildAiPayload) and a
// language model can rewrite them as a short briefing ({summary, bullets}).
// Without it the app shows the built-in, data-driven summary — nothing is
// mocked either way. Keep model API keys on that backend, never in the app.

import type { InsightReport } from "./analysis/insights";
import type { AnalysisResult } from "./analysis/types";

export const AI_ENDPOINT = (import.meta.env.VITE_AI_ANALYSIS_ENDPOINT as string | undefined)?.trim() || undefined;

export interface AiNarrative {
  summary: string;
  bullets: string[];
}

export const AI_ANALYSIS_SYSTEM_PROMPT = `
You explain NASA Earth-observation measurements to non-experts.
You receive measured facts (already computed from NASA GIBS satellite imagery and NASA POWER climate data) for one area and period.
Write a short briefing:
- "summary": 2–3 sentences in plain language.
- "bullets": 3–5 short observations.
Rules: use only the numbers provided, never invent values, mention uncertainty briefly (clouds, grid resolution), avoid jargon (say "plant greenness" for NDVI), and never give safety-critical instructions.
Respond with JSON: {"summary": string, "bullets": string[]}.
`.trim();

export function isAiConfigured(): boolean {
  return Boolean(AI_ENDPOINT);
}

export function buildAiPayload(result: AnalysisResult, report: InsightReport) {
  return {
    systemPrompt: AI_ANALYSIS_SYSTEM_PROMPT,
    area: {
      name: result.target.name,
      context: result.target.context ?? null,
      areaKm2: Math.round(result.target.areaKm2),
      center: result.target.center,
    },
    period: { start: result.start, end: result.end },
    concern: report.concern,
    findings: report.findings.map((f) => ({ title: f.title, detail: f.detail, tone: f.tone })),
    indicators: report.kpis.map((k) => ({ label: k.label, value: k.value, note: k.sub })),
    caveats: report.caveats,
  };
}

export async function requestAiNarrative(result: AnalysisResult, report: InsightReport, signal?: AbortSignal): Promise<AiNarrative> {
  if (!AI_ENDPOINT) throw new Error("AI endpoint is not configured");
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAiPayload(result, report)),
    signal,
  });
  if (!response.ok) throw new Error(`AI endpoint returned ${response.status}`);
  const data = (await response.json()) as Partial<AiNarrative>;
  if (typeof data.summary !== "string" || !data.summary.trim()) throw new Error("AI endpoint returned no summary");
  return {
    summary: data.summary.trim(),
    bullets: Array.isArray(data.bullets) ? data.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0).slice(0, 6) : [],
  };
}
