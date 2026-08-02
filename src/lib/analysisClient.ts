export type AnalysisInputs = {
  region: string;
  startDate: string;
  endDate: string;
  layerIds: string[];
};

export type SummaryStats = {
  metricName: string;
  units: string;
  min: number;
  max: number;
  mean: number;
  trend: "increasing" | "decreasing" | "stable";
};

export type AiInsight = {
  summary: string;
  bullets: string[];
  riskLevel: "low" | "medium" | "high" | "unknown";
};

export const AI_ANALYSIS_SYSTEM_PROMPT = `
You are an assistant that explains satellite-based environmental analyses to non-experts.

You are given:
- A region name.
- A time period.
- One or more map data layers (for example vegetation index, sea surface temperature, snow cover, aerosols).
- Simple numeric summary statistics (min, max, mean, trend over time).

Your job:
- Explain what the numbers and trends **probably mean in everyday language**.
- Focus on patterns: is something increasing, decreasing, or relatively stable?
- Highlight any **notable anomalies** (sudden spikes, unusually high or low values) only when they are clearly indicated in the summary statistics.
- Always mention **uncertainty**: satellite data can be noisy, clouds may obscure regions, and other local factors may not be visible.
- Avoid technical jargon (for example, say "plant greenness" instead of "NDVI" unless it is briefly explained).
- Never give safety‑critical advice (for example, evacuation orders, medical advice, or infrastructure decisions).

Output format:
1. A short 2–3 sentence paragraph in plain language.
2. A bullet list (3–5 items) of key observations.
3. A single overall risk or concern level: "low", "medium", or "high" based on how unusual or worrisome the patterns seem.
`.trim();

const AI_ENDPOINT = import.meta.env.VITE_AI_ANALYSIS_ENDPOINT as string | undefined;

export async function runMapAnalysis(
  inputs: AnalysisInputs,
  stats: SummaryStats[],
): Promise<AiInsight> {
  if (!AI_ENDPOINT) {
    return mockAiInsight(inputs, stats);
  }

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs,
        stats,
        systemPrompt: AI_ANALYSIS_SYSTEM_PROMPT,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI endpoint returned ${response.status}`);
    }

    const data = await response.json();

    if (data && typeof data.summary === "string" && Array.isArray(data.bullets)) {
      return {
        summary: data.summary,
        bullets: data.bullets,
        riskLevel: data.riskLevel === "low" || data.riskLevel === "medium" || data.riskLevel === "high"
          ? data.riskLevel
          : "unknown",
      };
    }

    return mockAiInsight(inputs, stats);
  } catch (error) {
    console.error("AI analysis failed, falling back to mock insight:", error);
    return mockAiInsight(inputs, stats);
  }
}

function mockAiInsight(inputs: AnalysisInputs, stats: SummaryStats[]): AiInsight {
  const primary = stats[0];
  const region = inputs.region;

  const trendText =
    primary.trend === "increasing"
      ? "a gentle upward trend over time"
      : primary.trend === "decreasing"
      ? "a gentle downward trend over time"
      : "relatively stable values over time";

  const summary = [
    `Between ${inputs.startDate} and ${inputs.endDate}, the satellite data for ${region} shows ${trendText} in ${primary.metricName.toLowerCase()}.`,
    `Values typically sit around ${primary.mean.toFixed(1)} ${primary.units.toLowerCase()}, with most observations falling between ${primary.min.toFixed(1)} and ${primary.max.toFixed(1)} ${primary.units.toLowerCase()}.`,
  ].join(" ");

  const bullets: string[] = [
    `Most of the time, the ${primary.metricName.toLowerCase()} stays near ${primary.mean.toFixed(
      1,
    )} ${primary.units.toLowerCase()}.`,
    `The lowest values in this period reach about ${primary.min.toFixed(
      1,
    )} ${primary.units.toLowerCase()}, while the highest reach about ${primary.max.toFixed(
      1,
    )} ${primary.units.toLowerCase()}.`,
    `The overall pattern looks ${primary.trend === "stable" ? "fairly steady" : primary.trend}, rather than showing sudden, extreme changes.`,
    "Keep in mind that satellite measurements can miss local details (for example, small farms, cities, or hills) and may be affected by clouds or seasonal changes.",
  ];

  const spread = primary.max - primary.mean;
  const riskLevel: AiInsight["riskLevel"] =
    spread > primary.mean * 0.5 ? "medium" : "low";

  return {
    summary,
    bullets,
    riskLevel,
  };
}

