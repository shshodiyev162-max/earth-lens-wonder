import { WATER_STOPS } from "@/lib/trends/water";

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

/** Legend for open-water frames: blue where it was water all season, sand where it was land. */
export default function WaterLegend() {
  const [land, water] = WATER_STOPS;
  return (
    <div className="float-surface pointer-events-auto w-60 p-3 text-panel-foreground">
      <p className="text-xs font-medium">Open water</p>
      <p className="mb-2 font-mono text-[10px] text-panel-muted">share of the season under water</p>
      <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(to right, ${rgb(land.color)}, ${rgb(water.color)})` }} aria-hidden />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-panel-soft">
        <span>Land</span>
        <span>Water</span>
      </div>
    </div>
  );
}
