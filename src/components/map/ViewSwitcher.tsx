import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
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
    <nav aria-label="Map views" className={cn("pointer-events-auto inline-flex items-center gap-0.5 rounded-2xl glass-strong p-1.5 shadow-2xl shadow-black/40", className)}>
      {VIEWS.map((view) => {
        const active = location.pathname === view.to;
        const Icon = view.icon;
        return (
          <Link
            key={view.to}
            to={view.to}
            aria-current={active ? "page" : undefined}
            aria-label={view.label}
            className={cn(
              "relative flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors sm:px-4",
              active ? "text-primary" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
            )}
          >
            {active && <motion.span layoutId="view-indicator" className="absolute inset-0 rounded-xl border border-primary/20 bg-primary/10" transition={{ type: "spring", duration: 0.45 }} />}
            <Icon className="relative h-4 w-4" aria-hidden="true" />
            <span className="relative hidden sm:inline">{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
