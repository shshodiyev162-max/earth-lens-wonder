import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { bboxPolygon, circlePolygon, closeRing, type PolygonGeometry, type Position } from "@/lib/geo/geometry";
import type { AreaKind } from "@/context/WorkspaceContext";

export type DrawMode = "rectangle" | "polygon" | "circle";

interface DrawToolsProps {
  mode: DrawMode | null;
  onComplete: (geometry: PolygonGeometry, kind: AreaKind) => void;
  onCancel: () => void;
  /** Increment to finish the polygon being drawn. */
  finishSignal?: number;
  /** Increment to remove the last polygon vertex. */
  undoSignal?: number;
  onVertexCount?: (count: number) => void;
}

/**
 * The pointer-up that completes a shape is followed by a click (and, for a
 * double-click, a dblclick). By then drawing mode is already off, so without
 * this the map would treat it as an ordinary click — opening a value popup or
 * picking a point — or zoom in. Swallow those events for a moment.
 */
function swallowTrailingClicks() {
  const handler = (event: MouseEvent) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
  };
  window.addEventListener("click", handler, true);
  window.addEventListener("dblclick", handler, true);
  window.setTimeout(() => {
    window.removeEventListener("click", handler, true);
    window.removeEventListener("dblclick", handler, true);
  }, 450);
}

const SHAPE_STYLE: L.PathOptions = {
  color: "#22d3ee",
  weight: 2,
  fillColor: "#22d3ee",
  fillOpacity: 0.14,
  dashArray: "6 5",
  interactive: false,
};

/**
 * Lightweight drawing for rectangles (drag), circles (drag from centre) and
 * polygons (click vertices; double-click, Enter or click the first point to
 * finish; Backspace removes a point; Esc cancels). Works with mouse and touch.
 */
export default function DrawTools({ mode, onComplete, onCancel, finishSignal = 0, undoSignal = 0, onVertexCount }: DrawToolsProps) {
  const map = useMap();
  const callbacks = useRef({ onComplete, onCancel, onVertexCount });
  callbacks.current = { onComplete, onCancel, onVertexCount };
  const polygonApi = useRef<{ finish: () => void; undo: () => void } | null>(null);

  useEffect(() => {
    if (!mode) return;
    const container = map.getContainer();
    container.classList.add("map-drawing");
    const dragging = map.dragging.enabled();
    const doubleClick = map.doubleClickZoom.enabled();
    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.boxZoom.disable();

    const group = L.layerGroup().addTo(map);
    let dragStart: L.LatLng | null = null;
    let shape: L.Rectangle | L.Circle | null = null;
    const vertices: L.LatLng[] = [];
    let outline: L.Polyline | null = null;
    let guide: L.Polyline | null = null;
    let firstMarker: L.CircleMarker | null = null;
    let pressPoint: { x: number; y: number } | null = null;
    let lastTap: { time: number; x: number; y: number } | null = null;

    const toLatLng = (event: PointerEvent | MouseEvent) => map.mouseEventToLatLng(event as MouseEvent).wrap();
    const isUi = (event: Event) => Boolean((event.target as HTMLElement | null)?.closest(".leaflet-control, .map-ui"));
    const report = () => callbacks.current.onVertexCount?.(vertices.length);

    const resetPolygon = () => {
      vertices.length = 0;
      group.clearLayers();
      outline = null;
      guide = null;
      firstMarker = null;
      report();
    };

    const finishPolygon = (): boolean => {
      // Drop consecutive duplicates (double-click adds the same point twice).
      const unique = vertices.filter((p, i) => i === 0 || !p.equals(vertices[i - 1], 1e-9));
      if (unique.length < 3) return false;
      const ring: Position[] = closeRing(unique.map((p) => [p.lng, p.lat] as Position));
      resetPolygon();
      callbacks.current.onComplete({ type: "Polygon", coordinates: [ring] }, "polygon");
      return true;
    };

    const undo = () => {
      vertices.pop();
      if (!vertices.length) {
        resetPolygon();
        return;
      }
      outline?.setLatLngs(vertices);
      report();
    };
    polygonApi.current = { finish: () => void finishPolygon(), undo };

    const addVertex = (point: L.LatLng) => {
      if (vertices.length >= 3 && firstMarker) {
        const first = map.latLngToContainerPoint(vertices[0]);
        const here = map.latLngToContainerPoint(point);
        if (first.distanceTo(here) < 12) {
          if (finishPolygon()) swallowTrailingClicks();
          return;
        }
      }
      vertices.push(point);
      if (!outline) outline = L.polyline(vertices, { ...SHAPE_STYLE, dashArray: undefined }).addTo(group);
      else outline.setLatLngs(vertices);
      if (vertices.length === 1) {
        firstMarker = L.circleMarker(point, { radius: 6, color: "#22d3ee", weight: 2, fillColor: "#07111d", fillOpacity: 1, interactive: false }).addTo(group);
      } else {
        L.circleMarker(point, { radius: 3.5, color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 1, interactive: false }).addTo(group);
      }
      report();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || isUi(event)) return;
      pressPoint = { x: event.clientX, y: event.clientY };
      if (mode === "polygon") return;
      dragStart = toLatLng(event);
      container.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      const point = toLatLng(event);
      if (mode === "rectangle" && dragStart) {
        const bounds = L.latLngBounds(dragStart, point);
        if (!shape) shape = L.rectangle(bounds, SHAPE_STYLE).addTo(group);
        else (shape as L.Rectangle).setBounds(bounds);
      } else if (mode === "circle" && dragStart) {
        const radius = dragStart.distanceTo(point);
        if (!shape) shape = L.circle(dragStart, { ...SHAPE_STYLE, radius }).addTo(group);
        else (shape as L.Circle).setRadius(radius);
      } else if (mode === "polygon" && vertices.length) {
        const last = vertices[vertices.length - 1];
        if (!guide) guide = L.polyline([last, point], { ...SHAPE_STYLE, weight: 1.5, opacity: 0.8 }).addTo(group);
        else guide.setLatLngs([last, point]);
      }
    };

    const onUp = (event: PointerEvent) => {
      if (isUi(event)) return;
      const moved = pressPoint ? Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) : 0;
      pressPoint = null;
      if (mode === "polygon") {
        if (moved > 6 || event.button !== 0) return;
        // A double-click / double-tap finishes — but only on the same spot, so
        // quickly clicking several vertices never ends the shape early.
        const tap = { time: Date.now(), x: event.clientX, y: event.clientY };
        const isDoubleTap = Boolean(lastTap && tap.time - lastTap.time < 350 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 10);
        lastTap = isDoubleTap ? null : tap;
        if (isDoubleTap && vertices.length >= 3) {
          if (finishPolygon()) swallowTrailingClicks();
          return;
        }
        if (isDoubleTap) return; // second tap of a double-click on a vertex that already exists
        addVertex(toLatLng(event));
        return;
      }
      if (!dragStart) return;
      const end = toLatLng(event);
      const start = dragStart;
      dragStart = null;
      container.releasePointerCapture?.(event.pointerId);
      group.clearLayers();
      shape = null;
      const a = map.latLngToContainerPoint(start);
      const b = map.latLngToContainerPoint(end);
      if (a.distanceTo(b) < 8) return; // a click, not a drag
      swallowTrailingClicks();
      if (mode === "rectangle") {
        const bounds = L.latLngBounds(start, end);
        callbacks.current.onComplete(bboxPolygon([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]), "rectangle");
      } else {
        callbacks.current.onComplete(circlePolygon([start.lat, start.lng], start.distanceTo(end) / 1000), "circle");
      }
    };

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "Escape") {
        resetPolygon();
        callbacks.current.onCancel();
      } else if (event.key === "Enter" && mode === "polygon") {
        finishPolygon();
      } else if ((event.key === "Backspace" || event.key === "Delete") && mode === "polygon" && vertices.length) {
        event.preventDefault();
        undo();
      }
    };

    container.addEventListener("pointerdown", onDown);
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    report();

    return () => {
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      group.remove();
      container.classList.remove("map-drawing");
      if (dragging) map.dragging.enable();
      if (doubleClick) map.doubleClickZoom.enable();
      map.boxZoom.enable();
      polygonApi.current = null;
      callbacks.current.onVertexCount?.(0);
    };
  }, [map, mode]);

  useEffect(() => {
    if (finishSignal) polygonApi.current?.finish();
  }, [finishSignal]);

  useEffect(() => {
    if (undoSignal) polygonApi.current?.undo();
  }, [undoSignal]);

  return null;
}
