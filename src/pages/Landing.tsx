import { lazy, Suspense, type ComponentType } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Globe, Map, Columns, GitCompare, BarChart3, PenTool, Search, ArrowRight, Satellite, ScanSearch, CalendarClock, Database } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { openGlobalSearch } from "@/components/search/openSearch";

// The WebGL globe is the heaviest part of the app, so it loads after the page.
const CinematicEarth = lazy(() => import("@/components/CinematicEarth"));

interface Feature {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  to?: string;
  onClick?: () => void;
}

const features: Feature[] = [
  {
    icon: Map,
    title: "Explore NASA Layers",
    description: "Browse daily satellite imagery, vegetation, land heat, aerosols, rain, snow and night lights — for any date NASA has published, back to 2000.",
    to: "/map",
    color: "text-primary",
  },
  {
    icon: Columns,
    title: "Swipe Compare",
    description: "Compare two layers or two dates on one map with an interactive slider divider.",
    to: "/split",
    color: "text-earth-blue",
  },
  {
    icon: GitCompare,
    title: "Side-by-Side View",
    description: "View the same location with different layers in synchronized maps that move together.",
    to: "/sync",
    color: "text-earth-green",
  },
  {
    icon: BarChart3,
    title: "Area Analysis",
    description: "Pick any place and get measured vegetation, heat, rainfall, soil moisture and dust trends from NASA data, with plain-language findings.",
    to: "/analysis",
    color: "text-earth-orange",
  },
  {
    icon: PenTool,
    title: "Draw & Measure",
    description: "Outline a field, lake or district on the map, see its size, click to read real values, then send it to analysis.",
    to: "/map",
    color: "text-earth-green",
  },
  {
    icon: Search,
    title: "Global Search",
    description: "Find any city, region, country or coordinates from the search bar at the top — or press Ctrl K (⌘K on Mac).",
    onClick: openGlobalSearch,
    color: "text-glow-blue",
  },
];

const steps = [
  {
    icon: ScanSearch,
    title: "1. Pick a place",
    description: "Search a city, region or country, click the map, or draw your own field or district.",
  },
  {
    icon: Satellite,
    title: "2. Read NASA's pixels",
    description: "Monthly MODIS and MERRA-2 imagery is decoded inside your outline using NASA's own color scales.",
  },
  {
    icon: CalendarClock,
    title: "3. See what changed",
    description: "Trends, differences from the 2001–2020 normal and clear findings — download everything as CSV.",
  },
];

const sources = [
  { name: "NASA GIBS", detail: "MODIS & VIIRS imagery, vegetation, heat, aerosols, snow, oceans" },
  { name: "NASA POWER", detail: "Monthly temperature, rainfall, sunshine and soil moisture, with 2001–2020 normals" },
  { name: "MERRA-2", detail: "NASA reanalysis of aerosols and dust" },
  { name: "OpenStreetMap", detail: "Place search and boundaries" },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const body = (
    <>
      <feature.icon className={`w-10 h-10 ${feature.color} mb-4`} />
      <h3 className="font-display font-semibold text-lg text-foreground mb-2 group-hover:text-primary transition-colors">{feature.title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
    </>
  );
  const className = "block w-full text-left p-6 rounded-2xl glass hover:bg-card/70 transition-all group h-full";
  return feature.to ? (
    <Link to={feature.to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={feature.onClick} className={className}>
      {body}
    </button>
  );
}

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
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <CinematicEarth />
            </Suspense>
          </ErrorBoundary>
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
              Explore daily NASA satellite imagery, compare any two dates, and analyze any
              place on the planet — all from one powerful platform.
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
                to="/analysis"
                className="pointer-events-auto inline-flex items-center gap-2 px-8 py-4 rounded-xl font-display font-semibold glass text-foreground hover:bg-card/80 transition-colors"
              >
                <BarChart3 className="w-5 h-5 text-earth-orange" />
                Analyze a place
              </Link>
            </div>
          </motion.div>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-6 z-10 text-center text-xs tracking-wide text-muted-foreground/75">
          Drag to explore · Click to turn · Arrow keys to rotate
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
              From satellite imagery to environmental analytics, TerraVision gives you the tools
              to explore, compare, and understand our planet.
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
                <FeatureCard feature={feature} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
              How It Works — Real NASA Data
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Every number comes from published NASA datasets. When data is missing or clouds hide an area,
              TerraVision says so instead of filling the gap.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 mb-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl glass h-full"
              >
                <step.icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="font-display font-semibold text-lg text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-6 rounded-2xl glass"
          >
            <div className="flex items-center gap-2 mb-5">
              <Database className="w-5 h-5 text-primary" />
              <h3 className="font-display font-semibold text-lg text-foreground">Data sources</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {sources.map((source) => (
                <div key={source.name}>
                  <div className="font-display font-semibold text-sm text-foreground mb-1">{source.name}</div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{source.detail}</p>
                </div>
              ))}
            </div>
          </motion.div>
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
                Open the map, search for any place and see how it changes in NASA satellite data.
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
            <span className="font-display font-semibold text-sm text-foreground">TerraVision</span>
          </div>
          <p className="text-xs text-muted-foreground text-center md:text-right">
            Data provided by NASA GIBS &amp; NASA POWER · Places © OpenStreetMap contributors · Built for Earth observation and environmental awareness
          </p>
        </div>
      </footer>
    </div>
  );
}
