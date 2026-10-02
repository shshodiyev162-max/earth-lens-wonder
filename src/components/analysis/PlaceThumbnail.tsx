import { useMemo, useState } from "react";
import { getLayer, BASE_LAYER_ID } from "@/lib/gibs/catalog";
import { wmsGetMapUrl } from "@/lib/gibs/sample";
import { clampBBox, polygonsOf, type BBox } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const WIDTH = 320;
const HEIGHT = 240;
// Small places are shown inside at least this much latitude, so the thumbnail
// gives regional context instead of a few blurry pixels.
const MIN_SPAN_DEG = 0.7;

/** Expands the area's box to a 4:3 frame (in ground distance) with some margin. */
function frameFor(bbox: BBox): BBox {
  const [w, s, e, n] = bbox;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const cos = Math.max(Math.cos((cy * Math.PI) / 180), 0.2);
  let halfLat = Math.max(((n - s) / 2) * 1.4, MIN_SPAN_DEG / 2);
  let halfLon = Math.max(((e - w) / 2) * 1.4, (MIN_SPAN_DEG / 2) / cos);
  const groundRatio = (halfLon * cos) / halfLat;
  const want = WIDTH / HEIGHT;
  if (groundRatio < want) halfLon = (halfLat * want) / cos;
  else halfLat = (halfLon * cos) / want;
  return clampBBox([cx - halfLon, cy - halfLat, cx + halfLon, cy + halfLat]);
}

/**
 * A cloud-free NASA Blue Marble thumbnail of the place with its outline drawn on top.
 * Uses the same GIBS WMS endpoint as the analysis, so no extra service or key.
 */
export default function PlaceThumbnail({ target, className }: { target: AnalysisTarget; className?: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const frame = useMemo(() => frameFor(target.bbox), [target.bbox]);
  const layer = getLayer(BASE_LAYER_ID);
  const src = useMemo(() => (layer ? wmsGetMapUrl(layer, { bbox: frame, width: WIDTH, height: HEIGHT }, null) : null), [layer, frame]);

  const [w, s, e, n] = frame;
  const toX = (lon: number) => ((lon - w) / (e - w)) * WIDTH;
  const toY = (lat: number) => ((n - lat) / (n - s)) * HEIGHT;
  const path = useMemo(
    () =>
      polygonsOf(target.geometry)
        .flatMap((polygon) => polygon.map((ring) => `M${ring.map(([lon, lat]) => `${toX(lon).toFixed(1)},${toY(lat).toFixed(1)}`).join("L")}Z`))
        .join(""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target.geometry, frame],
  );
  const [cLat, cLon] = target.center;

  return (
    <div className={cn("relative aspect-[16/7] overflow-hidden rounded-xl border border-border/50 bg-space-deep sm:aspect-[4/3]", className)}>
      {status !== "ready" && <div className={cn("absolute inset-0", status === "loading" ? "skeleton rounded-none" : "gradient-hero")} />}
      {src && status !== "error" && (
        <img
          src={src}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-500", status === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={path} style={{ fill: "hsl(var(--primary) / 0.18)", stroke: "hsl(var(--primary))" }} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={toX(cLon)} cy={toY(cLat)} r={4} style={{ fill: "hsl(var(--primary))", stroke: "hsl(var(--background))" }} strokeWidth={1.5} />
      </svg>
      <span className="absolute bottom-1.5 right-1.5 rounded bg-background/70 px-1.5 py-0.5 text-[9px] text-foreground/80 backdrop-blur">NASA Blue Marble</span>
    </div>
  );
}
