import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Image as ImageIcon, Loader2, Ruler, Search, X } from "lucide-react";
import { kindLabel } from "@/lib/geo/geocode";
import { getLayer, isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./placeIcons";
import { useOpenSearchItem, useUniversalSearch, type SearchItem } from "./useUniversalSearch";

// Shown before the user types, so the window is useful straight away.
const QUICK_LAYERS = [
  "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
  "MODIS_Terra_L3_NDVI_16Day",
  "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day",
  "IMERG_Precipitation_Rate",
  "MODIS_Terra_Aerosol",
  "VIIRS_Black_Marble",
]
  .map((id) => getLayer(id))
  .filter((layer): layer is GibsLayer => Boolean(layer));

/** Ctrl/⌘K window (and the search icon on phones): jump to any place on Earth or open any NASA layer. */
export default function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { items, results, loading, error, resultsFor, searchNow } = useUniversalSearch(query, open);
  const openItem = useOpenSearchItem();

  useEffect(() => setHighlight(0), [items.length, query]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const choose = (item: SearchItem) => {
    onOpenChange(false);
    openItem(item);
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (items.length && (resultsFor === query.trim() || items[highlight]?.type === "layer")) choose(items[Math.min(highlight, items.length - 1)]);
      else if (query.trim().length >= 2) {
        const found = await searchNow(query);
        if (found.length === 1) choose({ type: "place", place: found[0] });
      }
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const trimmed = query.trim();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2100] bg-background/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[10vh] z-[2101] w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search places and layers</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search any place, coordinates, or a NASA layer…"
              className="min-w-0 flex-1 bg-transparent py-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Search places and layers"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? `${listId}-option-${Math.min(highlight, items.length - 1)}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Searching" />}
            <DialogPrimitive.Close className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground" aria-label="Close search">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div ref={listRef} tabIndex={0} aria-label="Search results" className="max-h-[60vh] overflow-y-auto p-2">
            {trimmed.length < 2 && (
              <div className="px-1 py-1">
                <p className="px-3 pb-3 pt-1 text-sm text-muted-foreground">
                  Type a city, region, country, mountain or lake — or coordinates like <span className="font-mono text-foreground">39.77, 64.42</span>.
                </p>
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open a NASA layer</div>
                <div className="grid gap-0.5 sm:grid-cols-2">
                  {QUICK_LAYERS.map((layer) => {
                    const Icon = isScienceLayer(layer) ? Ruler : ImageIcon;
                    return (
                      <button
                        type="button"
                        key={layer.id}
                        onClick={() => choose({ type: "layer", layer })}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-primary/10"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{layer.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{layer.source}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div id={listId} role="listbox" aria-label="Places and layers">
              {results.length > 0 && <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Places</div>}
              {items.map((item, index) => {
                const Icon = item.type === "place" ? KIND_ICON[item.place.kind] : isScienceLayer(item.layer) ? Ruler : ImageIcon;
                const active = index === highlight;
                return (
                  <div key={item.type === "place" ? item.place.id : item.layer.id}>
                    {item.type === "layer" && index === results.length && (
                      <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">NASA layers</div>
                    )}
                    <button
                      type="button"
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      data-index={index}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(item)}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors", active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-primary/10")}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span translate="no" className="block truncate font-medium">
                          {item.type === "place" ? item.place.name : item.layer.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.type === "place" ? `${kindLabel(item.place.kind)}${item.place.context ? ` · ${item.place.context}` : ""}` : item.layer.source}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            {trimmed.length >= 2 && loading && items.length === 0 && (
              <div role="status" aria-label="Searching" className="space-y-1 p-1">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center gap-3 px-2 py-2.5">
                    <div className="skeleton h-4 w-4 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-1/3" />
                      <div className="skeleton h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {trimmed.length >= 2 && !loading && items.length === 0 && resultsFor === trimmed && !error && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found for “{trimmed}”. Check the spelling or try coordinates like 39.77, 64.42.</p>
            )}
            {error && (
              <p role="alert" className="px-3 py-4 text-sm text-earth-yellow">
                {error}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">↑↓ to move · Enter to open · Esc to close</span>
            <span>Places © OpenStreetMap contributors</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
