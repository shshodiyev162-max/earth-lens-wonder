import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { PlaceResult } from "@/lib/geo/geocode";
import { MAP_LAYERS, searchLayers, type GibsLayer } from "@/lib/gibs/catalog";
import { analysisHrefForPlace } from "@/lib/links";
import { parseTrendQuery, type ParsedQuery } from "@/lib/query/parse";
import { paramsForText } from "@/lib/trends/query";

export type SearchItem = { type: "trend"; parsed: ParsedQuery } | { type: "place"; place: PlaceResult } | { type: "layer"; layer: GibsLayer };

const MAP_PATHS = ["/map", "/split", "/sync"];

/**
 * Places (OpenStreetMap), NASA layers and trend questions for one query — shared by the top search
 * bar and the Ctrl/⌘K window. A question ("where did vegetation decline in Uzbekistan since 2015")
 * becomes one result that opens the Trends page; places aren't looked up for whole sentences.
 */
export function useUniversalSearch(query: string, enabled: boolean) {
  const { view } = useWorkspace();
  const question = useMemo(() => {
    const parsed = parseTrendQuery(query);
    return parsed.isTrendQuery ? parsed : null;
  }, [query]);
  const places = usePlaceSearch(query, { near: view.center, enabled: enabled && !question });
  const layers = useMemo(() => (query.trim().length >= 2 && !question ? searchLayers(query, MAP_LAYERS).slice(0, 4) : []), [query, question]);
  const items: SearchItem[] = useMemo(
    () => [
      ...(question ? [{ type: "trend" as const, parsed: question }] : []),
      ...places.results.map((place) => ({ type: "place" as const, place })),
      ...layers.map((layer) => ({ type: "layer" as const, layer })),
    ],
    [question, places.results, layers],
  );
  return { ...places, layers, items, question };
}

/** Opening a place keeps you on the current map view (or analyzes it on the Analysis page); anywhere else it opens Explore. */
export function useOpenSearchItem() {
  const navigate = useNavigate();
  return useCallback(
    (item: SearchItem) => {
      if (item.type === "trend") {
        navigate(`/trends?${paramsForText(item.parsed.text)}`);
      } else if (item.type === "place" && window.location.pathname === "/analysis") {
        navigate(analysisHrefForPlace(item.place));
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
