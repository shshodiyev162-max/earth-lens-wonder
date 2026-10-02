import { lazy, Suspense, type ComponentType } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Columns2,
  Database,
  Globe,
  LayoutGrid,
  Map as MapIcon,
  PenTool,
  Satellite,
  ScanSearch,
  Search,
} from "lucide-react";
import PlaceSearch from "@/components/search/PlaceSearch";
import { openGlobalSearch } from "@/components/search/openSearch";
import ErrorBoundary from "@/components/ErrorBoundary";
import { BrandMark } from "@/components/Navbar";
import type { PlaceResult } from "@/lib/geo/geocode";

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

const FEATURES: Feature[] = [
  {
    icon: MapIcon,
    title: "Explore NASA layers",
    description: "Daily true-color imagery, vegetation, land heat, aerosols, rain, snow, oceans and night lights — pick any date NASA has published, back to 2000.",
    to: "/map",
    color: "text-primary",
  },
  {
    icon: Columns2,
    title: "Swipe to compare",
    description: "Put two layers or two dates on one map and drag the divider to see floods, fires, harvests or melting snow.",
    to: "/split",
    color: "text-earth-blue",
  },
  {
    icon: LayoutGrid,
    title: "Side-by-side maps",
    description: "Two maps locked together — pan or zoom one and the other follows exactly.",
    to: "/sync",
    color: "text-earth-green",
  },
  {
    icon: BarChart3,
    title: "Area analysis",
    description: "Pick any place and get measured vegetation, heat, rainfall, soil moisture and dust trends, with plain-language findings and a CSV download.",
    to: "/analysis",
    color: "text-earth-orange",
  },
  {
    icon: Search,
    title: "Search anywhere",
    description: "Find a city, region, country or coordinates from any page — press Ctrl K (⌘K on Mac) and jump straight there.",
    onClick: openGlobalSearch,
    color: "text-glow-blue",
  },
  {
    icon: PenTool,
    title: "Draw & measure",
    description: "Outline a field, lake or district on the map, see its size, click to read real values, then send it to analysis.",
    to: "/map",
    color: "text-earth-yellow",
  },
];

const STEPS = [
  { icon: ScanSearch, title: "Pick a place", text: "Search a city, region or country, click the map, or draw your own field or district." },
  { icon: Satellite, title: "We read NASA's pixels", text: "Monthly MODIS and MERRA-2 imagery is decoded inside your outline using NASA's own color scales." },
  { icon: CalendarClock, title: "See what changed", text: "Trends, differences from the 2001–2020 normal and clear findings — download everything as CSV." },
];

const SOURCES = [
  { name: "NASA GIBS", detail: "MODIS & VIIRS imagery, vegetation, heat, aerosols, snow, oceans" },
  { name: "NASA POWER", detail: "Monthly temperature, rainfall, sunshine, soil moisture and 2001–2020 normals" },
  { name: "MERRA-2", detail: "NASA reanalysis of aerosols and dust" },
  { name: "OpenStreetMap", detail: "Place search and boundaries (Photon & Nominatim)" },
];

const reveal = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" } };

function FeatureCard({ feature }: { feature: Feature }) {
  const body = (
    <>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/60 transition-transform group-hover:scale-105">
        <feature.icon className={`h-6 w-6 ${feature.color}`} />
      </span>
      <h3 className="mb-2 font-display text-lg font-semibold text-foreground transition-colors group-hover:text-primary">{feature.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
      <span aria-hidden="true" className="mt-4 hidden items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 md:inline-flex">
        {feature.onClick ? "Open search" : "Open"} <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </>
  );
  const className = "group block h-full w-full rounded-2xl p-6 text-left transition-all glass hover:-translate-y-0.5 hover:bg-card/70 hover:border-primary/30";
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
  const navigate = useNavigate();
  const goToPlace = (place: PlaceResult) => navigate("/map", { state: { focusPlace: place } });

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Hero */}
      <section className="relative -mt-16 flex min-h-[100svh] items-center justify-center overflow-hidden gradient-hero pt-16">
        {/* Ambient glow */}
        <div aria-hidden="true" className="absolute left-1/2 top-1/4 h-[600px] w-[600px] max-w-[150vw] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px] animate-pulse-glow" />
        <div
          aria-hidden="true"
          className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] max-w-[100vw] rounded-full bg-glow-blue/5 blur-[100px] animate-pulse-glow"
          style={{ animationDelay: "1.5s" }}
        />

        {/* Full-viewport WebGL composition; the planet extends beyond the hero edges. */}
        <motion.div
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto absolute inset-0 z-0"
        >
          <ErrorBoundary fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_65%_85%,hsl(var(--glow-blue)/0.3),transparent_55%)]" />}>
            <Suspense fallback={<div className="h-full w-full bg-[radial-gradient(circle_at_52%_55%,hsl(var(--glow-blue)/0.12),transparent_45%)]" />}>
              <CinematicEarth />
            </Suspense>
          </ErrorBoundary>
        </motion.div>

        {/* Preserve contrast without hiding the illuminated globe. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0.12), transparent 38%, hsl(var(--background) / 0.62)), radial-gradient(circle at 52% 42%, transparent 0%, hsl(var(--background) / 0.08) 42%, hsl(var(--background) / 0.58) 100%)",
          }}
        />

        <div className="pointer-events-none relative z-20 mx-auto w-full max-w-5xl px-4 pb-28 pt-12 text-center sm:px-6 sm:pt-16">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="mb-8 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs text-muted-foreground glass sm:px-4 sm:text-sm">
              <Satellite className="h-4 w-4 text-primary" aria-hidden="true" />
              Powered by NASA Earth Observation Data
            </div>

            <h1 className="mb-6 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
              <span className="text-foreground">See Earth Like</span>
              <br />
              <span className="text-gradient">Never Before</span>
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
              Search any place on the planet, watch it change in daily NASA satellite imagery, and get a measured report on its vegetation, heat, rainfall and air.
            </p>

            <div className="pointer-events-auto mx-auto mb-8 max-w-xl text-left">
              <PlaceSearch variant="hero" onSelect={goToPlace} placeholder="Search any place on Earth…" ariaLabel="Search any place on Earth" />
            </div>

            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Link to="/map" className="btn-primary pointer-events-auto px-8 py-4">
                <Globe className="h-5 w-5" aria-hidden="true" />
                Start Exploring
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/analysis" className="btn-glass pointer-events-auto px-8 py-4">
                <BarChart3 className="h-5 w-5 text-earth-orange" aria-hidden="true" />
                Analyze a place
              </Link>
            </div>
          </motion.div>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-6 z-10 px-4 text-center text-xs tracking-wide text-muted-foreground">
          Drag to explore · Click to turn · Arrow keys to rotate
        </p>
      </section>

      {/* Features */}
      <section className="px-4 py-24 sm:px-6" aria-labelledby="features-title">
        <div className="mx-auto max-w-6xl">
          <motion.div {...reveal} className="mb-16 text-center">
            <h2 id="features-title" className="mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">
              Everything You Need to Understand Earth
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              From a single field to a whole country — explore it, compare it over time, and measure it with NASA data.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <motion.div key={feature.title} {...reveal} transition={{ delay: i * 0.08 }}>
                <FeatureCard feature={feature} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 pb-24 sm:px-6" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl">
          <motion.div {...reveal} className="mb-12 text-center">
            <p className="eyebrow mb-3">How it works</p>
            <h2 id="how-title" className="mb-4 font-display text-3xl font-bold text-foreground md:text-4xl">
              Real NASA Data, <span className="text-gradient">Measured</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">Every number comes from published NASA datasets — nothing is simulated or made up.</p>
          </motion.div>

          <ol className="mb-6 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.li key={step.title} {...reveal} transition={{ delay: i * 0.1 }} className="relative rounded-2xl p-6 glass">
                <span aria-hidden="true" className="absolute right-5 top-4 font-display text-5xl font-bold text-foreground/[0.06]">
                  {i + 1}
                </span>
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mb-2 font-display text-lg font-semibold text-foreground">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </motion.li>
            ))}
          </ol>

          <motion.div {...reveal} className="rounded-2xl p-6 glass sm:p-8">
            <h3 className="mb-6 flex items-center gap-2 font-display text-lg font-semibold text-foreground">
              <Database className="h-5 w-5 text-primary" aria-hidden="true" /> Where the data comes from
            </h3>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SOURCES.map((source) => (
                <li key={source.name} className="border-l-2 border-primary/40 pl-4">
                  <div className="font-display font-semibold text-foreground">{source.name}</div>
                  <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{source.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-border/60 pt-5 text-xs leading-relaxed text-muted-foreground">
              When NASA hasn't published a month yet, or clouds hide an area, TerraVision says so instead of filling the gap. Imagery usually appears a few hours to a few days after it is captured.
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div {...reveal} className="relative overflow-hidden rounded-3xl p-8 glass sm:p-12">
            <div aria-hidden="true" className="absolute inset-0 bg-primary/5" />
            <div aria-hidden="true" className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative z-10">
              <h2 className="mb-4 font-display text-3xl font-bold text-foreground">Ready to See the World Differently?</h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Open the map, search for your town and see how it looked yesterday — or twenty years ago. Built on open NASA data, no keys needed.
              </p>
              <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link to="/map" className="btn-primary px-8 py-4">
                  Launch Explorer
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to="/analysis" className="btn-glass px-8 py-4">
                  Analyze a place
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-10 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.4fr,1fr,1.4fr]">
          <div>
            <BrandMark />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">Explore, compare and measure any place on Earth with NASA satellite data.</p>
          </div>
          <nav aria-label="Footer">
            <h2 className="section-label mb-3">Explore</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                { to: "/map", label: "Map" },
                { to: "/split", label: "Compare" },
                { to: "/sync", label: "Side by side" },
                { to: "/analysis", label: "Analysis" },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-muted-foreground transition-colors hover:text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="section-label mb-3">Data</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Imagery: NASA EOSDIS GIBS · Climate: NASA POWER · Aerosols: NASA MERRA-2 · Places: © OpenStreetMap contributors
            </p>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl border-t border-border/60 pt-6 text-center text-xs text-muted-foreground md:text-left">
          TerraVision · Built by Bukhara Nova for the NASA Space Apps Challenge
        </p>
      </footer>
    </div>
  );
}
