import { useEffect, type ReactNode } from "react";
import { Layers3, X } from "lucide-react";
import ViewSwitcher from "./ViewSwitcher";

interface MapPageShellProps {
  title: string;
  description: string;
  sidebar: ReactNode;
  children: ReactNode;
  /** Right side of the top row over the map (status pill, buttons). */
  topRight?: ReactNode;
  /** Other UI floating above the map. */
  overlay?: ReactNode;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
}

/** Shared layout for Explore, Split and Sync: the original sidebar + full-bleed map + bottom view ribbon. */
export default function MapPageShell({ title, description, sidebar, children, topRight, overlay, panelOpen, onPanelOpenChange }: MapPageShellProps) {
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onPanelOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, onPanelOpenChange]);

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#02070d]">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside
          aria-label={`${title} controls`}
          className={`${panelOpen ? "flex" : "hidden"} fixed inset-x-0 top-16 bottom-0 z-[1300] w-full flex-col overflow-y-auto border-r border-panel-line bg-panel p-5 backdrop-blur-xl lg:static lg:z-auto lg:flex lg:w-[22rem] lg:shrink-0`}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-cyan">Earth observation</p>
              <h1 className="text-2xl font-bold text-panel-foreground">{title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-panel-muted">{description}</p>
            </div>
            <button type="button" onClick={() => onPanelOpenChange(false)} className="rounded-lg p-2 text-panel-muted hover:bg-panel-tint-strong hover:text-panel-foreground lg:hidden" aria-label="Close controls">
              <X className="h-5 w-5" />
            </button>
          </div>
          {sidebar}
        </aside>

        <main className="map-page relative min-h-0 flex-1">
          {children}

          <div className="pointer-events-none absolute inset-0 z-[1000]">
            {overlay}
            <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-3 lg:left-5 lg:right-5">
              <button
                type="button"
                onClick={() => onPanelOpenChange(true)}
                aria-expanded={panelOpen}
                className="pointer-events-auto flex items-center gap-2 rounded-xl border border-panel-line bg-panel/90 px-3 py-2.5 text-sm font-medium text-panel-foreground shadow-xl backdrop-blur lg:hidden"
              >
                <Layers3 className="h-4 w-4 text-accent-cyan" /> Controls
              </button>
              <div className="pointer-events-auto ml-auto flex items-center gap-2">{topRight}</div>
            </div>
            <ViewSwitcher />
          </div>
        </main>
      </div>
    </div>
  );
}

export function SidebarSection({ title, icon, children, action }: { title?: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5">
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-panel-muted">
            {icon}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
