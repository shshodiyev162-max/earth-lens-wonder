import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Image as ImageIcon, Loader2, Ruler, Search, X } from "lucide-react";
import { kindLabel } from "@/lib/geo/geocode";
import { isScienceLayer } from "@/lib/gibs/catalog";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./placeIcons";
import { useOpenSearchItem, useUniversalSearch, type SearchItem } from "./useUniversalSearch";

export interface NavSearchHandle {
  focus: () => void;
}

/** The search bar in the top navigation: places and NASA layers, right where you type. */
const NavSearch = forwardRef<NavSearchHandle, { className?: string; shortcut: string }>(function NavSearch({ className, shortcut }, ref) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { items, results, loading, error, resultsFor, searchNow } = useUniversalSearch(query, open);
  const openItem = useOpenSearchItem();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  useEffect(() => setHighlight(0), [items.length, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const choose = (item: SearchItem) => {
    openItem(item);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (items.length && (resultsFor === query.trim() || items[highlight]?.type === "layer")) choose(items[Math.min(highlight, items.length - 1)]);
      else if (query.trim().length >= 2) {
        setOpen(true);
        const found = await searchNow(query);
        if (found.length === 1) choose({ type: "place", place: found[0] });
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 transition-colors focus-within:border-primary/50 hover:border-primary/30">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search places or layers…"
          aria-label="Search places and NASA layers"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listId : undefined}
          aria-activedescendant={showDropdown && items.length ? `${listId}-option-${Math.min(highlight, items.length - 1)}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-label="Searching" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline">{shortcut}</kbd>
        )}
      </div>

      {showDropdown && (
        <div tabIndex={0} aria-label="Search results" className="absolute right-0 top-full z-[2100] mt-2 max-h-[min(26rem,70vh)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <div id={listId} role="listbox" aria-label="Places and NASA layers">
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
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(item)}
                    className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors", active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-primary/10")}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
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
          {loading && items.length === 0 && (
            <div role="status" aria-label="Searching" className="space-y-1 p-1">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3 px-2 py-2">
                  <div className="skeleton h-4 w-4 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-2/5" />
                    <div className="skeleton h-2.5 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && items.length === 0 && !error && resultsFor === trimmed && (
            <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              Nothing found for “{trimmed}”. Try a city, region or country, or coordinates like <span className="font-mono text-foreground">39.77, 64.42</span>.
            </p>
          )}
          {error && (
            <p role="alert" className="px-3 py-3 text-xs text-earth-yellow">
              {error}
            </p>
          )}
          <div className="mt-1 border-t border-border px-3 pb-1 pt-2 text-[10px] text-muted-foreground">Places © OpenStreetMap contributors</div>
        </div>
      )}
    </div>
  );
});

export default NavSearch;
