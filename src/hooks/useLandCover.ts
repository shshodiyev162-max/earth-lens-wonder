import { useEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/async";
import { bboxOf, type PolygonGeometry } from "@/lib/geo/geometry";
import { FIRST_COVER_YEAR, fetchLandCover, type LandCover } from "@/lib/trends/landcover";

export interface LandCoverState {
  status: "idle" | "loading" | "done" | "error";
  /** The latest year NASA has published. */
  cover: LandCover | null;
  /** The first year of the record, for "since 2001" changes. */
  first: LandCover | null;
}

/** NASA land cover for an area (latest year and 2001), read once per outline and kept on this device. */
export function useLandCover(geometry: PolygonGeometry | null): LandCoverState {
  const key = useMemo(() => (geometry ? JSON.stringify(bboxOf(geometry)) + String(JSON.stringify(geometry).length) : null), [geometry]);
  const [state, setState] = useState<LandCoverState>({ status: "idle", cover: null, first: null });

  useEffect(() => {
    if (!geometry || !key) {
      setState({ status: "idle", cover: null, first: null });
      return;
    }
    const ac = new AbortController();
    setState({ status: "loading", cover: null, first: null });
    const bbox = bboxOf(geometry);
    fetchLandCover(geometry, bbox, { signal: ac.signal })
      .then(async (cover) => {
        if (ac.signal.aborted) return;
        setState({ status: "done", cover, first: null });
        // The first year is extra (for the change line): a failure just leaves it out.
        const first = cover.year > FIRST_COVER_YEAR ? await fetchLandCover(geometry, bbox, { year: FIRST_COVER_YEAR, signal: ac.signal }).catch(() => null) : null;
        if (!ac.signal.aborted && first) setState({ status: "done", cover, first });
      })
      .catch((error) => {
        if (isAbortError(error) || ac.signal.aborted) return;
        setState({ status: "error", cover: null, first: null });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
