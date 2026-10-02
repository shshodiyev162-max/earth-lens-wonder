import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import { isAbortError } from "@/lib/async";
import { nominatimSearch, searchPlaces, type PlaceResult } from "@/lib/geo/geocode";
import type { LatLng } from "@/lib/geo/geometry";

export interface PlaceSearchState {
  results: PlaceResult[];
  loading: boolean;
  error: string | null;
  /** The query the current results belong to. */
  resultsFor: string;
  /** Full-text search (Nominatim) for an explicit Enter press. */
  searchNow: (query: string) => Promise<PlaceResult[]>;
}

export function usePlaceSearch(query: string, options: { near?: LatLng; enabled?: boolean } = {}): PlaceSearchState {
  const enabled = options.enabled ?? true;
  const debounced = useDebouncedValue(query.trim(), 280);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nearRef = useRef(options.near);
  nearRef.current = options.near;

  useEffect(() => {
    if (!enabled || debounced.length < 2) {
      setResults([]);
      setResultsFor(debounced);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchPlaces(debounced, { signal: controller.signal, near: nearRef.current })
      .then((found) => {
        setResults(found);
        setResultsFor(debounced);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setResults([]);
        setResultsFor(debounced);
        setError("Search is unavailable right now. Check your connection and try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, enabled]);

  const searchNow = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return [];
    setLoading(true);
    setError(null);
    try {
      const found = await searchPlaces(trimmed, { near: nearRef.current });
      const merged = found.length ? found : await nominatimSearch(trimmed);
      setResults(merged);
      setResultsFor(trimmed);
      return merged;
    } catch {
      setError("Search is unavailable right now. Check your connection and try again.");
      return [];
    } finally {
      setLoading(false);
    }
  };

  return { results, loading: loading || (enabled && query.trim() !== debounced && query.trim().length >= 2), error, resultsFor, searchNow };
}
