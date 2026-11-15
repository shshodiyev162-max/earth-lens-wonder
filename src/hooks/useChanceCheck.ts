import { useEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/async";
import { INDICATORS } from "@/lib/query/indicators";
import { CHANCE_RUNS, chanceCheck, shuffledTrends, type ChanceCheck, type ShuffledTrends } from "@/lib/trends/chance";
import type { HotspotFilter } from "@/lib/trends/hotspots";
import type { ScanResult } from "@/lib/trends/scan";

export type ChanceState =
  /** Nothing to check: no result, or two periods compared without a yearly trend test. */
  | { status: "none" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; check: ChanceCheck }
  | { status: "error" };

/** Finished shuffles, kept for the visit: going back to a measure doesn't check it again. */
const finished = new WeakMap<ScanResult, ShuffledTrends[]>();

/**
 * The chance check for a scan's patches (lib/trends/chance): the years shuffled and every pixel
 * tested again, in the background once the results are shown, from the maps already read. A new
 * filter only regroups the shuffled pixels, so it answers at once.
 */
export function useChanceCheck(result: ScanResult | null, filter: HotspotFilter | null): ChanceState {
  const checkable = result && result.plan.kind === "trend" && result.plan.years.length >= 4 ? result : null;
  const [state, setState] = useState<{ result: ScanResult | null; shuffled: ShuffledTrends[] | null; done: number; total: number; error: boolean }>({
    result: null,
    shuffled: null,
    done: 0,
    total: 0,
    error: false,
  });

  useEffect(() => {
    if (!checkable) return;
    const known = finished.get(checkable);
    if (known) {
      setState({ result: checkable, shuffled: known, done: known.length, total: known.length, error: false });
      return;
    }
    const controller = new AbortController();
    setState({ result: checkable, shuffled: null, done: 0, total: 0, error: false });
    shuffledTrends(checkable, {
      signal: controller.signal,
      onProgress: (done, total) => setState((previous) => (previous.result === checkable ? { ...previous, done, total } : previous)),
    })
      .then((shuffled) => {
        finished.set(checkable, shuffled);
        setState({ result: checkable, shuffled, done: shuffled.length, total: shuffled.length, error: false });
      })
      .catch((error) => {
        if (!isAbortError(error)) setState((previous) => (previous.result === checkable ? { ...previous, error: true } : previous));
      });
    return () => controller.abort();
  }, [checkable]);

  const shuffled = state.result === checkable ? state.shuffled : null;
  const { direction, minFactor, minAreaKm2, strict } = filter ?? { direction: "any", minFactor: 1, minAreaKm2: 0, strict: true };
  const check = useMemo(
    () => (checkable && shuffled ? chanceCheck(shuffled, checkable.grid, { direction, minFactor, minAreaKm2, strict }, INDICATORS[checkable.indicator].minChange, checkable.coarse) : null),
    [checkable, shuffled, direction, minFactor, minAreaKm2, strict],
  );

  if (!checkable || !filter) return { status: "none" };
  if (check) return { status: "done", check };
  if (state.result === checkable && state.error) return { status: "error" };
  return { status: "running", done: state.result === checkable ? state.done : 0, total: state.result === checkable && state.total ? state.total : CHANCE_RUNS };
}
