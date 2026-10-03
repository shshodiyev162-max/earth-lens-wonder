import { Link, useLocation } from "react-router-dom";
import { Columns2, LayoutGrid, Map as MapIcon } from "lucide-react";

const VIEW_TABS = [
  { to: "/map", label: "Explore", icon: MapIcon },
  { to: "/split", label: "Split", icon: Columns2 },
  { to: "/sync", label: "Sync", icon: LayoutGrid },
];

/** Unified ribbon at the bottom of the map — Earth Pulse style. Keeps the position when switching views. */
export default function ViewSwitcher() {
  const location = useLocation();
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center justify-center px-4 py-3">
      <nav aria-label="Map views" className="pointer-events-auto inline-flex items-center gap-0.5 rounded-2xl border border-panel-line bg-panel-ribbon/95 px-1.5 py-1.5 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl">
        {VIEW_TABS.map((tab) => {
          const isActive = location.pathname === tab.to;
          const TabIcon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive ? "bg-cyan-500/15 text-accent-cyan-soft shadow-sm" : "text-panel-muted hover:text-panel-soft hover:bg-panel-tint"
              }`}
            >
              <TabIcon className="h-4 w-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
