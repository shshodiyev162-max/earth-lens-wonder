import { Link, useLocation } from "react-router-dom";

const VIEW_TABS = [
  { to: "/map", label: "Explore" },
  { to: "/split", label: "Split" },
  { to: "/sync", label: "Sync" },
  { to: "/trends", label: "Trends" },
  { to: "/atlas", label: "Atlas" },
];

/** The ways of looking at the map, along its bottom edge. Keeps the position when switching views. */
export default function ViewSwitcher() {
  const location = useLocation();
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center justify-center px-4 py-3.5">
      <nav aria-label="Map views" className="float-surface pointer-events-auto inline-flex items-center gap-0.5 rounded-full p-1">
        {VIEW_TABS.map((tab) => {
          const active = location.pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center rounded-full px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors pointer-coarse:min-h-11 sm:px-3.5 sm:tracking-[0.14em] ${
                active ? "bg-panel-foreground text-panel" : "text-panel-soft hover:text-panel-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
