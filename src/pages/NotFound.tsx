import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Compass, Globe } from "lucide-react";

export default function NotFound() {
  const location = useLocation();
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-12 gradient-hero sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px] animate-pulse-glow" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md rounded-3xl p-8 text-center glass sm:p-10">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 animate-float">
          <Compass className="h-7 w-7 text-primary" aria-hidden="true" />
        </span>
        <p className="eyebrow mb-2">Error 404</p>
        <h1 className="mb-3 font-display text-3xl font-bold text-foreground">
          This place isn't <span className="text-gradient">on our map</span>
        </h1>
        <p className="mb-7 break-words text-sm leading-relaxed text-muted-foreground">
          There's no page at <code translate="no" className="rounded bg-secondary/70 px-1.5 py-0.5 text-foreground/90">{location.pathname}</code>. Head back home or open the map and search for a place instead.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/map" className="btn-primary">
            <Globe className="h-4 w-4" aria-hidden="true" />
            Open the map
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to="/" className="btn-glass">
            Back to home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
