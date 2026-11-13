import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { PlaceResult } from "@/lib/geo/geocode";
import { layerMatchScore, MAP_LAYERS, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";
import { analysisHrefForPlace } from "@/lib/links";
import { paramsWithPlace } from "@/lib/trends/query";

export type SearchItem = { type: "place"; place: PlaceResult } | { type: "layer"; layer: GibsLayer };

const MAP_PATHS = ["/map", "/split", "/sync"];

/**
 * Places (seas and named regions first, then OpenStreetMap) and NASA layers for one query — shared
 * by the top search bar and the Ctrl/⌘K window. When the words name a layer ("NDVI", "snow
 * cover"), the layers come first: OpenStreetMap only finds lookalike place names for them.
 */
export function useUniversalSearch(query: string, enabled: boolean) {
  const { view } = useWorkspace();
  const places = usePlaceSearch(query, { near: view.center, enabled });
  const layers = useMemo(() => (query.trim().length >= 2 ? searchLayers(query, MAP_LAYERS).slice(0, 4) : []), [query]);
  const items = useMemo(() => orderSearchItems(places.results, layers, query), [places.results, layers, query]);
  return { ...places, layers, items };
}

/**
 * Places and layers in one list. When the words name a layer ("NDVI", "snow cover"), the layers come
 * first and shops or streets of that name are left out.
 */
export function orderSearchItems(places: PlaceResult[], layers: GibsLayer[], query: string): SearchItem[] {
  const layersFirst = layers.some((layer) => layerMatchScore(layer, query) === 0);
  const placeItems = places.filter((place) => !layersFirst || place.kind !== "poi").map((place) => ({ type: "place" as const, place }));
  const layerItems = layers.map((layer) => ({ type: "layer" as const, layer }));
  return layersFirst ? [...layerItems, ...placeItems] : [...placeItems, ...layerItems];
}

/**
 * Opening a place keeps you on the current map view, analyzes it on the Analysis page, or makes it
 * the place of the search on the Trends page; anywhere else it opens Explore.
 */
export function useOpenSearchItem() {
  const navigate = useNavigate();
  return useCallback(
    (item: SearchItem) => {
      if (item.type === "place" && window.location.pathname === "/analysis") {
        navigate(analysisHrefForPlace(item.place));
      } else if (item.type === "place" && window.location.pathname === "/trends") {
        navigate(`/trends?${paramsWithPlace(new URLSearchParams(window.location.search), item.place)}`);
      } else if (item.type === "place") {
        const path = MAP_PATHS.includes(window.location.pathname) ? window.location.pathname : "/map";
        navigate(`${path}${path === window.location.pathname ? window.location.search : ""}`, { state: { focusPlace: item.place } });
      } else {
        navigate(`/map?layer=${encodeURIComponent(item.layer.id)}`);
      }
    },
    [navigate],
  );
}
