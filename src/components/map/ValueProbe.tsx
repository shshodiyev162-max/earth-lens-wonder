import { useEffect, useRef, useState } from "react";
import { Popup, useMapEvents } from "react-leaflet";
import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { isAbortError } from "@/lib/async";
import { isScienceLayer, type GibsLayer } from "@/lib/gibs/catalog";
import { probePoint } from "@/lib/gibs/sample";
import { formatDate } from "@/lib/gibs/time";
import { formatLatLng, type LatLng } from "@/lib/geo/geometry";
import { analysisHrefForPoint } from "@/lib/links";
import { formatValue } from "@/lib/format";

interface ProbeState {
  point: LatLng;
  status: "loading" | "done" | "error";
  values: { layer: GibsLayer; value: number | null }[];
}

/**
 * Click anywhere on the map to read the real value of the visible science
 * layer(s) at that spot (decoded from NASA's colormap) and jump to Analysis.
 */
export default function ValueProbe({ layers, date, disabled }: { layers: { layer: GibsLayer; date: string | null }[]; date?: string | null; disabled?: boolean }) {
  const [probe, setProbe] = useState<ProbeState | null>(null);
  const controller = useRef<AbortController | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  useEffect(() => () => controller.current?.abort(), []);

  useMapEvents({
    click(event) {
      if (disabled) return;
      const target = event.originalEvent?.target as HTMLElement | undefined;
      if (target?.closest(".leaflet-interactive")) return; // clicks on drawn areas select them
      controller.current?.abort();
      const point: LatLng = [event.latlng.lat, ((event.latlng.lng + 540) % 360) - 180];
      const science = layersRef.current.filter((item) => isScienceLayer(item.layer));
      if (!science.length) {
        setProbe({ point, status: "done", values: [] });
        return;
      }
      const ac = new AbortController();
      controller.current = ac;
      setProbe({ point, status: "loading", values: [] });
      Promise.all(science.map(async (item) => ({ layer: item.layer, value: await probePoint({ layer: item.layer, point, date: item.date, signal: ac.signal }) })))
        .then((values) => setProbe((current) => (current && current.point === point ? { point, status: "done", values } : current)))
        .catch((error) => {
          if (isAbortError(error)) return;
          setProbe((current) => (current && current.point === point ? { point, status: "error", values: [] } : current));
        });
    },
  });

  if (!probe) return null;

  return (
    <Popup position={probe.point} eventHandlers={{ remove: () => setProbe(null) }} className="probe-popup" maxWidth={280} minWidth={210}>
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-panel-muted">{formatLatLng(probe.point)}</div>
        {probe.status === "loading" && (
          <div role="status" aria-label="Reading NASA data" className="space-y-2 py-0.5">
            <div className="skeleton h-2.5 w-24" />
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-2.5 w-16" />
          </div>
        )}
        {probe.status === "error" && <div className="text-sm text-tone-warn">Couldn't reach NASA GIBS for this point.</div>}
        {probe.status === "done" &&
          probe.values.map(({ layer, value }) => {
            const layerDate = layers.find((item) => item.layer.id === layer.id)?.date ?? date ?? null;
            return (
              <div key={layer.id}>
                <div className="text-[11px] uppercase tracking-wide text-panel-muted">{layer.name}</div>
                {value === null ? (
                  <div className="text-sm text-panel-soft">No measurement here{layer.period === "daily" ? " (cloud, night or outside the satellite swath)" : ""}.</div>
                ) : (
                  <div className="text-lg font-semibold text-panel-foreground">{formatValue(value, layer.unit, layer.decimals)}</div>
                )}
                {layerDate && <div className="text-[11px] text-panel-muted">{formatDate(layerDate)}</div>}
              </div>
            );
          })}
        <Link
          to={analysisHrefForPoint(probe.point, 10)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-cyan-400/15 px-2.5 py-1.5 text-xs font-semibold text-accent-cyan-soft transition hover:bg-cyan-400/25"
        >
          <TrendingUp className="h-3.5 w-3.5" /> Analyze 10 km around here
        </Link>
      </div>
    </Popup>
  );
}
