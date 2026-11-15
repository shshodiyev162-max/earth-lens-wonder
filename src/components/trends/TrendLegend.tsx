import type { ChangeScale } from "@/lib/trends/render";

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

function format(value: number): string {
  const text = Math.abs(value) >= 10 ? value.toFixed(0) : Math.abs(value) >= 1 ? value.toFixed(1) : value.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");
  return value > 0 ? `+${text}` : value < 0 ? `−${text.replace("-", "")}` : "0";
}

/**
 * Diverging legend for the change map, in real units (per decade for trends). `compact` is the
 * phone version: the colours, their ends and the unit, small enough to sit over the map.
 */
export default function TrendLegend({
  scale,
  title,
  strict = true,
  compact = false,
  tested = scale.mode === "perDecade",
}: {
  scale: ChangeScale;
  title: string;
  strict?: boolean;
  compact?: boolean;
  /** Whether each pixel was tested (always for trends; open water shows then vs now, tested too). */
  tested?: boolean;
}) {
  return (
    <div className={compact ? "float-surface pointer-events-auto w-44 px-2.5 py-2 text-panel-foreground" : "float-surface pointer-events-auto w-60 p-3 text-panel-foreground"}>
      <p className={compact ? "truncate text-[11px] font-medium" : "text-xs font-medium"}>{title}</p>
      <p className={compact ? "mb-1.5 font-mono text-[9.5px] text-panel-muted" : "mb-2 font-mono text-[10px] text-panel-muted"}>{scale.unit}</p>
      <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(to right, ${rgb(scale.decline)}, rgb(226,232,240), ${rgb(scale.increase)})` }} aria-hidden />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-panel-soft">
        <span>{format(-scale.max)}</span>
        <span>0</span>
        <span>{format(scale.max)}</span>
      </div>
      {tested && !compact && (
        <p className="mt-2 text-[11px] leading-snug text-panel-muted">
          {strict ? `Faded pixels: no clear ${scale.mode === "perDecade" ? "trend" : "change"}, allowing for the many pixels tested at once.` : "Faded pixels: no trend at p < 0.1 (Mann–Kendall)."}
        </p>
      )}
    </div>
  );
}
