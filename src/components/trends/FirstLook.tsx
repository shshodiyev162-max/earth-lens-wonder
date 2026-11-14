import { answerInWords, signed } from "@/lib/analysis/stats";
import type { Indicator } from "@/lib/query/indicators";
import type { ScanPreview } from "@/lib/trends/scan";
import YearTrendChart from "./YearTrendChart";

/**
 * While a scan reads its maps: the whole area from one map a year, read first. It says plainly that
 * it is rougher than the answer to come, which uses every month.
 */
export default function FirstLook({ preview, indicator, total }: { preview: ScanPreview; indicator: Indicator; total: number }) {
  const { verdict } = preview;
  const perDecade = verdict && verdict.slopePerDecade !== null ? `${signed(verdict.slopePerDecade, indicator.decimals)} ${indicator.unit} per decade` : null;
  return (
    <div className="mt-5 border-t border-panel-line pt-4">
      <p className="eyebrow text-panel-muted">First look · one map a year</p>
      <p className="mt-2 font-editorial text-[1.5rem] leading-tight text-panel-foreground">{verdict ? answerInWords(verdict) : "Too few years to tell yet."}</p>
      {perDecade && <p className="mt-1 font-mono text-[11px] tabular-nums text-panel-soft">{perDecade}</p>}
      <div className="mt-3 text-panel-soft">
        <YearTrendChart series={preview.series} unit={indicator.unit} decimals={indicator.decimals} compact label={`First look at ${indicator.noun}, one map a year`} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-panel-muted">
        From {preview.maps} of the {total} maps: the middle month of each year&apos;s season. The full answer uses every month and may differ.
      </p>
    </div>
  );
}
