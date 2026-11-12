import { useEffect, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import ViewSwitcher from "./ViewSwitcher";

interface MapPageShellProps {
  /** Small capitals above the title, and how the panel is named for screen readers. */
  eyebrow: string;
  title: string;
  description: string;
  /** With results on show the panel gives its space to them: the title and text fold away. */
  compactHeader?: boolean;
  sidebar: ReactNode;
  children: ReactNode;
  /** Right side of the top row over the map (status pill, buttons). */
  topRight?: ReactNode;
  /** Other UI floating above the map. */
  overlay?: ReactNode;
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
}

/** Shared layout for Explore, Split, Sync and Trends: a side panel, the map full-bleed beside it, and the view ribbon. */
export default function MapPageShell({ eyebrow, title, description, compactHeader = false, sidebar, children, topRight, overlay, panelOpen, onPanelOpenChange }: MapPageShellProps) {
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onPanelOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, onPanelOpenChange]);

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden bg-[#03040a]">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside
          aria-label={`${eyebrow} controls`}
          className={`${panelOpen ? "flex" : "hidden"} fixed inset-x-0 top-16 bottom-0 z-[1300] w-full flex-col overflow-y-auto border-r border-panel-line bg-panel px-6 pt-7 lg:relative lg:inset-auto lg:z-auto lg:flex lg:w-[24rem] lg:shrink-0`}
        >
          <header className={compactHeader ? "mb-4 flex items-center justify-between gap-4" : "mb-7"}>
            <div className="flex items-start justify-between gap-4">
              <p className="eyebrow text-panel-muted">{eyebrow}</p>
            </div>
            {compactHeader ? (
              <h1 className="sr-only">{title}</h1>
            ) : (
              <>
                <h1 className="mt-3 font-editorial text-[2.75rem] leading-[1.03] tracking-[-0.012em] text-panel-foreground">{title}</h1>
                <p className="mt-3 text-sm leading-relaxed text-panel-muted">{description}</p>
              </>
            )}
            <button
              type="button"
              onClick={() => onPanelOpenChange(false)}
              className={`rounded-full p-2 text-panel-muted hover:text-panel-foreground lg:hidden ${compactHeader ? "" : "absolute right-4 top-5"}`}
              aria-label="Close controls"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </header>
          {sidebar}
          <div aria-hidden className="h-6 shrink-0" />
        </aside>

        <main className="map-page relative min-h-0 flex-1">
          {children}

          <div className="pointer-events-none absolute inset-0 z-[1000]">
            {/* The map fades into the dark at its edges, like the planet on the home page. */}
            <div aria-hidden className="absolute inset-0 shadow-[inset_0_0_120px_30px_rgb(3_4_10/0.5)]" />
            {overlay}
            <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-3 lg:left-5 lg:right-5">
              <button
                type="button"
                onClick={() => onPanelOpenChange(true)}
                aria-expanded={panelOpen}
                className="float-surface pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-panel-foreground lg:hidden pointer-coarse:min-h-11"
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} /> Controls
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

export function SidebarSection({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-6">
      {title && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h2 className="field-label">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
