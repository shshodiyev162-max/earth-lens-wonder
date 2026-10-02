import { Globe2 } from "lucide-react";
import type { LatLng } from "@/lib/geo/geometry";

const QUICK_REGIONS: { id: string; name: string; center: LatLng; zoom: number }[] = [
  { id: "world", name: "World", center: [20, 0], zoom: 2 },
  { id: "uzbekistan", name: "Uzbekistan", center: [41.5, 64], zoom: 5 },
  { id: "central-asia", name: "Central Asia", center: [42, 65], zoom: 4 },
  { id: "amazon", name: "Amazon", center: [-4, -62], zoom: 4 },
  { id: "himalayas", name: "Himalayas", center: [28, 84], zoom: 5 },
];

export type QuickRegion = (typeof QUICK_REGIONS)[number];

/** One-tap jumps to a few regions, as in the original Explore sidebar. */
export default function QuickRegions({ activeId, onSelect }: { activeId: string | null; onSelect: (region: QuickRegion) => void }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Globe2 className="h-4 w-4 text-cyan-400" /> Quick regions
      </h2>
      <div className="flex flex-wrap gap-2">
        {QUICK_REGIONS.map((region) => (
          <button
            key={region.id}
            type="button"
            aria-pressed={activeId === region.id}
            onClick={() => onSelect(region)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${activeId === region.id ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            {region.name}
          </button>
        ))}
      </div>
    </section>
  );
}
