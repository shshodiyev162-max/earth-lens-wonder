import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  const location = useLocation();
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 gradient-hero">
      <div className="max-w-md text-center">
        <Compass className="mx-auto mb-4 h-10 w-10 text-primary" />
        <h1 className="mb-2 text-4xl font-bold text-white">404</h1>
        <p className="mb-1 text-lg text-slate-300">This place isn't on our map.</p>
        <p className="mb-6 text-sm text-slate-500">
          <code className="text-slate-400">{location.pathname}</code> doesn't exist.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Home
          </Link>
          <Link to="/map" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5">
            Explore the map
          </Link>
        </div>
      </div>
    </div>
  );
}
