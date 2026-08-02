import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitCompare, Leaf, Car, Droplets, Zap, TreePine, Info, Trash2, Calendar, TrendingUp } from "lucide-react";
import { CARBON_FACTORS, type ActionCategory } from "@/lib/carbonFactors";

type TrackedAction = {
  id: number;
  category: ActionCategory;
  date: string;
  amount: number;
  co2Saved: number;
  confidence: "low" | "medium" | "high";
};

// Mock regional environmental data for comparison
const REGIONAL_DATA = [
  { id: "vegetation", name: "Vegetation Health", value: 0.65, trend: "+2.3%", trendDir: "up" as const },
  { id: "airQuality", name: "Air Quality Index", value: 72, trend: "-1.5%", trendDir: "down" as const },
  { id: "co2", name: "CO₂ Levels (ppm)", value: 418, trend: "+0.8%", trendDir: "up" as const },
];

// Generate consistency calendar data
function generateCalendarData(): { date: string; hasAction: boolean }[] {
  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().split("T")[0]!,
      hasAction: Math.random() > 0.6, // Mock: 40% of days have actions
    });
  }
  return days;
}

export default function Tracker() {
  const [actions, setActions] = useState<TrackedAction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | null>(null);
  const [amount, setAmount] = useState("");
  const [showInfo, setShowInfo] = useState<ActionCategory | null>(null);
  const [calendarData] = useState(generateCalendarData);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("eco-tracker-actions");
    if (saved) {
      try {
        setActions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved actions");
      }
    }
  }, []);

  // Save to localStorage when actions change
  useEffect(() => {
    localStorage.setItem("eco-tracker-actions", JSON.stringify(actions));
  }, [actions]);

  const totalCO2Saved = actions.reduce((sum, a) => sum + a.co2Saved, 0);

  // Group actions by week for chart
  const weeklyData = actions.reduce((acc, action) => {
    const week = new Date(action.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    acc[week] = (acc[week] || 0) + action.co2Saved;
    return acc;
  }, {} as Record<string, number>);

  const handleAddAction = () => {
    if (!selectedCategory || !amount) return;

    const factor = CARBON_FACTORS.find((f) => f.category === selectedCategory);
    if (!factor) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const co2Saved = numAmount * factor.factor;

    const newAction: TrackedAction = {
      id: Date.now(),
      category: selectedCategory,
      date: new Date().toISOString().split("T")[0]!,
      amount: numAmount,
      co2Saved,
      confidence: factor.confidence,
    };

    setActions([newAction, ...actions]);
    setAmount("");
    setSelectedCategory(null);
  };

  const handleDeleteAction = (id: number) => {
    setActions(actions.filter((a) => a.id !== id));
  };

  const getCategoryIcon = (category: ActionCategory) => {
    switch (category) {
      case "car":
        return Car;
      case "water":
        return Droplets;
      case "energy":
        return Zap;
      case "tree":
        return TreePine;
      case "waste":
        return Leaf;
      default:
        return Leaf;
    }
  };

  const getCategoryColor = (category: ActionCategory) => {
    switch (category) {
      case "car":
        return "text-blue-400 bg-blue-400/10";
      case "water":
        return "text-cyan-400 bg-cyan-400/10";
      case "energy":
        return "text-yellow-400 bg-yellow-400/10";
      case "tree":
        return "text-green-400 bg-green-400/10";
      case "waste":
        return "text-purple-400 bg-purple-400/10";
      default:
        return "text-primary bg-primary/10";
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
            <GitCompare className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground">
              Eco Impact Tracker
            </h1>
          </div>
          <p className="text-muted-foreground">
            Log your sustainable actions and see your estimated environmental impact.
            Compare your efforts with regional environmental indicators.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
          {/* Left Panel - Action Input */}
          <div className="space-y-6">
            {/* Quick Log Today */}
            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Leaf className="w-4 h-4" />
                Quick Log Today
              </h2>

              <div className="grid grid-cols-2 gap-2">
                {CARBON_FACTORS.map((factor) => {
                  const Icon = getCategoryIcon(factor.category);
                  const isSelected = selectedCategory === factor.category;
                  return (
                    <button
                      key={factor.category}
                      type="button"
                      onClick={() => setSelectedCategory(factor.category)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/50 hover:bg-card/60"
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs text-center text-foreground">{factor.label}</span>
                    </button>
                  );
                })}
              </div>

              {selectedCategory && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Amount ({CARBON_FACTORS.find((f) => f.category === selectedCategory)?.unit})
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInfo(showInfo === selectedCategory ? null : selectedCategory)}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      Info
                    </button>
                  </div>

                  {showInfo === selectedCategory && (
                    <div className="p-3 bg-card/50 rounded-lg space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {CARBON_FACTORS.find((f) => f.category === selectedCategory)?.description}
                      </p>
                      <p className="text-xs text-primary">
                        Source: {CARBON_FACTORS.find((f) => f.category === selectedCategory)?.source}
                      </p>
                    </div>
                  )}

                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Enter amount`}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />

                  <button
                    type="button"
                    onClick={handleAddAction}
                    disabled={!amount || parseFloat(amount) <= 0}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    <Leaf className="w-4 h-4" />
                    Log Action
                  </button>
                </div>
              )}
            </section>

            {/* Consistency Calendar */}
            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Consistency Calendar
              </h2>
              <p className="text-xs text-muted-foreground">Last 30 days</p>

              <div className="grid grid-cols-7 gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                  <div key={i} className="text-center text-xs text-muted-foreground">
                    {day}
                  </div>
                ))}
                {calendarData.map((day, i) => (
                  <div
                    key={i}
                    className={`aspect-square rounded-sm ${
                      day.hasAction ? "bg-primary" : "bg-card/30"
                    }`}
                    title={day.date}
                  />
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Goal: Consistency, not perfection
              </p>
            </section>

            {/* Regional Comparison Disclaimer */}
            <section className="glass rounded-2xl p-4">
              <p className="text-xs text-muted-foreground italic">
                <span className="font-medium">Important:</span> The charts below show your actions alongside regional environmental data for reference only. This demonstrates temporal alignment, not causation. Your sustainable actions contribute to global environmental improvement over time.
              </p>
            </section>
          </div>

          {/* Right Panel - Summary & History */}
          <div className="space-y-6">
            {/* Impact Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl p-6"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Leaf className="w-5 h-5 text-primary" />
                  <span className="text-sm text-muted-foreground">CO₂ Saved</span>
                </div>
                <p className="text-3xl font-display font-bold text-primary">
                  {totalCO2Saved.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">kg estimated</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass rounded-2xl p-6"
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-earth-green" />
                  <span className="text-sm text-muted-foreground">Actions</span>
                </div>
                <p className="text-3xl font-display font-bold text-foreground">
                  {actions.length}
                </p>
                <p className="text-xs text-muted-foreground">logged this month</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass rounded-2xl p-6"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-earth-blue" />
                  <span className="text-sm text-muted-foreground">Streak</span>
                </div>
                <p className="text-3xl font-display font-bold text-foreground">
                  {Math.max(...Object.values(weeklyData).map((_, i) => i + 1), 0)}
                </p>
                <p className="text-xs text-muted-foreground">consecutive weeks</p>
              </motion.div>
            </div>

            {/* Regional Environmental Indicators */}
            <section className="glass rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Regional Environmental Indicators (Reference)
              </h2>

              <div className="grid grid-cols-3 gap-4">
                {REGIONAL_DATA.map((data) => (
                  <div key={data.id} className="p-4 bg-card/50 rounded-xl">
                    <p className="text-xs text-muted-foreground mb-1">{data.name}</p>
                    <p className="text-xl font-display font-bold text-foreground">{data.value}</p>
                    <p className={`text-xs ${data.trendDir === "up" ? "text-earth-red" : "text-earth-green"}`}>
                      {data.trend} vs last month
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Action History */}
            <section className="glass rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-4">
                Action History
              </h2>

              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No actions logged yet. Start tracking your eco-friendly actions above!
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {actions.slice(0, 20).map((action) => {
                    const Icon = getCategoryIcon(action.category);
                    const factor = CARBON_FACTORS.find((f) => f.category === action.category);
                    return (
                      <motion.div
                        key={action.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-3 bg-card/50 rounded-lg group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getCategoryColor(action.category)}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {factor?.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {action.amount} {factor?.unit} · {action.date}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium text-primary">
                              -{action.co2Saved.toFixed(2)} kg
                            </p>
                            <p className={`text-xs ${action.confidence === "high" ? "text-earth-green" : action.confidence === "medium" ? "text-yellow-400" : "text-orange-400"}`}>
                              {action.confidence} confidence
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteAction(action.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Tips */}
            <section className="glass rounded-2xl p-6 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Eco Tips
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Leaf className="w-4 h-4 text-primary mt-0.5" />
                  <span>Walking or cycling for short trips can save up to 2.4kg of CO₂ per trip</span>
                </li>
                <li className="flex items-start gap-2">
                  <Leaf className="w-4 h-4 text-primary mt-0.5" />
                  <span>Reducing shower time by 2 minutes saves about 10 liters of water</span>
                </li>
                <li className="flex items-start gap-2">
                  <Leaf className="w-4 h-4 text-primary mt-0.5" />
                  <span>Turning off unused electronics can save 10-15% on your energy bill</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

