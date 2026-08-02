import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart3, Calendar, Globe, Leaf, Thermometer, Wind, Square, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { MAP_LAYERS } from "@/lib/map-layers";
import { runMapAnalysis, type SummaryStats, type AiInsight } from "@/lib/analysisClient";
import { apiFetch } from "@/lib/apiClient";
import { useRegion, type SelectedArea } from "@/context/RegionContext";

const regions = [
  "Global",
  "North America",
  "South America",
  "Europe",
  "Africa",
  "Asia",
  "Oceania",
  "Antarctica",
  "United States",
  "Brazil",
  "India",
  "China",
  "Russia",
  "Australia",
  "Canada",
  "Germany",
];

type MetricId = "vegetation" | "temperature" | "airQuality" | "greenery";

type AnalysisPreset = {
  id: MetricId;
  label: string;
  description: string;
  icon: typeof Leaf;
  layerIds: string[];
  units: string;
  color: string;
};

const ANALYSIS_PRESETS: AnalysisPreset[] = [
  {
    id: "vegetation",
    label: "Vegetation health",
    description: "How green and healthy plants appear from space.",
    icon: Leaf,
    layerIds: ["ndvi"],
    units: "index",
    color: "#22c55e",
  },
  {
    id: "greenery",
    label: "Greenery Index",
    description: "Calculated greenery index from selected areas on the map.",
    icon: TrendingUp,
    layerIds: ["ndvi"],
    units: "%",
    color: "#10b981",
  },
  {
    id: "temperature",
    label: "Surface temperature",
    description: "How warm the surface of land or ocean is.",
    icon: Thermometer,
    layerIds: ["sea-surface-temp"],
    units: "°C",
    color: "#ef4444",
  },
  {
    id: "airQuality",
    label: "Aerosols & dust",
    description: "Particles like dust and smoke in the air.",
    icon: Wind,
    layerIds: ["aerosol"],
    units: "index",
    color: "#f59e0b",
  },
];

type TimePoint = {
  label: string;
  value: number;
};

// Generate vegetation/greenery time series based on area
function generateAreaTimeSeries(area: SelectedArea, startDate: string, endDate: string): TimePoint[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: TimePoint[] = [];
  
  const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  const totalPoints = Math.max(4, Math.min(monthDiff, 24));
  
  // Use area's greenery index as base, with some variation
  const baseGreenery = area.greeneryIndex || 0.5;
  
  for (let i = 0; i < totalPoints; i++) {
    const date = new Date(start);
    date.setMonth(start.getMonth() + i);
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    
    // Add seasonal variation
    const seasonal = Math.sin((i / totalPoints) * Math.PI * 2) * 0.15;
    // Add random noise based on area characteristics
    const noise = ((area.areaKm2 % 17) / 100) - 0.05;
    // Add trend based on area size (smaller areas tend to fluctuate more)
    const trend = (i / totalPoints) * ((area.areaKm2 % 10) / 100);
    
    const value = Math.max(0, Math.min(1, baseGreenery + seasonal + noise + trend));
    months.push({ label, value: Number((value * 100).toFixed(1)) });
  }
  
  return months;
}

function generateMockSeries(preset: AnalysisPreset, region: string, start: string, end: string): TimePoint[] {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const months: TimePoint[] = [];
  const monthDiff =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth()) +
    1;
  const totalPoints = Math.max(4, Math.min(monthDiff, 18));

  const base =
    preset.id === "vegetation" ? 0.5 :
    preset.id === "temperature" ? 18 :
    preset.id === "greenery" ? 50 : 40;

  for (let i = 0; i < totalPoints; i++) {
    const date = new Date(startDate);
    date.setMonth(startDate.getMonth() + i);
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const seasonal =
      preset.id === "vegetation" || preset.id === "greenery"
        ? Math.sin((i / totalPoints) * Math.PI * 2) * 0.2
        : preset.id === "temperature"
        ? Math.sin((i / totalPoints) * Math.PI * 2) * 4
        : Math.sin((i / totalPoints) * Math.PI * 2) * 5;

    const regionFactor = (region.length % 7) / 20;
    const noise = ((region.charCodeAt(0) + i * 13) % 10) / 100;

    const value =
      preset.id === "vegetation"
        ? Math.max(0, Math.min(1, base + seasonal + regionFactor + noise - 0.2))
        : preset.id === "greenery"
        ? Math.max(0, Math.min(100, base + seasonal * 50 + regionFactor * 50 + noise * 50))
        : preset.id === "temperature"
        ? base + seasonal + regionFactor * 5 + noise * 3
        : base + seasonal + regionFactor * 10 + noise * 3;

    months.push({ label, value: Number(value.toFixed(2)) });
  }

  return months;
}

function computeSummaryStats(preset: AnalysisPreset, series: TimePoint[]): SummaryStats {
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const first = values[0];
  const last = values[values.length - 1];

  const diff = last - first;
  const threshold = Math.abs(mean) * 0.05;
  const trend: SummaryStats["trend"] =
    Math.abs(diff) < threshold ? "stable" : diff > 0 ? "increasing" : "decreasing";

  return {
    metricName: preset.label,
    units: preset.units,
    min,
    max,
    mean,
    trend,
  };
}

export default function Analysis() {
  const { selectedAreas, activeAreaId, setActiveAreaId } = useRegion();
  const [searchParams] = useSearchParams();
  
  const [selectedRegion, setSelectedRegion] = useState("Global");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [preset, setPreset] = useState<MetricId>("greenery");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    return d.toISOString().split("T")[0]!;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0]!;
  });
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Check for area passed from URL
  useEffect(() => {
    const areaId = searchParams.get("areaId");
    const areaName = searchParams.get("areaName");
    if (areaId && selectedAreas.length > 0) {
      setSelectedAreaId(areaId);
      setPreset("greenery");
    }
  }, [searchParams, selectedAreas]);

  const activePreset = useMemo(
    () => ANALYSIS_PRESETS.find((p) => p.id === preset) ?? ANALYSIS_PRESETS[0],
    [preset],
  );

  // Get the currently selected area
  const currentArea = useMemo(() => {
    if (selectedAreaId) {
      return selectedAreas.find(a => a.id === selectedAreaId);
    }
    return null;
  }, [selectedAreaId, selectedAreas]);

  // Generate series based on whether we have a selected area
  const series = useMemo(() => {
    if (currentArea && preset === "greenery") {
      return generateAreaTimeSeries(currentArea, startDate, endDate);
    }
    return generateMockSeries(activePreset, selectedRegion, startDate, endDate);
  }, [activePreset, selectedRegion, startDate, endDate, currentArea, preset]);

  const summary = useMemo(
    () => computeSummaryStats(activePreset, series),
    [activePreset, series],
  );

  const chartConfig = {
    value: {
      label: activePreset.label,
      color: activePreset.color,
    },
  } as const;

  const handleRunAnalysis = async () => {
    setIsRunning(true);
    try {
      const inputs = {
        region: currentArea?.name || selectedRegion,
        startDate,
        endDate,
        layerIds: activePreset.layerIds,
      };
      const insight = await runMapAnalysis(inputs, [summary]);
      setAiInsight(insight);

      try {
        if (import.meta.env.VITE_API_BASE_URL) {
          await apiFetch("/analyses", {
            method: "POST",
            body: JSON.stringify({
              ...inputs,
              metricName: activePreset.label,
              stats: summary,
              aiSummary: insight.summary,
              aiRiskLevel: insight.riskLevel,
            }),
          });
        }
      } catch (error) {
        console.error("Failed to persist analysis record:", error);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const availableLayers = MAP_LAYERS.filter((layer) =>
    activePreset.layerIds.includes(layer.id),
  );

  // Get trend icon
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case "decreasing":
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground">
              Area Analysis
            </h1>
          </div>
          <p className="text-muted-foreground">
            {selectedAreas.length > 0 
              ? "Analyze vegetation trends for areas you've selected on the map. Select an area below or choose a predefined region."
              : "Choose a region, time range, and focus metric. Draw areas on the map to analyze vegetation trends."
            }
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1fr,2fr] items-start">
          {/* Left Sidebar */}
          <div className="space-y-6">
            {/* Selected Areas Section */}
            {selectedAreas.length > 0 && (
              <section className="glass rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Square className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    Selected Areas from Map
                  </h2>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedAreas.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => {
                        setSelectedAreaId(area.id);
                        setPreset("greenery");
                      }}
                      className={`w-full text-left rounded-xl px-3 py-2 border transition-colors ${
                        selectedAreaId === area.id
                          ? "border-cyan-500 bg-cyan-500/10"
                          : "border-border/50 hover:bg-card/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{area.name}</span>
                        {area.greeneryIndex !== undefined && (
                          <span className="text-xs text-green-400">
                            {(area.greeneryIndex * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ~{area.areaKm2.toLocaleString()} km²
                      </div>
                    </button>
                  ))}
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAreaId(null);
                    setPreset("vegetation");
                  }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              </section>
            )}

            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">
                1. Choose an area and focus
              </h2>

              {!selectedAreaId && (
                <div className="space-y-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Region
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {regions.map((region) => (
                      <button
                        key={region}
                        type="button"
                        onClick={() => setSelectedRegion(region)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          selectedRegion === region
                            ? "bg-primary text-primary-foreground"
                            : "glass text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground">
                  Focus metric
                </label>
                <div className="grid gap-2">
                  {ANALYSIS_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPreset(p.id)}
                      className={`flex items-start gap-3 rounded-xl px-3 py-2 text-left border transition-colors ${
                        preset === p.id
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:bg-card/60"
                      }`}
                    >
                      <p.icon className="w-4 h-4 mt-0.5" style={{ color: p.color }} />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">
                          {p.label}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-primary" />
                  Time range
                </label>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">From</span>
                    <input
                      type="date"
                      value={startDate}
                      max={endDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">To</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              </div>

              {preset !== "greenery" && (
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    This demo uses a lightweight, pre‑processed time‑series that
                    mimics what we might get from NASA map layers such as:
                  </p>
                  <ul className="list-disc list-inside">
                    {availableLayers.map((layer) => (
                      <li key={layer.id}>{layer.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">
                2. Run AI explanation
              </h2>
              <p className="text-xs text-muted-foreground">
                {currentArea 
                  ? `Generate AI insights for ${currentArea.name} based on the greenery index trend.`
                  : "We send a compact summary (not raw images) of the trends to an AI endpoint, which explains the pattern in simple language."
                }
              </p>
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={isRunning}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {isRunning ? "Running analysis…" : "Run AI analysis"}
              </button>
            </section>
          </div>

          {/* Right Chart Section */}
          <section className="space-y-6">
            {/* Main Chart */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {currentArea ? (
                    <>
                      <Square className="w-5 h-5 text-cyan-400" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {activePreset.label} - {currentArea.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Area: ~{currentArea.areaKm2.toLocaleString()} km²
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Globe className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {activePreset.label} in {selectedRegion}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Synthetic time‑series based on satellite‑style data
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Mean:</span>
                    <span className="font-mono text-foreground">
                      {summary.mean.toFixed(1)} {activePreset.units}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Range:</span>
                    <span className="font-mono text-foreground">
                      {summary.min.toFixed(1)}–{summary.max.toFixed(1)} {activePreset.units}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trend indicator */}
              <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-slate-800/50">
                <span className="text-xs text-muted-foreground">Trend:</span>
                {getTrendIcon(summary.trend)}
                <span className={`text-xs font-medium ${
                  summary.trend === "increasing" ? "text-green-500" :
                  summary.trend === "decreasing" ? "text-red-500" :
                  "text-yellow-500"
                }`}>
                  {summary.trend === "increasing" ? "Increasing" :
                   summary.trend === "decreasing" ? "Decreasing" : "Stable"}
                </span>
              </div>

              <ChartContainer config={chartConfig}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={50}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    domain={preset === "greenery" ? [0, 100] : 'auto'}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="bg-background/95 backdrop-blur"
                        formatter={(value: number) => (
                          <span className="font-mono" style={{ color: activePreset.color }}>
                            {value.toFixed(1)} {activePreset.units}
                          </span>
                        )}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={activePreset.color}
                    strokeWidth={2}
                    dot={{ fill: activePreset.color, strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, fill: activePreset.color }}
                  />
                </LineChart>
              </ChartContainer>
            </div>

            {/* Greenery Index Details for Selected Area */}
            {currentArea && (
              <div className="glass rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">
                  Greenery Index Analysis - {currentArea.name}
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Current Index</div>
                    <div className="text-2xl font-bold text-green-400">
                      {((currentArea.greeneryIndex || 0.5) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Area Size</div>
                    <div className="text-2xl font-bold text-cyan-400">
                      {currentArea.areaKm2.toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1">km²</span>
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">12-Month Trend</div>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(summary.trend)}
                      <span className={`text-lg font-bold ${
                        summary.trend === "increasing" ? "text-green-400" :
                        summary.trend === "decreasing" ? "text-red-400" :
                        "text-yellow-400"
                      }`}>
                        {summary.trend === "increasing" ? "+" : ""}
                        {((series[series.length - 1]?.value || 0) - (series[0]?.value || 0)).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Health Status</div>
                    <div className={`text-lg font-bold ${
                      (currentArea.greeneryIndex || 0.5) > 0.6 ? "text-green-400" :
                      (currentArea.greeneryIndex || 0.5) > 0.3 ? "text-yellow-400" :
                      "text-red-400"
                    }`}>
                      {(currentArea.greeneryIndex || 0.5) > 0.6 ? "Healthy" :
                       (currentArea.greeneryIndex || 0.5) > 0.3 ? "Moderate" :
                       "Low"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Summary */}
            <div className="glass rounded-2xl p-6 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                AI summary
              </h2>
              {aiInsight ? (
                <>
                  <p className="text-sm text-foreground leading-relaxed">
                    {aiInsight.summary}
                  </p>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {aiInsight.bullets.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Overall concern level:{" "}
                    <span className="font-medium text-foreground">
                      {aiInsight.riskLevel === "unknown"
                        ? "not rated"
                        : aiInsight.riskLevel}
                    </span>
                    . This explanation is AI‑generated and should be treated as
                    educational, not as a safety‑critical decision tool.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {currentArea
                    ? `Click "Run AI analysis" to see insights for ${currentArea.name} based on the greenery trend.`
                    : "Choose a region and time range, then run the AI analysis to see a plain‑language explanation of the chart above."
                  }
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

