import { chartShape, type Verdict, type YearPoint } from "./findings";

interface TrendChartProps {
  series: readonly YearPoint[];
  verdict: Verdict;
  /** The colour of the data (the interface itself stays neutral). */
  colour: string;
  /** Says the chart in words for people who can't see it. */
  label: string;
  /** How to print a yearly value, e.g. "20.2 °C". */
  format: (value: number) => string;
}

const WIDTH = 480;
const HEIGHT = 92;

/** One measured value a year, the trend through them, and the trend's 95% range. */
export default function TrendChart({ series, verdict, colour, label, format }: TrendChartProps) {
  const shape = chartShape(series, verdict, WIDTH, HEIGHT);
  const first = shape.points[0];
  const last = shape.points[shape.points.length - 1];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        <path d={shape.range} fill={colour} opacity={0.14} />
        <line {...shape.trend} stroke={colour} strokeWidth={1.25} strokeDasharray="5 4" opacity={0.9} vectorEffect="non-scaling-stroke" />
        <path d={shape.line} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} vectorEffect="non-scaling-stroke" />
        {shape.points.map((point) => (
          <circle key={point.year} cx={point.x} cy={point.y} r={1.9} fill="currentColor" />
        ))}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-[11px] tabular-nums text-white/70">
        <span>
          {shape.firstYear} <span className="text-white/50">· {format(first.value)}</span>
        </span>
        <span>
          {shape.lastYear} <span className="text-white/50">· {format(last.value)}</span>
        </span>
      </figcaption>
    </figure>
  );
}
