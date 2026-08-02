import { motion } from "framer-motion";
import { Leaf, Recycle, Footprints, Bike, ShoppingBag, Droplets, Check, Trophy, Flame } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";

interface Mission {
  id: string;
  title: string;
  description: string;
  co2Saved: number; // grams
  icon: typeof Leaf;
  completed: boolean;
}

const dailyMissions: Mission[] = [
  { id: "1", title: "Recycle 10 bottles", description: "Collect and recycle plastic or glass bottles", co2Saved: 2500, icon: Recycle, completed: false },
  { id: "2", title: "Walk to work/school", description: "Skip the car and walk today", co2Saved: 4100, icon: Footprints, completed: false },
  { id: "3", title: "Bike ride", description: "Use a bicycle instead of driving for one trip", co2Saved: 3200, icon: Bike, completed: false },
  { id: "4", title: "Use reusable bag", description: "Bring your own bag for shopping", co2Saved: 150, icon: ShoppingBag, completed: false },
  { id: "5", title: "Save water", description: "Take a 5-minute shower instead of a bath", co2Saved: 800, icon: Droplets, completed: false },
  { id: "6", title: "Plant something", description: "Plant a seed, flower, or tree", co2Saved: 500, icon: Leaf, completed: false },
];

export default function Missions() {
  const [missions, setMissions] = useState(dailyMissions);

  const toggleMission = async (id: string) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, completed: !m.completed } : m)),
    );

    // Best-effort persistence to the backend; if not configured, this is a no-op.
    try {
      if (import.meta.env.VITE_API_BASE_URL) {
        await apiFetch("/user/missions/toggle", {
          method: "POST",
          body: JSON.stringify({ missionId: id }),
        });
      }
    } catch (error) {
      console.error("Failed to persist mission progress:", error);
    }
  };

  const totalCO2 = missions.filter((m) => m.completed).reduce((sum, m) => sum + m.co2Saved, 0);
  const completedCount = missions.filter((m) => m.completed).length;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <Leaf className="w-8 h-8 text-earth-green" />
            <h1 className="text-3xl font-display font-bold text-foreground">Eco Missions</h1>
          </div>
          <p className="text-muted-foreground mb-8">Complete daily missions to help the environment and track your impact.</p>
        </motion.div>

        {/* Impact card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-2xl p-8 mb-10 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-earth-green/5" />
          <div className="relative z-10">
            <Trophy className="w-12 h-12 text-earth-yellow mx-auto mb-3" />
            <div className="text-4xl font-display font-bold text-foreground mb-1">
              {(totalCO2 / 1000).toFixed(1)} kg
            </div>
            <div className="text-muted-foreground text-sm">CO₂ prevented today</div>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Flame className="w-4 h-4 text-earth-orange" />
              <span className="text-sm text-foreground font-medium">{completedCount}/{missions.length} missions completed</span>
            </div>
            {/* Progress bar */}
            <div className="mt-4 w-full max-w-xs mx-auto h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full gradient-earth"
                animate={{ width: `${(completedCount / missions.length) * 100}%` }}
                transition={{ type: "spring" }}
              />
            </div>
          </div>
        </motion.div>

        {/* Missions list */}
        <div className="space-y-3">
          {missions.map((mission, i) => (
            <motion.button
              key={mission.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => toggleMission(mission.id)}
              className={`w-full flex items-center gap-4 p-5 rounded-2xl transition-all text-left ${
                mission.completed ? "glass border-earth-green/30" : "glass hover:bg-card/70"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                mission.completed ? "bg-earth-green/20" : "bg-secondary"
              }`}>
                {mission.completed ? (
                  <Check className="w-5 h-5 text-earth-green" />
                ) : (
                  <mission.icon className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-medium text-sm ${mission.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {mission.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{mission.description}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-display font-semibold text-earth-green">
                  -{(mission.co2Saved / 1000).toFixed(1)} kg
                </div>
                <div className="text-xs text-muted-foreground">CO₂</div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
