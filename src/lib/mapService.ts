import type { MapLayer } from "./map-layers";
import { MAP_LAYERS, getTileUrl, formatDateForGIBS } from "./map-layers";

export type MapViewState = {
  center: [number, number];
  zoom: number;
};

export type MapInitOptions = {
  initialLayerId?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  date?: string;
};

export type MapEngineConfig = {
  layer: MapLayer;
  tileUrl: string;
  view: MapViewState;
  date: string;
};

const DEFAULT_VIEW: MapViewState = {
  center: [20, 0],
  zoom: 3,
};

export function getLayerById(id: string | undefined): MapLayer {
  return MAP_LAYERS.find((l) => l.id === id) ?? MAP_LAYERS[0];
}

export function getDefaultView(): MapViewState {
  return DEFAULT_VIEW;
}

export function clampZoomForLayer(layer: MapLayer, zoom: number): number {
  if (zoom > layer.maxZoom) return layer.maxZoom;
  if (zoom < 1) return 1;
  return zoom;
}

export function getInitialDate(date?: string): string {
  if (date) return date;
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return formatDateForGIBS(d);
}

export function createMapEngineConfig(options: MapInitOptions = {}): MapEngineConfig {
  const layer = getLayerById(options.initialLayerId);
  const date = getInitialDate(options.date);
  const view: MapViewState = {
    center: options.initialCenter ?? DEFAULT_VIEW.center,
    zoom: clampZoomForLayer(layer, options.initialZoom ?? DEFAULT_VIEW.zoom),
  };

  return {
    layer,
    tileUrl: getTileUrl(layer, date),
    view,
    date,
  };
}

