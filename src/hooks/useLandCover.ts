import { useEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/async";
import { bboxOf, type PolygonGeometry } from "@/lib/geo/geometry";
import { fetchLandCover, type LandCover } from "@/lib/trends/landcover";

export interface LandCoverState {
  status: "idle" | "loading" | "done" | "error";
  /** The latest year NASA has published. */
  cover: LandCover | null;
}

/**
 * NASA land cover for an area in the latest year, read once per outline and kept on this device.
 * Only one year: NASA asks users not to measure change by comparing the map's years, because a single
 * year's labels are too uncertain to tell real change from mix-ups between similar-looking land.
 */
export function useLandCover(geometry: PolygonGeometry | null): LandCoverState {
  const key = useMemo(() => (geometry ? JSON.stringify(bboxOf(geometry)) + String(JSON.stringify(geometry).length) : null), [geometry]);
  const [state, setState] = useState<LandCoverState>({ status: "idle", cover: null });

  useEffect(() => {
    if (!geometry || !key) {
      setState({ status: "idle", cover: null });
      return;
    }
    const ac = new AbortController();
    setState({ status: "loading", cover: null });
    fetchLandCover(geometry, bboxOf(geometry), { signal: ac.signal })
      .then((cover) => {
        if (!ac.signal.aborted) setState({ status: "done", cover });
      })
      .catch((error) => {
        if (isAbortError(error) || ac.signal.aborted) return;
        setState({ status: "error", cover: null });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
