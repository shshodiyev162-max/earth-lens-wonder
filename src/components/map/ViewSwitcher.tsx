import { Link, useLocation } from "react-router-dom";
import { Columns2, LayoutGrid, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEWS = [
  { to: "/map", label: "Explore", icon: MapIcon },
  { to: "/split", label: "Compare", icon: Columns2 },
  { to: "/sync", label: "Side by side", icon: LayoutGrid },
];

/** Bottom ribbon that switches between the three map views (keeps the position). */
export default function ViewSwitcher({ className }: { className?: string }) {
  const location = useLocation();
  return (
    <nav aria-label="Map views" className={cn("pointer-events-auto inline-flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#0a1628]/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-2xl", className)}>
      {VIEWS.map((view) => {
        const active = location.pathname === view.to;
        const Icon = view.icon;
        return (
          <Link
            key={view.to}
            to={view.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition sm:px-4",
              active ? "bg-primary/15 text-primary" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
