import { useMemo, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon, Layers3, Ruler, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORY_LABELS, CATEGORY_ORDER, MAP_LAYERS, isScienceLayer, periodLabel, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";
import { cn } from "@/lib/utils";

interface LayerPickerProps {
  value: GibsLayer;
  onChange: (layer: GibsLayer) => void;
  label?: string;
  className?: string;
}

export default function LayerPicker({ value, onChange, label = "Layer", className }: LayerPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const filtered = searchLayers(query, MAP_LAYERS);
    return CATEGORY_ORDER.map((category) => ({ category, layers: filtered.filter((l) => l.category === category) })).filter((g) => g.layers.length);
  }, [query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value.name}, ${value.source}`}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            className,
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{value.name}</span>
            <span className="mt-0.5 block truncate text-xs text-slate-400">{value.source}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="z-[1600] w-[min(22rem,calc(100vw-2rem))] border-white/10 bg-[#0b1725] p-0 text-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search layers (e.g. vegetation, heat, dust)"
            className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-600"
            aria-label="Search layers"
          />
        </div>
        <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-3 py-6 text-center text-xs text-slate-500">No layer matches “{query}”.</p>}
          {groups.map((group) => (
            <div key={group.category} className="mb-1">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{CATEGORY_LABELS[group.category]}</div>
              {group.layers.map((item) => {
                const selected = item.id === value.id;
                const Icon = isScienceLayer(item) ? Ruler : ImageIcon;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn("flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition", selected ? "bg-primary/10" : "hover:bg-white/5")}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-primary" : "text-slate-500")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-medium", selected ? "text-primary" : "text-slate-100")}>{item.name}</span>
                      <span className="block text-xs text-slate-500">
                        {item.source} · {periodLabel(item.period)}
                      </span>
                    </span>
                    {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <ImageIcon className="h-3 w-3" /> Imagery
          </span>
          <span className="flex items-center gap-1">
            <Ruler className="h-3 w-3" /> Measurable — click the map to read values
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LayerPickerLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      <Layers3 className="h-3.5 w-3.5 text-primary" /> {children}
    </label>
  );
}
