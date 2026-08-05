import type { MapLayer } from "./map-layers";
import { estimateAreaMetrics } from "./areaEstimator";
import type { SelectedArea } from "@/context/RegionContext";

declare const window: Window & { L: any };

export function ensureLeafletDraw(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    const L = window.L;
    if (!L) return reject(new Error("Leaflet not loaded"));
    if (L.Control && L.Control.Draw) return resolve(L);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Failed to load leaflet.draw"));
    document.body.appendChild(script);
  });
}

export function setupDrawControl(opts: {
  map: any;
  L: any;
  featureGroup: any;
  layers: MapLayer[];
  getSelectedAreas: () => SelectedArea[];
  onAdd: (area: Omit<SelectedArea, "id" | "createdAt">) => void;
  onRemove: (id: string) => void;
}): Promise<void> | void {
  const { map, L, featureGroup, layers, getSelectedAreas, onAdd, onRemove } = opts;
  if (!map || !L) return;
  if (!L.Control || !L.Control.Draw) {
    return ensureLeafletDraw().then(() => {
      if (window.L && window.L.Control && window.L.Control.Draw) {
        attachDrawControl({ ...opts, L: window.L });
      }
    });
  }
  attachDrawControl(opts);
}

function attachDrawControl(opts: {
  map: any;
  L: any;
  featureGroup: any;
  layers: MapLayer[];
  getSelectedAreas: () => SelectedArea[];
  onAdd: (area: Omit<SelectedArea, "id" | "createdAt">) => void;
  onRemove: (id: string) => void;
}) {
  const { map, L, featureGroup, layers, getSelectedAreas, onAdd, onRemove } = opts;

  const shapeOptions = { color: "#00ffff", weight: 2, fillOpacity: 0.2 };

  const drawControl = new L.Control.Draw({
    position: "topright",
    draw: {
      polygon: { allowIntersection: false, shapeOptions },
      rectangle: { shapeOptions },
      circle: { shapeOptions: { ...shapeOptions, color: "#00ff00" } },
      // Polyline is excluded - it doesn't produce a closed, selectable area,
      // which only confused the toolbar by looking identical to the broken
      // first option and never finishing a region.
      marker: true,
    },
    edit: { featureGroup, remove: true },
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (e: any) => {
    const layer = e.layer;
    const bounds = layer.getBounds();
    const center = bounds.getCenter();
    const latDiff = bounds.getNorth() - bounds.getSouth();
    const lngDiff = bounds.getEast() - bounds.getWest();
    const approxArea = Math.abs(latDiff * lngDiff * 111 * 111);
    let coordinates: [number, number][] | [number, number];
    let type: "polygon" | "rectangle" | "circle" = "polygon";
    let radius: number | undefined;
    if (e.drawType === "circle") {
      coordinates = [center.lat, center.lng];
      radius = layer.getRadius();
      type = "circle";
    } else if (e.drawType === "rectangle") {
      coordinates = [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
      ];
      type = "rectangle";
    } else {
      const latlngs = layer.getLatLngs()[0];
      coordinates = (latlngs || []).map((ll: any) => [ll.lat, ll.lng]);
      type = "polygon";
    }
    const centerArr: [number, number] = [center.lat, center.lng];
    const metrics = estimateAreaMetrics(layers, centerArr);
    // Derive the label live from the current count so areas always get a
    // unique sequential number ("Area 1", "Area 2", ...) regardless of how
    // many times the drawing handler is attached or re-rendered.
    const nextIndex = Math.max(
      1,
      getSelectedAreas().filter((a) => /^Area /.test(a.name)).length + 1
    );
    const label = `Area ${nextIndex}`;
    onAdd({
      name: label,
      type,
      coordinates,
      radius,
      bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      center: centerArr,
      areaKm2: Math.round(approxArea),
      metrics,
    });
    bindAreaLabel(layer, L, label, approxArea, metrics);
  });

  map.on(L.Draw.Event.DELETED, (e: any) => {
    e.layers.eachLayer((layer: any) => {
      const bounds = layer.getBounds();
      const center = bounds.getCenter();
      const match = getSelectedAreas().find(
        (a) => a.center && Math.abs(a.center[0] - center.lat) < 0.01 && Math.abs(a.center[1] - center.lng) < 0.01,
      );
      if (match) onRemove(match.id);
    });
  });
}

function bindAreaLabel(layer: any, L: any, name: string, areaKm2: number, metrics: any) {
  if (!layer || !L) return;
  try {
    const lines = [`<b style="color:#22d3ee">${name}</b>`, `Area: ${Math.max(1, Math.round(areaKm2)).toLocaleString()} km²`];
    if (metrics) {
      metrics.forEach((m: any) => {
        if (m && m.label && m.value !== undefined) lines.push(`${m.label}: ${m.value}`);
      });
    }
    layer.bindTooltip(lines.join("<br/>"), { permanent: false, direction: "top", opacity: 0.95 });
  } catch {
    // tooltip binding is non-critical
  }
}

export function renderSelectedAreas(opts: {
  featureGroup: any;
  L: any;
  selectedAreas: SelectedArea[];
  activeAreaId: string | null;
  onActivate: (id: string | null) => void;
}) {
  const { featureGroup, L, selectedAreas, activeAreaId, onActivate } = opts;
  if (!featureGroup || !L) return;
  featureGroup.clearLayers();
  selectedAreas.forEach((area) => {
    const style = {
      color: activeAreaId === area.id ? "#00ff00" : "#00ffff",
      fillColor: activeAreaId === area.id ? "#00ff00" : "#00ffff",
      fillOpacity: 0.2,
      weight: 2,
    };
    let layer: any;
    if (area.type === "circle" && area.coordinates && area.radius) {
      layer = L.circle(area.coordinates as [number, number], { ...style, radius: area.radius });
    } else if (area.coordinates && Array.isArray(area.coordinates)) {
      layer = area.type === "rectangle"
        ? L.rectangle(area.coordinates as [number, number][], style)
        : L.polygon(area.coordinates as [number, number][], style);
    } else return;
    layer.on("click", () => onActivate(area.id));
    if (area.name) {
      try {
        const tip = area.name + (area.areaKm2 ? ` — ${area.areaKm2.toLocaleString()} km²` : "");
        layer.bindTooltip(tip, { permanent: false, direction: "top", opacity: 0.95 });
      } catch {
        // tooltip binding is non-critical
      }
    }
    featureGroup.addLayer(layer);
  });
}
