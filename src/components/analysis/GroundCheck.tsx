import { Loader2 } from "lucide-react";
import type { GroundCheckState } from "@/hooks/useGroundCheck";
import type { YearValue } from "@/lib/analysis/aggregate";
import { METRIC_BY_ID } from "@/lib/analysis/metrics";
import { groundCheckText, type GroundComparison } from "@/lib/stations/groundCheck";
import { STATION_RADIUS_KM } from "@/lib/stations/ncei";
import { cn } from "@/lib/utils";

const W = 320;
const H = 92;
const PAD = { left: 4, right: 4, top: 8, bottom: 16 };

/** NASA's yearly values (solid) and the station's (dashed) on one scale. */
function TwoLines({ nasa, station, label }: { nasa: YearValue[]; station: YearValue[]; label: string }) {
  const points = [...nasa, ...station].filter((year) => year.value !== null) as { year: number; value: number }[];
  if (points.length < 4) return null;
  const years = points.map((p) => p.year);
  const values = points.map((p) => p.value);
  const [x0, x1] = [Math.min(...years), Math.max(...years)];
  const [y0, y1] = [Math.min(...values), Math.max(...values)];
  const x = (year: number) => PAD.left + ((year - x0) / Math.max(1, x1 - x0)) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - y0) / Math.max(1e-9, y1 - y0)) * (H - PAD.top - PAD.bottom);
  const path = (series: YearValue[]) =>
    series
      .filter((year) => year.value !== null)
      .map((year, i) => `${i ? "L" : "M"}${x(year.year).toFixed(1)} ${y(year.value as number).toFixed(1)}`)
      .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full max-w-sm text-foreground">
      <path d={path(nasa)} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d={path(station)} fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={PAD.left} y={H - 3} className="fill-muted-foreground font-mono text-[9px]">
        {x0}
      </text>
      <text x={W - PAD.right} y={H - 3} textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">
        {x1}
      </text>
    </svg>
  );
}

function Comparison({ comparison }: { comparison: GroundComparison }) {
  const metric = METRIC_BY_ID[comparison.measure];
  return (
    <article className="border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">{metric.label}</h4>
        <span className={cn("font-mono text-[11px] uppercase tracking-[0.14em]", comparison.agree ? "text-foreground" : "text-tone-warn")}>
          {comparison.agree ? "Agrees" : "Differs"}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        <span translate="no">{groundCheckText(comparison, metric.unit, metric.decimals)}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <TwoLines
          nasa={comparison.nasaYearly}
          station={comparison.stationYearly}
          label={`${metric.label} each year: NASA's record and the ${comparison.station.name} weather station`}
        />
        <p className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          <span aria-hidden>━</span> NASA, about 50 km across
          <br />
          <span aria-hidden>┅</span> <span translate="no">{comparison.station.name}</span> station
        </p>
      </div>
    </article>
  );
}

/** "Checked against the ground": NASA's temperature and rainfall trends beside the nearest NOAA weather station's. */
export default function GroundCheck({ state }: { state: GroundCheckState }) {
  if (state.status === "idle") return null;
  return (
    <section aria-labelledby="ground-title">
      <h3 id="ground-title" className="eyebrow">
        Checked against the ground
      </h3>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        NASA's climate record here comes from a weather model kept on track by satellites and stations, about 50 km across. The nearest NOAA weather station measured the same thing on the ground, so its trend is tested the same way and set beside NASA's.
      </p>
      <div aria-live="polite" className="mt-4 space-y-5">
        {state.status === "loading" && (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Looking for weather stations near this place…
          </p>
        )}
        {state.status === "none" && <p className="text-[13px] text-muted-foreground">No NOAA weather station within {STATION_RADIUS_KM} km has a long enough record for these years, so there's nothing on the ground to check against.</p>}
        {state.status === "error" && <p className="text-[13px] text-tone-warn">NOAA's station archive didn't answer. NASA's results above don't depend on it; try again later.</p>}
        {state.status === "done" && state.comparisons.map((comparison) => <Comparison key={comparison.measure} comparison={comparison} />)}
        {state.status === "done" && state.missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No nearby station has a long enough record of {state.missing.map((id) => METRIC_BY_ID[id].noun).join(" or ")} for these years.
          </p>
        )}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Stations: NOAA Climate Data Online, global summary of the month (GHCN), within {STATION_RADIUS_KM} km. The same months of each year and the same trend test as NASA's.
      </p>
    </section>
  );
}
