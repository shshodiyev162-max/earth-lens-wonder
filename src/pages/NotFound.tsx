import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import PlanetLimb from "@/components/common/PlanetLimb";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="dark relative flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden px-6 md:px-12">
      <PlanetLimb />
      <div className="relative mx-auto w-full max-w-[1400px] pb-[18vh]">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">404</p>
        <h1 className="mt-5 font-editorial text-[clamp(3.25rem,8vw,6.5rem)] leading-[1] tracking-[-0.015em] text-white">
          Nothing was
          <br />
          <em className="text-white/80">measured here.</em>
        </h1>
        <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/80">
          There's no page at{" "}
          <code translate="no" className="font-mono text-[15px] text-white">
            {location.pathname}
          </code>
          . The planet is still where you left it.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-2">
          <Link to="/" className="group inline-flex min-h-12 items-center gap-2.5 rounded-full bg-white px-7 py-3 text-[15px] font-medium text-black transition-colors hover:bg-white/85">
            Back to the planet
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </Link>
          <Link to="/trends" className="inline-flex min-h-12 items-center px-1 py-3 text-[15px] text-white/85 underline decoration-white/35 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white">
            Find changes
          </Link>
        </div>
      </div>
    </div>
  );
}
