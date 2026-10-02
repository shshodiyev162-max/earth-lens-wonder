import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Image as ImageIcon, Loader2, MapPinOff, Ruler, Search, X } from "lucide-react";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { kindLabel, type PlaceResult } from "@/lib/geo/geocode";
import { MAP_LAYERS, getLayer, isScienceLayer, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";
import { useWorkspace } from "@/context/WorkspaceContext";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./placeIcons";

type Item = { type: "place"; place: PlaceResult } | { type: "layer"; layer: GibsLayer };

const MAP_PATHS = ["/map", "/split", "/sync"];
// Shown before the user types, so the palette is useful straight away.
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

/** ⌘K / Ctrl+K palette: jump to any place on Earth or open any NASA layer. */
export default function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { view } = useWorkspace();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { results, loading, error, resultsFor, searchNow } = usePlaceSearch(query, { near: view.center, enabled: open });
  const layers = useMemo(() => (query.trim().length >= 2 ? searchLayers(query, MAP_LAYERS).slice(0, 4) : []), [query]);
  const items: Item[] = useMemo(
    () => [...results.map((place) => ({ type: "place" as const, place })), ...layers.map((layer) => ({ type: "layer" as const, layer }))],
    [results, layers],
  );

  useEffect(() => setHighlight(0), [items.length, query]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const choose = (item: Item) => {
    onOpenChange(false);
    if (item.type === "place") {
      const path = MAP_PATHS.includes(window.location.pathname) ? window.location.pathname : "/map";
      navigate(`${path}${path === window.location.pathname ? window.location.search : ""}`, { state: { focusPlace: item.place } });
    } else {
      navigate(`/map?layer=${encodeURIComponent(item.layer.id)}`);
    }
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2100] bg-space-deep/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[10vh] z-[2101] w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl menu shadow-2xl shadow-black/60 outline-none glow-primary data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search places and layers</DialogPrimitive.Title>
          <div aria-hidden="true" className="pointer-events-none absolute -top-20 left-1/2 h-32 w-2/3 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex items-center gap-3 border-b border-border/60 px-4">
            <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search any place on Earth, coordinates, or a NASA layer…"
              className="min-w-0 flex-1 bg-transparent py-4 text-base text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Search places and layers"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? optionId(listId, Math.min(highlight, items.length - 1)) : undefined}
              autoComplete="off"
              spellCheck={false}
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Searching" />}
            <DialogPrimitive.Close className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="Close search">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div ref={listRef} tabIndex={0} aria-label="Search results" className="relative max-h-[60vh] overflow-y-auto overscroll-contain p-2">
            {trimmed.length < 2 && (
              <div className="px-1 py-2">
                <p className="px-2 pb-3 text-sm text-muted-foreground">
                  Type a city, region, country, mountain or lake — or coordinates like <span className="font-mono text-foreground/85">39.77, 64.42</span>.
                </p>
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Open a NASA layer</div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {QUICK_LAYERS.map((layer) => {
                    const Icon = isScienceLayer(layer) ? Ruler : ImageIcon;
                    return (
                      <button
                        type="button"
                        key={layer.id}
                        onClick={() => choose({ type: "layer", layer })}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-secondary/60 focus-visible:bg-secondary/60"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{layer.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{layer.source}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div id={listId} role="listbox" aria-label="Places and layers">
              {results.length > 0 && (
                <div role="presentation" className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Places
                </div>
              )}
              {items.map((item, index) => {
                const row = (
                  <ResultRow
                    key={item.type === "place" ? item.place.id : item.layer.id}
                    id={optionId(listId, index)}
                    item={item}
                    index={index}
                    active={index === highlight}
                    onHover={setHighlight}
                    onChoose={choose}
                  />
                );
                if (item.type === "layer" && index === results.length) {
                  return (
                    <div key="layers-header" role="presentation">
                      <div role="presentation" className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        NASA layers
                      </div>
                      {row}
                    </div>
                  );
                }
                return row;
              })}
            </div>
            {trimmed.length >= 2 && !loading && items.length === 0 && resultsFor === trimmed && !error && (
              <div className="flex flex-col items-center px-3 py-8 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/60">
                  <MapPinOff className="h-5 w-5 text-muted-foreground" aria-hidden />
                </span>
                <p className="text-sm font-medium text-foreground">Nothing found for “{trimmed}”</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">Check the spelling, try a bigger place nearby, or paste coordinates like 39.77, 64.42.</p>
              </div>
            )}
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
            {error && <div className="px-3 py-4 text-sm text-earth-yellow">{error}</div>}
          </div>
          <div className="relative flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 text-[10px] text-muted-foreground">
            <span className="hidden items-center gap-1.5 sm:flex">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd> move <kbd className="kbd ml-1.5">Enter</kbd> open <kbd className="kbd ml-1.5">Esc</kbd> close
            </span>
            <span>Places © OpenStreetMap contributors</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function optionId(listId: string, index: number): string {
  return `${listId}-option-${index}`;
}

interface ResultRowProps {
  id: string;
  item: Item;
  index: number;
  active: boolean;
  onHover: (i: number) => void;
  onChoose: (item: Item) => void;
}

function ResultRow({ id, item, index, active, onHover, onChoose }: ResultRowProps) {
  if (item.type === "place") {
    const Icon = KIND_ICON[item.place.kind];
    return (
      <button
        type="button"
        id={id}
        role="option"
        aria-selected={active}
        tabIndex={-1}
        data-index={index}
        onMouseEnter={() => onHover(index)}
        onClick={() => onChoose(item)}
        className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", active ? "bg-primary/10" : "hover:bg-secondary/60")}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-sm font-medium text-foreground">{item.place.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {kindLabel(item.place.kind)}
            {item.place.context ? ` · ${item.place.context}` : ""}
          </span>
        </span>
        {active && <span className="hidden text-[10px] text-muted-foreground sm:inline">Show on map ↵</span>}
      </button>
    );
  }
  const Icon = isScienceLayer(item.layer) ? Ruler : ImageIcon;
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-index={index}
      onMouseEnter={() => onHover(index)}
      onClick={() => onChoose(item)}
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", active ? "bg-primary/10" : "hover:bg-secondary/60")}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{item.layer.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{item.layer.source}</span>
      </span>
      {active && <span className="hidden text-[10px] text-muted-foreground sm:inline">Open layer ↵</span>}
    </button>
  );
}
