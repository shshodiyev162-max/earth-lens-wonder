import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { PlaceResult } from "@/lib/geo/geocode";
import { MAP_LAYERS, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";

export type SearchItem = { type: "place"; place: PlaceResult } | { type: "layer"; layer: GibsLayer };

const MAP_PATHS = ["/map", "/split", "/sync"];

/** Places (OpenStreetMap) and NASA layers for one query — shared by the top search bar and the Ctrl/⌘K window. */
export function useUniversalSearch(query: string, enabled: boolean) {
  const { view } = useWorkspace();
  const places = usePlaceSearch(query, { near: view.center, enabled });
  const layers = useMemo(() => (query.trim().length >= 2 ? searchLayers(query, MAP_LAYERS).slice(0, 4) : []), [query]);
  const items: SearchItem[] = useMemo(
    () => [...places.results.map((place) => ({ type: "place" as const, place })), ...layers.map((layer) => ({ type: "layer" as const, layer }))],
    [places.results, layers],
  );
  return { ...places, layers, items };
}

/** Opening a place keeps you on the current map view; anywhere else it opens Explore. */
export function useOpenSearchItem() {
  const navigate = useNavigate();
  return useCallback(
    (item: SearchItem) => {
      if (item.type === "place") {
        const path = MAP_PATHS.includes(window.location.pathname) ? window.location.pathname : "/map";
        navigate(`${path}${path === window.location.pathname ? window.location.search : ""}`, { state: { focusPlace: item.place } });
      } else {
        navigate(`/map?layer=${encodeURIComponent(item.layer.id)}`);
      }
    },
    [navigate],
  );
}
