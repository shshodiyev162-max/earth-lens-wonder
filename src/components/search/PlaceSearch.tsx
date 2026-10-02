import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search, X } from "lucide-react";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { kindLabel, type PlaceResult } from "@/lib/geo/geocode";
import type { LatLng } from "@/lib/geo/geometry";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./placeIcons";

interface PlaceSearchProps {
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
  near?: LatLng;
  variant?: "map" | "panel" | "hero";
  autoFocus?: boolean;
  className?: string;
  /** Clear the box after a selection instead of showing the chosen name. */
  clearOnSelect?: boolean;
  ariaLabel?: string;
}

export default function PlaceSearch({
  onSelect,
  placeholder = "Search a place or coordinates",
  near,
  variant = "panel",
  autoFocus,
  className,
  clearOnSelect,
  ariaLabel = "Search places",
}: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { results, loading, error, resultsFor, searchNow } = usePlaceSearch(query, { near, enabled: open });

  useEffect(() => setHighlight(0), [results]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const choose = (place: PlaceResult) => {
    onSelect(place);
    setQuery(clearOnSelect ? "" : place.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results.length && resultsFor === query.trim()) {
        choose(results[Math.min(highlight, results.length - 1)]);
      } else if (query.trim().length >= 2) {
        setOpen(true);
        const found = await searchNow(query);
        if (found.length === 1) choose(found[0]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;
  const big = variant === "hero";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2 border transition-colors focus-within:border-primary/60",
          variant === "map" && "rounded-xl border-white/10 bg-[#07111d]/90 px-3 shadow-xl backdrop-blur",
          variant === "panel" && "rounded-xl border-white/10 bg-white/[0.04] px-3",
          variant === "hero" && "rounded-2xl border-white/15 bg-[#07111d]/80 px-5 shadow-2xl shadow-black/40 backdrop-blur-xl",
        )}
      >
        <Search className={cn("shrink-0 text-slate-400", big ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listId : undefined}
          aria-activedescendant={showDropdown && results.length ? `${listId}-option-${Math.min(highlight, results.length - 1)}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className={cn("min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500", big ? "py-4 text-base" : "py-2.5 text-sm")}
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Searching" />}
        {query && !loading && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-[1500] mt-2 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1725]/98 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div id={listId} role="listbox" aria-label="Places">
            {results.length > 0 &&
              results.map((place, index) => {
                const Icon = KIND_ICON[place.kind];
                return (
                  <button
                    type="button"
                    key={place.id}
                    id={`${listId}-option-${index}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === highlight}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(place)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition",
                      index === highlight ? "bg-primary/10" : "hover:bg-white/5",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", index === highlight ? "text-primary" : "text-slate-500")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{place.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {kindLabel(place.kind)}
                        {place.context ? ` · ${place.context}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
          {!loading && results.length === 0 && !error && resultsFor === trimmed && (
            <div className="px-3 py-3 text-xs leading-relaxed text-slate-400">
              No places found for “{trimmed}”. Try a city, region or country, or coordinates like <span className="font-mono text-slate-300">39.77, 64.42</span>
              .
            </div>
          )}
          {error && <div className="px-3 py-3 text-xs text-amber-300">{error}</div>}
          {loading && results.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">Searching…</div>}
          <div className="border-t border-white/5 px-3 pb-1 pt-2 text-[10px] text-slate-600">
            Search by Photon &amp; Nominatim · © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  );
}
