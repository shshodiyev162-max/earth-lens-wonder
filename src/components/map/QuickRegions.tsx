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
    <section className="mb-6">
      <h2 className="field-label mb-2.5">Jump to</h2>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_REGIONS.map((region) => (
          <button
            key={region.id}
            type="button"
            aria-pressed={activeId === region.id}
            onClick={() => onSelect(region)}
            className={activeId === region.id ? "chip-on" : "chip"}
          >
            {region.name}
          </button>
        ))}
      </div>
    </section>
  );
}
