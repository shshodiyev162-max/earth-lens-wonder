import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { canDraw3d } from "@/lib/webgl";
import TrendChart from "@/components/landing/TrendChart";
import { areaText, DATA_MAPS, FINDINGS, meanBetween, pText, rangeText, shareText, signedNumber } from "@/components/landing/findings";
import { INDICATORS, INDICATOR_ORDER, MEASURE_GROUPS, numberInWords } from "@/lib/query/indicators";

// The WebGL planet is the heaviest part of the app, so it loads after the page.
const CinematicEarth = lazy(() => import("@/components/CinematicEarth"));

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** The main button: one solid, quiet shape on every screen. */
function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="pointer-events-auto group inline-flex min-h-12 items-center gap-2.5 rounded-full bg-white px-7 py-3 text-[15px] font-medium text-black transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

function QuietLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="pointer-events-auto inline-flex min-h-12 items-center px-1 py-3 text-[15px] text-white/85 underline decoration-white/35 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {children}
    </Link>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">{children}</p>;
}

interface ChapterProps {
  number: string;
  place: string;
  question: string;
  answer: string;
  /** The headline figure, with its unit. */
  figure: string;
  unit?: string;
  /** Significance and range. */
  evidence: string;
  children: ReactNode;
  chart: ReactNode;
  /** What was read, in small print. */
  source: string;
  link: string;
  legend?: { colour: string; text: string };
  reducedMotion: boolean;
}

function Chapter({ number, place, question, answer, figure, unit, evidence, children, chart, source, link, legend, reducedMotion }: ChapterProps) {
  return (
    <article data-stop className="relative flex min-h-[150svh] items-center landscape:px-6 landscape:md:px-12 portrait:items-end portrait:px-4 portrait:pb-[8svh]">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.35 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto w-full max-w-[1400px]"
      >
        <div className="max-w-[29rem] portrait:mx-auto portrait:max-w-xl portrait:rounded-2xl portrait:border portrait:border-white/10 portrait:bg-black/80 portrait:p-5 portrait:backdrop-blur-xl">
          <Eyebrow>
            {number} <span className="text-white/40">/</span> {place}
          </Eyebrow>
          <p className="mt-4 font-editorial text-[1.5rem] leading-tight text-white/75">{question}</p>
          <h2 className="mt-0.5 font-editorial text-[clamp(2.75rem,4.7vw,4.25rem)] leading-[1.02] tracking-[-0.01em] text-white">{answer}</h2>

          <div className="mt-5 border-t border-white/15 pt-4">
            <p className="font-mono text-[clamp(1.25rem,1.9vw,1.6rem)] font-medium tabular-nums tracking-tight text-white">
              {figure}
              {unit && <span className="ml-2 text-[0.62em] font-normal tracking-normal text-white/70">{unit}</span>}
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-white/70">{evidence}</p>
          </div>

          <div className="mt-4 text-white">{chart}</div>

          <p className="mt-4 text-[15px] leading-relaxed text-white/85">{children}</p>

          {legend && (
            <p className="mt-3 flex items-center gap-2.5 font-mono text-[11px] text-white/70">
              <span aria-hidden="true" className="h-[3px] w-10 shrink-0 rounded-full" style={{ background: `linear-gradient(to right, rgb(255 255 255 / 0.12), ${legend.colour})` }} />
              {legend.text}
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-white/60">{source}</p>
          <div className="-mb-2 mt-1">
            <QuietLink to={link}>Run this test yourself</QuietLink>
          </div>
        </div>
      </motion.div>
    </article>
  );
}

const STEPS = [
  {
    title: "One NASA map a month",
    text: "MODIS, MERRA-2 and AIRS monthly maps are read from NASA's map service, and each colour is turned back into a number using NASA's own colour scale.",
  },
  {
    title: "Seasons can't fake it",
    text: "Each pixel becomes one value a year, using the same months every year, so a warm summer is never compared with a cold winter.",
  },
  {
    title: "A real test, every pixel",
    text: "A Mann–Kendall test and Sen's slope, with its 95% range, run on every pixel and on the whole area. If it doesn't pass, the page says so.",
  },
];

/** "Twenty-nine", from the list itself, so the words can't fall out of date. */
const MEASURE_COUNT = numberInWords(INDICATOR_ORDER.length).replace(/^./, (first) => first.toUpperCase());

const TOOLS = [
  { to: "/trends", name: "Trends", text: "Choose a measure, a place and the years. Get the tested answer and the places that changed most." },
  { to: "/atlas", name: "Atlas", text: "Where six NASA records changed most across the world since 2003, already tested pixel by pixel. Pick a change to look closer." },
  { to: "/analysis", name: "Analysis", text: "A full measured report on any place, with a trend test for every measure, or then against now." },
  { to: "/map", name: "Explore", text: "Browse NASA's satellite layers on a map, for any date they have published, and read real values." },
  { to: "/split", name: "Compare", text: "Swipe between two dates on one map, or watch them side by side." },
];

const LIMITS = [
  { title: "Why it changed", text: "It measures change. It doesn't prove what caused it." },
  { title: "Everything", text: "Sea level, lake and river levels, river flow, burned area, NO₂, CO₂ and ground-level ozone aren't measured." },
  { title: "Finer than the colours", text: "Values come from the colour steps of NASA's maps, so they are only as precise as that scale." },
  { title: "Beyond doubt", text: "Testing many pixels at once throws up some false alarms, so a hotspot also needs a connected patch, a minimum change and a minimum area." },
];

const DATA_SOURCES = [
  { href: "https://www.earthdata.nasa.gov/gibs", name: "NASA GIBS" },
  { href: "https://power.larc.nasa.gov/", name: "NASA POWER" },
  { href: "https://www.openstreetmap.org/copyright", name: "OpenStreetMap" },
  { href: "https://www.naturalearthdata.com/", name: "Natural Earth" },
];

/** The planet as a picture, where the 3D one can't be drawn (an old device, or 3D switched off). */
function EarthStill() {
  return (
    <img
      src={`${import.meta.env.BASE_URL}textures/earth_still.jpg`}
      alt=""
      aria-hidden="true"
      data-testid="earth-still"
      className="absolute inset-0 h-full w-full object-cover object-[78%_50%] portrait:object-[62%_70%]"
    />
  );
}

function SectionHeading({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <header>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-4 max-w-3xl font-editorial text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1.06] tracking-[-0.01em] text-foreground">{children}</h2>
    </header>
  );
}

export default function Landing() {
  const [reducedMotion] = useState(prefersReducedMotion);
  const storyRef = useRef<HTMLDivElement>(null);
  const [threeD] = useState(canDraw3d);

  const med = FINDINGS.mediterranean;
  const uzb = FINDINGS.uzbekistan;
  const aral = FINDINGS.uzbekistan.hotspot;
  const ant = FINDINGS.antarctica;
  const aralBefore = meanBetween(aral.series, uzb.baseline[0], uzb.baseline[1]) as number;
  const aralAfter = meanBetween(aral.series, uzb.recent[0], uzb.recent[1]) as number;

  return (
    <div>
      {/* The planet stays pinned while the story scrolls over it. This part is always dark: it's space. */}
      <div ref={storyRef} id="planet-story" className="dark relative bg-space text-white">
        <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
          <ErrorBoundary fallback={<EarthStill />}>
            {threeD ? (
              <Suspense fallback={null}>
                <CinematicEarth reducedMotion={reducedMotion} story={storyRef} />
              </Suspense>
            ) : (
              <EarthStill />
            )}
          </ErrorBoundary>
        </div>

        <div className="pointer-events-none relative z-10 -mt-[100svh]">
          {/* Opening */}
          <section data-stop className="relative flex min-h-[100svh] flex-col landscape:justify-center portrait:pt-24">
            <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12">
              {/* A CSS fade, not a script one: it plays as soon as the page paints, while the globe is still loading. */}
              <div className="max-w-[35rem] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:fill-mode-both motion-safe:delay-150 motion-safe:duration-1000 portrait:mx-auto portrait:text-center">
                <Eyebrow>NASA satellite records, tested</Eyebrow>
                <h1 className="mt-6 font-editorial text-[clamp(3rem,5.7vw,5.4rem)] leading-[0.98] tracking-[-0.015em] text-white">
                  What is changing <br />
                  on Earth, <br />
                  <em className="text-white/80">and is it real?</em>
                </h1>
                <p className="mt-6 max-w-[27rem] text-[17px] leading-relaxed text-white/80 [text-wrap:balance] portrait:mx-auto [text-shadow:0_1px_12px_rgb(0_0_0/0.8)]">
                  TerraScope reads NASA's monthly maps, tests every pixel for a real trend, and says so plainly when there isn't one.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-2 portrait:justify-center">
                  <PrimaryLink to="/trends">Find changes</PrimaryLink>
                  <QuietLink to="/trends?demo=choose">Watch a demo</QuietLink>
                </div>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-7 mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 font-mono text-[11px] uppercase tracking-[0.18em] text-white/75 md:px-12 portrait:justify-center">
              <span className="portrait:rounded-sm portrait:bg-black/70 portrait:px-2.5 portrait:py-1.5 portrait:text-white">Scroll for three real findings</span>
              <span className="portrait:hidden">Drag to turn the planet</span>
            </div>
          </section>

          {/* The question */}
          <section data-stop className="flex min-h-[110svh] items-center landscape:px-6 landscape:md:px-12 portrait:items-end portrait:px-6 portrait:pb-[12svh]">
            <div className="mx-auto w-full max-w-[1400px]">
              <motion.div
                initial={reducedMotion ? false : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ amount: 0.5 }}
                transition={{ duration: 1 }}
                className="max-w-[34rem] portrait:mx-auto portrait:rounded-2xl portrait:bg-black/80 portrait:p-5 portrait:backdrop-blur-xl"
              >
                <h2 className="font-editorial text-[clamp(2.5rem,4.8vw,4.5rem)] leading-[1.04] tracking-[-0.01em] text-white">
                  We asked it three questions. It answered <em>yes</em>, <em>no</em> and <em>barely</em>.
                </h2>
                <p className="mt-6 text-[15px] leading-relaxed text-white/75">Every number below was measured by this app from NASA data. You can run each test again yourself.</p>
              </motion.div>
            </div>
          </section>

          <Chapter
            number="01"
            place={med.area}
            question="Is the Mediterranean warming?"
            answer="Yes."
            figure={`${signedNumber(med.verdict.slopePerDecade, 2)} °C`}
            unit="per decade"
            evidence={`${rangeText(med.verdict.lowerPerYear * 10, med.verdict.upperPerYear * 10, 2)} · ${pText(med.verdict.p)}`}
            chart={
              <TrendChart
                series={med.series}
                verdict={med.verdict}
                colour={DATA_MAPS.mediterranean.rise}
                format={(value) => `${value.toFixed(1)} °C`}
                label={`Yearly mean sea temperature in the Mediterranean, ${med.startYear} to ${med.endYear}, with a rising trend of ${med.verdict.slopePerDecade.toFixed(2)} degrees per decade.`}
              />
            }
            source={`${med.subject}, ${med.startYear} to ${med.endYear}. ${med.mapsRead} monthly NASA maps over ${areaText(med.scannedKm2)}, from ${med.yearsCount} of the ${med.verdict.years} years, evenly spread. NASA has no map for ${med.missingMonths} of the months.`}
            link={med.link}
            legend={{ colour: DATA_MAPS.mediterranean.rise, text: `Warming, up to +${med.overlay.scalePerDecade.toFixed(2)} °C per decade` }}
            reducedMotion={reducedMotion}
          >
            Of the {med.overlay.measuredPixels.toLocaleString("en-US")} pixels of sea tested, every one is warming, and {shareText(med.overlay.significantRising)} pass the test on their own.
            {med.verdict.carryOver !== null && (
              <>
                {" "}
                The sea's warmth carries over from one year to the next (carry-over {med.verdict.carryOver.toFixed(2)}), which can make a run of warm years look surer than it is, so the test allowed for it and asked for stronger evidence. The warming still passes.
              </>
            )}
          </Chapter>

          <Chapter
            number="02"
            place={uzb.area}
            question="Is Uzbekistan losing its vegetation?"
            answer="As a whole, no."
            figure="No clear trend"
            evidence={`${rangeText(uzb.verdict.lowerPerYear, uzb.verdict.upperPerYear, 4)} NDVI a year · ${pText(uzb.verdict.p)}`}
            chart={
              <TrendChart
                series={uzb.series}
                verdict={uzb.verdict}
                colour="#ffffff"
                format={(value) => `${value.toFixed(2)} NDVI`}
                label={`Yearly growing-season greenness in Uzbekistan, ${uzb.startYear} to ${uzb.endYear}, with no clear trend.`}
              />
            }
            source={`Plant greenness (NDVI) from ${uzb.product.split(",")[0]}, ${uzb.months}, ${uzb.startYear} to ${uzb.endYear}. ${uzb.mapsRead} monthly NASA maps over ${areaText(uzb.scannedKm2)}.`}
            link={uzb.link}
            legend={{ colour: DATA_MAPS.uzbekistan.fall, text: "Orange: less green. Green: more green. Faint: not significant." }}
            reducedMotion={reducedMotion}
          >
            About {shareText(uzb.overlay.significantRising)} of its land is getting significantly greener and {shareText(uzb.overlay.significantFalling)} significantly less green. Together, the range includes zero. So the honest answer is that there is no clear trend.
          </Chapter>

          <Chapter
            number="02"
            place={aral.name}
            question="But on the dried-up Aral Sea shore?"
            answer="There, yes."
            figure={signedNumber(aral.verdict.slopePerYear, 4)}
            unit="NDVI a year"
            evidence={`${rangeText(aral.verdict.lowerPerYear, aral.verdict.upperPerYear, 4)} · ${pText(aral.verdict.p)}`}
            chart={
              <TrendChart
                series={aral.series}
                verdict={aral.verdict}
                colour={DATA_MAPS.uzbekistan.fall}
                format={(value) => `${value.toFixed(2)} NDVI`}
                label={`Yearly growing-season greenness in Muynoq district, ${uzb.startYear} to ${uzb.endYear}, with a significant decline.`}
              />
            }
            source={`The top-ranked of ${uzb.hotspotCount} hotspots found in Uzbekistan, ${areaText(aral.areaKm2)}. Hotspots are picked because they changed, then shown with their own test.`}
            link={uzb.link}
            reducedMotion={reducedMotion}
          >
            A country-wide average hid it. Average greenness here fell from {aralBefore.toFixed(2)} in {uzb.baseline[0]}–{uzb.baseline[1]} to {aralAfter.toFixed(2)} in {uzb.recent[0]}–{uzb.recent[1]}.
          </Chapter>

          <Chapter
            number="03"
            place={ant.area}
            question="Is the ozone layer recovering over Antarctica?"
            answer="Barely. Maybe."
            figure={`${signedNumber(ant.verdict.slopePerYear, 3)} ppm`}
            unit="a year"
            evidence={`${rangeText(ant.verdict.lowerPerYear, ant.verdict.upperPerYear, 4)} · ${pText(ant.verdict.p)}`}
            chart={
              <TrendChart
                series={ant.series}
                verdict={ant.verdict}
                colour={DATA_MAPS.antarctica.rise}
                format={(value) => `${value.toFixed(2)} ppm`}
                label={`Yearly mean ozone about 20 kilometres above Antarctica, ${ant.startYear} to ${ant.endYear}, with a small rise that is only just significant.`}
              />
            }
            source={`${ant.subject}, from MERRA-2 (a NASA model constrained by observations), ${ant.startYear} to ${ant.endYear}. ${ant.mapsRead} monthly maps from ${ant.yearsCount} of the ${ant.verdict.years} years, evenly spread.`}
            link={ant.link}
            legend={{ colour: DATA_MAPS.antarctica.rise, text: `Rising, up to +${ant.overlay.scalePerDecade.toFixed(2)} ppm per decade` }}
            reducedMotion={reducedMotion}
          >
            That p-value sits only just under the usual 0.05 line, and the range almost touches zero. A small rise: worth watching, not worth a headline.
          </Chapter>

          {/* Your turn */}
          <section data-stop className="flex min-h-[120svh] items-center landscape:px-6 landscape:md:px-12 portrait:items-start portrait:px-6 portrait:pt-[16svh]">
            <div className="mx-auto w-full max-w-[1400px]">
              <motion.div
                initial={reducedMotion ? false : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ amount: 0.5 }}
                transition={{ duration: 1 }}
                className="max-w-[34rem] portrait:mx-auto portrait:text-center"
              >
                <h2 className="font-editorial text-[clamp(3rem,6vw,5.5rem)] leading-[1] tracking-[-0.015em] text-white">Now ask your own.</h2>
                <p className="mt-6 max-w-[28rem] text-[17px] leading-relaxed text-white/80 portrait:mx-auto">Any country, any sea, or a shape you draw yourself. {MEASURE_COUNT} measures. No account, no keys, no simulated numbers.</p>
                <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-2 portrait:justify-center">
                  <PrimaryLink to="/trends">Find changes</PrimaryLink>
                  <QuietLink to="/trends?demo=choose">Watch a demo</QuietLink>
                </div>
              </motion.div>
            </div>
          </section>
        </div>
      </div>

      {/* How it works */}
      <section id="method" className="border-t border-border bg-background px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading eyebrow="Method">How an answer is made.</SectionHeading>
          <ol className="mt-16 grid gap-10 border-t border-border pt-8 md:grid-cols-3 md:gap-12">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">0{index + 1}</span>
                <h3 className="mt-5 font-editorial text-[1.75rem] leading-tight text-foreground">{step.title}</h3>
                <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The measures */}
      <section id="measures" className="border-t border-border bg-background px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading eyebrow="Data">{MEASURE_COUNT} measures, from the soil to the ozone layer.</SectionHeading>
          <div className="mt-16 grid gap-12 md:grid-cols-2 md:gap-x-12 xl:grid-cols-3">
            {MEASURE_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 className="border-b border-border pb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{group.label}</h3>
                <ul>
                  {INDICATOR_ORDER.map((id) => INDICATORS[id])
                    .filter((indicator) => indicator.group === group.id)
                    .map((indicator) => (
                      <li key={indicator.id} className="border-b border-border">
                        <Link to={`/trends?ind=${indicator.id}`} className="group flex min-h-11 items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                          <span>
                            <span className="block text-[15px] text-foreground">
                              {indicator.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{indicator.product}</span>
                          </span>
                          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The tools */}
      <section id="tools" className="border-t border-border bg-background px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading eyebrow="Tools">Four ways in.</SectionHeading>
          <ul className="mt-16 border-t border-border">
            {TOOLS.map((tool) => (
              <li key={tool.to} className="border-b border-border">
                <Link to={tool.to} className="group grid items-baseline gap-2 py-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:gap-10">
                  <span className="font-editorial text-[clamp(2rem,3.4vw,3rem)] leading-none text-foreground">{tool.name}</span>
                  <span className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">{tool.text}</span>
                  <ArrowRight aria-hidden="true" className="hidden h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground motion-reduce:transition-none md:block" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Limits */}
      <section id="limits" className="border-t border-border bg-background px-6 py-24 md:px-12 md:py-36">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading eyebrow="Limits">What it won't tell you.</SectionHeading>
          <dl className="mt-16 grid gap-10 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
            {LIMITS.map((limit) => (
              <div key={limit.title}>
                <dt className="font-editorial text-[1.5rem] leading-tight text-foreground">{limit.title}</dt>
                <dd className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{limit.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-border bg-background px-6 py-14 md:px-12">
        <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <p className="font-editorial text-2xl text-foreground">TerraScope</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Built with public NASA data. TerraScope isn't affiliated with or endorsed by NASA. Places © OpenStreetMap contributors.</p>
          </div>
          <nav aria-label="Tools">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Tools</h2>
            <ul className="mt-4 space-y-1 text-sm">
              {TOOLS.map((tool) => (
                <li key={tool.to}>
                  <Link to={tool.to} className="inline-flex min-h-8 items-center text-foreground underline-offset-4 hover:underline">
                    {tool.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Data sources">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Data</h2>
            <ul className="mt-4 space-y-1 text-sm">
              {DATA_SOURCES.map((source) => (
                <li key={source.href}>
                  <a href={source.href} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-foreground underline-offset-4 hover:underline">
                    {source.name}
                    <ArrowUpRight aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="This project">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Project</h2>
            <ul className="mt-4 space-y-1 text-sm">
              <li>
                <a href="#method" className="inline-flex min-h-8 items-center text-foreground underline-offset-4 hover:underline">
                  Method
                </a>
              </li>
              <li>
                <a href="#limits" className="inline-flex min-h-8 items-center text-foreground underline-offset-4 hover:underline">
                  Limits
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
