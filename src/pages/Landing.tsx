import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarClock, Columns2, Database, Globe, LayoutGrid, Map as MapIcon, MousePointerClick, Satellite, ScanSearch } from "lucide-react";
import PlaceSearch from "@/components/search/PlaceSearch";
import ErrorBoundary from "@/components/ErrorBoundary";
import { BrandMark } from "@/components/Navbar";
import type { PlaceResult } from "@/lib/geo/geocode";

const CinematicEarth = lazy(() => import("@/components/CinematicEarth"));

const FEATURES = [
  {
    icon: MapIcon,
    title: "Explore live NASA layers",
    description: "Daily true-color imagery, vegetation, land heat, aerosols, rain, snow, oceans and night lights — any date back to 2000.",
    to: "/map",
    color: "text-primary",
  },
  {
    icon: Columns2,
    title: "Swipe to compare",
    description: "Put two layers or two dates on one map and drag the divider to see floods, fires, harvests or melting snow.",
    to: "/split",
    color: "text-sky-400",
  },
  {
    icon: LayoutGrid,
    title: "Side-by-side maps",
    description: "Two maps locked together — pan or zoom one and the other follows exactly.",
    to: "/sync",
    color: "text-emerald-400",
  },
  {
    icon: BarChart3,
    title: "Real area analysis",
    description: "Pick any place and get measured vegetation, heat, rainfall, soil moisture and dust trends with plain-language findings.",
    to: "/analysis",
    color: "text-amber-400",
  },
];

const STEPS = [
  { icon: ScanSearch, title: "Pick a place", text: "Search a city, region or country, click the map, or draw your own field or district." },
  { icon: Satellite, title: "We read NASA's pixels", text: "Every month of MODIS and MERRA-2 imagery is decoded inside your outline using NASA's own colormaps." },
  { icon: CalendarClock, title: "See what changed", text: "Trends, anomalies against the 2001–2020 normal and clear findings — download everything as CSV." },
];

const SOURCES = [
  { name: "NASA GIBS", detail: "MODIS & VIIRS imagery, vegetation, heat, aerosols, snow, oceans" },
  { name: "NASA POWER", detail: "Monthly temperature, rainfall, sunshine, soil moisture and 2001–2020 normals" },
  { name: "MERRA-2", detail: "NASA reanalysis of aerosols and dust" },
  { name: "OpenStreetMap", detail: "Place search and boundaries (Photon & Nominatim)" },
];

export default function Landing() {
  const navigate = useNavigate();
  const goToPlace = (place: PlaceResult) => navigate("/map", { state: { focusPlace: place } });

  return (
    <div className="min-h-screen">
      <section className="relative -mt-16 flex min-h-[100svh] items-center justify-center overflow-hidden gradient-hero pt-16">
        <div className="absolute left-1/2 top-1/4 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px] animate-pulse-glow" />

        <motion.div
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 z-0"
        >
          <ErrorBoundary fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_65%_85%,rgba(34,85,204,0.35),transparent_55%)]" />}>
            <Suspense fallback={null}>
              <CinematicEarth />
            </Suspense>
          </ErrorBoundary>
        </motion.div>

        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0.15), transparent 38%, hsl(var(--background) / 0.65)), radial-gradient(circle at 52% 42%, transparent 0%, hsl(var(--background) / 0.08) 42%, hsl(var(--background) / 0.6) 100%)",
          }}
        />

        <div className="pointer-events-none relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground glass">
              <Satellite className="h-4 w-4 text-primary" />
              Built on NASA Earth observation data
            </div>

            <h1 className="mb-6 font-display text-5xl font-bold tracking-tight md:text-7xl">
              <span className="text-foreground">See Earth Like</span>
              <br />
              <span className="bg-gradient-to-r from-primary to-glow-blue bg-clip-text text-transparent">Never Before</span>
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Search any place on the planet, watch it change in daily NASA satellite imagery, and get a measured report on its vegetation, heat, rainfall and air.
            </p>

            <div className="pointer-events-auto mx-auto mb-6 max-w-xl text-left">
              <PlaceSearch variant="hero" onSelect={goToPlace} placeholder="Search any place on Earth…" ariaLabel="Search any place on Earth" />
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/map"
                className="pointer-events-auto inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-display font-semibold text-primary-foreground transition-opacity gradient-primary glow-primary hover:opacity-90"
              >
                <Globe className="h-5 w-5" />
                Start exploring
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/analysis"
                className="pointer-events-auto inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-display font-semibold text-foreground transition-colors glass hover:bg-card/80"
              >
                <BarChart3 className="h-5 w-5 text-amber-400" />
                Analyze a place
              </Link>
            </div>
          </motion.div>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex items-center justify-center gap-1.5 text-xs tracking-wide text-muted-foreground/75">
          <MousePointerClick className="h-3.5 w-3.5" /> Drag to spin the globe · click to turn it
        </p>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-14 text-center">
            <h2 className="mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">Everything you need to understand a place</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">From a single field to a whole country — explore it, compare it over time, and measure it.</p>
          </motion.div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <Link to={feature.to} className="group block h-full rounded-2xl p-6 transition-all glass hover:-translate-y-0.5 hover:bg-card/70">
                  <feature.icon className={`mb-4 h-9 w-9 ${feature.color}`} />
                  <h3 className="mb-2 font-display text-lg font-semibold text-foreground transition-colors group-hover:text-primary">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-3xl p-8 glass">
            <h2 className="mb-6 font-display text-2xl font-bold text-foreground">How the analysis works</h2>
            <ol className="space-y-5">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {i + 1}. {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link to="/analysis" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
              Try it on your town <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="rounded-3xl p-8 glass">
            <h2 className="mb-6 flex items-center gap-2 font-display text-2xl font-bold text-foreground">
              <Database className="h-6 w-6 text-primary" /> Real data, cited
            </h2>
            <ul className="space-y-4">
              {SOURCES.map((source) => (
                <li key={source.name}>
                  <div className="font-semibold text-foreground">{source.name}</div>
                  <div className="text-sm text-muted-foreground">{source.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              No simulated numbers: when NASA hasn't published a month yet, or clouds hide an area, TerraVision says so instead of filling the gap.
            </p>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <BrandMark />
          <p className="text-center text-xs text-muted-foreground">
            Built by Bukhara Nova · Imagery: NASA EOSDIS GIBS · Climate: NASA POWER · Places: © OpenStreetMap contributors
          </p>
        </div>
      </footer>
    </div>
  );
}
