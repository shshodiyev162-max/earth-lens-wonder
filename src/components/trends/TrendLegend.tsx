import type { ChangeScale } from "@/lib/trends/render";

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

function format(value: number): string {
  const text = Math.abs(value) >= 10 ? value.toFixed(0) : Math.abs(value) >= 1 ? value.toFixed(1) : value.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");
  return value > 0 ? `+${text}` : value < 0 ? `−${text.replace("-", "")}` : "0";
}

/** Diverging legend for the change map, in real units (per decade for trends). */
export default function TrendLegend({ scale, title }: { scale: ChangeScale; title: string }) {
  return (
    <div className="pointer-events-auto w-60 rounded-xl border border-panel-line bg-panel/90 p-3 text-panel-foreground shadow-xl backdrop-blur">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mb-2 text-[11px] text-panel-muted">{scale.unit}</p>
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right, ${rgb(scale.decline)}, rgb(226,232,240), ${rgb(scale.increase)})` }} aria-hidden />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-panel-soft">
        <span>{format(-scale.max)}</span>
        <span>0</span>
        <span>{format(scale.max)}</span>
      </div>
      {scale.mode === "perDecade" && <p className="mt-2 text-[11px] leading-relaxed text-panel-muted">Faded pixels: no significant trend (Mann–Kendall p ≥ 0.05).</p>}
    </div>
  );
}
