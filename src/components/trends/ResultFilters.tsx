import { useId } from "react";
import { demoAttr } from "@/lib/demo/scripts";
import type { Direction, Indicator } from "@/lib/query/indicators";
import type { ResultFilter } from "@/lib/trends/query";
import { cn } from "@/lib/utils";

const AREAS = [0, 10, 100, 1_000, 10_000];
const FACTORS = [0.5, 1, 1.5, 2, 3, 4];

function formatAmount(value: number, decimals: number): string {
  return value.toFixed(Math.max(decimals, value < 1 ? 2 : 0)).replace(/\.0+$/, "");
}

interface ResultFiltersProps {
  indicator: Indicator;
  filter: ResultFilter;
  /** A yearly trend test was run (not just two years compared). */
  tested: boolean;
  onChange: (filter: ResultFilter) => void;
}

/** Which changes to show — applied at once to the scan's own pixels, with no new NASA maps. */
export default function ResultFilters({ indicator, filter, tested, onChange }: ResultFiltersProps) {
  const sliderId = useId();
  const areaId = useId();
  const strictId = useId();
  const factorIndex = Math.max(0, FACTORS.indexOf(filter.minFactor));
  const amount = indicator.minChange * filter.minFactor;
  const set = (change: Partial<ResultFilter>) => onChange({ ...filter, ...change });
  const options: [Direction, string][] = [
    ["decline", indicator.concern === "decline" ? "Declines" : "Decreases"],
    ["increase", "Increases"],
    ["any", "Both"],
  ];
  return (
    <div {...demoAttr("filters")} className="space-y-3">
      <div className="segmented flex w-full" role="radiogroup" aria-label="Show">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={filter.direction === value}
            onClick={() => set({ direction: value })}
            className={cn("flex-1", filter.direction === value ? "segment-on" : "segment")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <label htmlFor={sliderId} className="flex items-center justify-between text-[11px] text-panel-muted">
          <span>Smallest change</span>
          <span className="font-mono text-panel-foreground">
            {formatAmount(amount, indicator.decimals)} {indicator.unit}
          </span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={FACTORS.length - 1}
          step={1}
          value={factorIndex}
          onChange={(event) => set({ minFactor: FACTORS[Number(event.target.value)] })}
          aria-valuetext={`${formatAmount(amount, indicator.decimals)} ${indicator.unit}`}
          className="w-full accent-panel-foreground"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-panel-muted">
        <label htmlFor={areaId} className="flex items-center gap-1.5">
          Smallest area
          <select
            id={areaId}
            value={filter.minAreaKm2}
            onChange={(event) => set({ minAreaKm2: Number(event.target.value) })}
            className="rounded-md border border-panel-line-strong bg-panel px-1.5 py-1 text-[11px] text-panel-foreground pointer-coarse:min-h-11"
          >
            {AREAS.map((area) => (
              <option key={area} value={area}>
                {area === 0 ? "Any size" : `${area.toLocaleString("en-US")} km²`}
              </option>
            ))}
          </select>
        </label>
        {tested && (
          <label htmlFor={strictId} className="flex items-center gap-1.5">
            <input id={strictId} type="checkbox" checked={filter.strict} onChange={(event) => set({ strict: event.target.checked })} className="h-3.5 w-3.5 accent-panel-foreground pointer-coarse:h-5 pointer-coarse:w-5" />
            Only clear trends (p &lt; 0.05)
          </label>
        )}
      </div>
    </div>
  );
}
