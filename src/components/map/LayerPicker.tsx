import { useMemo, useState } from "react";
import { ChevronDown, Layers3, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORY_LABELS, CATEGORY_ORDER, MAP_LAYERS, periodLabel, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";

interface LayerPickerProps {
  value: GibsLayer;
  onChange: (layer: GibsLayer) => void;
  label?: string;
}

export default function LayerPicker({ value, onChange, label = "Layer" }: LayerPickerProps) {
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
          className="flex w-full items-center justify-between rounded-xl border border-panel-line bg-panel-tint px-4 py-3 text-left transition hover:border-cyan-400/40"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-panel-foreground">{value.name}</span>
            <span className="mt-0.5 block truncate text-xs text-panel-muted">
              {value.source} · {periodLabel(value.period)}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-panel-muted transition ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="z-[1600] w-[var(--radix-popover-trigger-width)] min-w-[17rem] overflow-hidden rounded-xl border border-panel-line bg-panel-raised p-0 text-panel-foreground shadow-2xl"
      >
        <div className="flex items-center border-b border-panel-line px-3">
          <Search className="h-4 w-4 text-panel-muted" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search layers"
            className="w-full bg-transparent px-3 py-3 text-sm text-panel-foreground outline-none placeholder:text-panel-muted"
            aria-label="Search layers"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-3 py-4 text-center text-xs text-panel-muted">No layer matches “{query}”.</p>}
          {groups.map((group) => (
            <div key={group.category} className="mb-1">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-panel-muted">{CATEGORY_LABELS[group.category]}</div>
              {group.layers.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition ${item.id === value.id ? "bg-cyan-400/10 text-accent-cyan-soft" : "text-panel-soft hover:bg-panel-tint-strong"}`}
                >
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-panel-muted">
                    {item.source} · {periodLabel(item.period)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LayerPickerLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-panel-muted">
      <Layers3 className="h-4 w-4 text-accent-cyan" /> {children}
    </label>
  );
}
