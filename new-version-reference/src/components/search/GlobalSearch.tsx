import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Image as ImageIcon, Loader2, Ruler, Search, X } from "lucide-react";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { kindLabel, type PlaceResult } from "@/lib/geo/geocode";
import { MAP_LAYERS, isScienceLayer, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";
import { useWorkspace } from "@/context/WorkspaceContext";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./placeIcons";

type Item = { type: "place"; place: PlaceResult } | { type: "layer"; layer: GibsLayer };

const MAP_PATHS = ["/map", "/split", "/sync"];

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
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2100] bg-[#02070d]/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-[2101] w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1725] shadow-2xl shadow-black/60 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search places and layers</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-white/10 px-4">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search any place on Earth, coordinates, or a NASA layer…"
              className="min-w-0 flex-1 bg-transparent py-4 text-base text-white outline-none placeholder:text-slate-500"
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
            <DialogPrimitive.Close className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white" aria-label="Close search">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
            {trimmed.length < 2 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                Type a city, region, country, mountain or lake — or coordinates like <span className="font-mono text-slate-300">39.77, 64.42</span>.
              </div>
            )}
            <div id={listId} role="listbox" aria-label="Places and layers">
              {results.length > 0 && (
                <div role="presentation" className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                      <div role="presentation" className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
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
              <div className="px-3 py-6 text-center text-sm text-slate-500">Nothing found for “{trimmed}”.</div>
            )}
            {error && <div className="px-3 py-4 text-sm text-amber-300">{error}</div>}
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-slate-500">
            <span>↑↓ to move · Enter to open · Esc to close</span>
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
        className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", active ? "bg-primary/10" : "hover:bg-white/5")}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-slate-500")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{item.place.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {kindLabel(item.place.kind)}
            {item.place.context ? ` · ${item.place.context}` : ""}
          </span>
        </span>
        {active && <span className="hidden text-[10px] text-slate-500 sm:inline">Show on map ↵</span>}
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
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", active ? "bg-primary/10" : "hover:bg-white/5")}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-slate-500")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{item.layer.name}</span>
        <span className="block truncate text-xs text-slate-500">{item.layer.source}</span>
      </span>
      {active && <span className="hidden text-[10px] text-slate-500 sm:inline">Open layer ↵</span>}
    </button>
  );
}
