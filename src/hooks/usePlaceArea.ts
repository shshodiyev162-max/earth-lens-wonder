import { useEffect, useState } from "react";
import { isAbortError } from "@/lib/async";
import { resolveArea, type ScanArea } from "@/lib/trends/place";
import { friendlyError } from "@/hooks/useTrendScans";

export interface PlaceAreaState {
  status: "idle" | "loading" | "done" | "error";
  area: ScanArea | null;
  /** Why the place couldn't be found, in plain words. */
  error: string | null;
}

const IDLE: PlaceAreaState = { status: "idle", area: null, error: null };

/**
 * The area a typed, listed or clicked place stands for, found before anything is scanned, so it can
 * be outlined on the map and its land cover read. Countries, regions and seas need no network; other
 * places are looked up once (the scan reuses the answer).
 */
export function usePlaceArea(place: string | null, near: boolean): PlaceAreaState {
  const [state, setState] = useState<PlaceAreaState>(IDLE);

  useEffect(() => {
    if (!place) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading", area: null, error: null });
    resolveArea(place, { near, signal: controller.signal })
      .then((area) => {
        if (!controller.signal.aborted) setState({ status: "done", area, error: null });
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setState({ status: "error", area: null, error: friendlyError(error) });
      });
    return () => controller.abort();
  }, [place, near]);

  return state;
}
