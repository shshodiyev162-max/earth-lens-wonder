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
    <div className="relative h-[calc(100dvh-4rem)] overflow-hidden bg-[#02070d]">
      <div className="flex h-full min-h-0">
        <aside
          className={cn(
            "flex-col overflow-y-auto border-r border-white/10 bg-[#07111d]/[0.98] backdrop-blur-xl",
            "lg:static lg:z-auto lg:flex lg:w-[23rem] lg:shrink-0",
            panelOpen ? "fixed inset-x-0 bottom-0 top-16 z-[1300] flex" : "hidden",
          )}
          aria-label={`${title} controls`}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</p>
              <h1 className="text-xl font-bold text-white">{title}</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => onPanelOpenChange(false)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Close controls"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 space-y-5 px-5 pb-28 lg:pb-6">{sidebar}</div>
        </aside>

        <section aria-label="Map" className="map-page relative min-h-0 min-w-0 flex-1">
          {children}
          <div className="pointer-events-none absolute inset-0 z-[1000]">
            {overlay}
            <button
              type="button"
              onClick={() => onPanelOpenChange(true)}
              className="pointer-events-auto absolute bottom-20 left-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#07111d]/90 px-3 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur lg:hidden"
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
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
