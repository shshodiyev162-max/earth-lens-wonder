import { useMemo, useState, type ReactNode } from "react";
import { BASE_LAYER_ID, getLayer } from "@/lib/gibs/catalog";
import { wmsGetMapUrl } from "@/lib/gibs/sample";
import { COVER_HEIGHT as HEIGHT, COVER_WIDTH as WIDTH, coverFrame } from "@/lib/analysis/cover";
import { polygonsOf } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";

/**
 * NASA's Blue Marble of a place, full width, with its outline drawn on top and the words set over
 * it: the report's cover. Always dark, like the planet on the home page.
 */
export default function PlaceCover({ target, children }: { target: AnalysisTarget; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const frame = useMemo(() => coverFrame(target.bbox), [target.bbox]);
  const layer = getLayer(BASE_LAYER_ID);
  const src = useMemo(() => (layer ? wmsGetMapUrl(layer, { bbox: frame, width: WIDTH, height: HEIGHT }, null) : null), [layer, frame]);

  const [w, s, e, n] = frame;
  const path = useMemo(() => {
    const toX = (lon: number) => ((lon - w) / (e - w)) * WIDTH;
    const toY = (lat: number) => ((n - lat) / (n - s)) * HEIGHT;
    return polygonsOf(target.geometry)
      .flatMap((polygon) => polygon.map((ring) => `M${ring.map(([lon, lat]) => `${toX(lon).toFixed(1)},${toY(lat).toFixed(1)}`).join("L")}Z`))
      .join("");
  }, [target, w, s, e, n]);

  return (
    <div className="dark relative isolate overflow-hidden bg-[#03040a]">
      <div aria-hidden className={`absolute inset-0 transition-[transform,opacity] [transition-duration:1400ms] ease-out motion-reduce:transition-none ${ready ? "scale-100 opacity-100" : "scale-[1.04] opacity-0"}`}>
        {src && <img src={src} alt="" width={WIDTH} height={HEIGHT} decoding="async" onLoad={() => setReady(true)} className="absolute inset-0 h-full w-full object-cover brightness-[.82] saturate-[.92]" />}
        {path && (
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
            <path d={path} fill="#ffffff" fillOpacity={0.06} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#03040a] via-[#03040a]/45 to-[#03040a]/15" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#03040a]/60 to-transparent to-60%" />
      <p className="absolute right-3 top-3 z-10 rounded bg-[#03040a]/65 px-1.5 py-0.5 font-mono text-[10px] text-white/85">Imagery: NASA Blue Marble</p>
      <div className="relative flex min-h-[clamp(16rem,38vh,26rem)] flex-col justify-end px-6 pb-7 pt-16 md:px-10">{children}</div>
    </div>
  );
}
