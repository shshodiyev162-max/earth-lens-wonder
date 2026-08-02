import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Globe, Map, Columns, GitCompare, BarChart3, Leaf, ArrowRight, Satellite, Eye } from "lucide-react";
import CinematicEarth from "@/components/CinematicEarth";

const features = [
  {
    icon: Map,
    title: "Planet Pulse Map",
    description: "Explore real-time satellite imagery with multiple environmental layers, regional focus, and historical comparison tools.",
    to: "/map",
    color: "text-primary",
  },
  {
    icon: Columns,
    title: "Split Comparison",
    description: "Compare two different map layers side by side with an interactive slider divider.",
    to: "/split",
    color: "text-earth-blue",
  },
  {
    icon: GitCompare,
    title: "Synced Dual View",
    description: "View the same location with different layers in synchronized maps that move together.",
    to: "/sync",
    color: "text-earth-green",
  },
  {
    icon: BarChart3,
    title: "Environmental Analysis",
    description: "Get detailed environmental analysis and statistics for any region or country with AI-powered insights.",
    to: "/analysis",
    color: "text-earth-orange",
  },
  {
    icon: Leaf,
    title: "Eco Missions",
    description: "Complete daily environmental missions and track your CO₂ impact on the planet.",
    to: "/missions",
    color: "text-earth-green",
  },
  {
    icon: Eye,
    title: "Eco Impact Tracker",
    description: "Log your sustainable actions and visualize your estimated environmental impact.",
    to: "/tracker",
    color: "text-glow-blue",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-hero">
        {/* Ambient glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-glow-blue/5 blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

        {/* Full-viewport WebGL composition; the planet extends beyond the hero edges. */}
        <motion.div
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto absolute inset-0 z-0"
        >
          <CinematicEarth />
        </motion.div>

        {/* Preserve contrast without hiding the illuminated globe. */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0.12), transparent 38%, hsl(var(--background) / 0.62)), radial-gradient(circle at 52% 42%, transparent 0%, hsl(var(--background) / 0.08) 42%, hsl(var(--background) / 0.58) 100%)",
          }}
        />

        <div className="pointer-events-none relative z-10 max-w-5xl mx-auto px-6 text-center pt-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8 text-sm text-muted-foreground">
              <Satellite className="w-4 h-4 text-primary" />
              Powered by NASA Earth Observation Data
            </div>

            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight mb-6">
              <span className="text-foreground">See Earth Like</span>
              <br />
              <span className="bg-gradient-to-r from-primary to-glow-blue bg-clip-text text-transparent">Never Before</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Explore real-time satellite imagery, analyze environmental data, and track your impact
              on the planet — all from one powerful platform.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/map"
                className="pointer-events-auto inline-flex items-center gap-2 px-8 py-4 rounded-xl font-display font-semibold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity glow-primary"
              >
                <Globe className="w-5 h-5" />
                Start Exploring
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/missions"
                className="pointer-events-auto inline-flex items-center gap-2 px-8 py-4 rounded-xl font-display font-semibold glass text-foreground hover:bg-card/80 transition-colors"
              >
                <Leaf className="w-5 h-5 text-earth-green" />
                Join Eco Missions
              </Link>
            </div>
          </motion.div>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-6 z-10 text-center text-xs tracking-wide text-muted-foreground/75">
          Move to tilt · Click to turn · Drag to explore
        </p>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              Everything You Need to Understand Earth
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From satellite imagery to environmental analytics, TerraView gives you the tools
              to explore, compare, and protect our planet.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Link
                  to={feature.to}
                  className="block p-6 rounded-2xl glass hover:bg-card/70 transition-all group h-full"
                >
                  <feature.icon className={`w-10 h-10 ${feature.color} mb-4`} />
                  <h3 className="font-display font-semibold text-lg text-foreground mb-2 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-12 rounded-3xl glass relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-primary/5" />
            <div className="relative z-10">
              <h2 className="text-3xl font-display font-bold text-foreground mb-4">
                Ready to See the World Differently?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                Join thousands of explorers using satellite data to understand and protect our planet.
              </p>
              <Link
                to="/map"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-display font-semibold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity glow-primary"
              >
                Launch Explorer
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-primary flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold text-sm text-foreground">TerraView</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Data provided by NASA GIBS · Built for Earth observation and environmental awareness
          </p>
        </div>
      </footer>
    </div>
  );
}
