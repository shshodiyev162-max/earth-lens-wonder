import { useEffect, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import ViewSwitcher from "./ViewSwitcher";
import { cn } from "@/lib/utils";

interface MapPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  sidebar: ReactNode;
  children: ReactNode;
  /** Absolutely positioned UI floating above the map. */
  overlay?: ReactNode;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
}

/** Shared layout for Explore, Compare and Side-by-side: sidebar + full-bleed map. */
export default function MapPageShell({ eyebrow, title, description, sidebar, children, overlay, panelOpen, onPanelOpenChange }: MapPageShellProps) {
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onPanelOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, onPanelOpenChange]);

  return (
    <div className="relative h-[calc(100dvh-4rem)] overflow-hidden bg-space-deep">
      <div className="flex h-full min-h-0">
        <aside
          className={cn(
            "relative flex-col overflow-y-auto overscroll-contain border-r border-border/60 bg-card/95 backdrop-blur-2xl",
            "lg:static lg:z-auto lg:flex lg:w-[23rem] lg:shrink-0",
            panelOpen ? "fixed inset-x-0 bottom-0 top-16 z-[1300] flex animate-in fade-in-0 slide-in-from-bottom-4 duration-300" : "hidden",
          )}
          aria-label={`${title} controls`}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4 px-5 pb-4 pt-5">
            <div>
              <p className="mb-1 eyebrow">{eyebrow}</p>
              <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => onPanelOpenChange(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground lg:hidden"
              aria-label="Close controls"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex-1 space-y-5 px-5 pb-28 lg:pb-6">{sidebar}</div>
        </aside>

        <section aria-label="Map" className="map-page relative min-h-0 min-w-0 flex-1">
          {children}
          <div className="pointer-events-none absolute inset-0 z-[1000]">
            {overlay}
            <button
              type="button"
              onClick={() => onPanelOpenChange(true)}
              aria-expanded={panelOpen}
              className="pointer-events-auto absolute bottom-20 left-3 flex min-h-[44px] items-center gap-2 rounded-xl glass-strong px-3.5 py-2.5 text-sm font-medium text-foreground shadow-xl shadow-black/30 transition-colors hover:border-primary/40 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Layers & areas
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
              <ViewSwitcher />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function SidebarSection({ title, icon, children, action }: { title?: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 section-label">
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
