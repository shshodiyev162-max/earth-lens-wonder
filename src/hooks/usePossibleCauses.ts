import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "@/lib/async";
import { causeKey, findCauses, type CauseLoaders, type CauseRequest } from "@/lib/causes/gather";
import type { CauseReport } from "@/lib/causes/rules";

export type CausesState = { status: "idle" } | { status: "running" } | { status: "done"; report: CauseReport } | { status: "error"; message: string };

/** Finished reports for this visit, so a card opened again (or the phone and desktop copies of a card) shows them at once. */
const finished = new Map<string, CauseReport>();

/** Forget finished reports (tests). */
export function clearFinishedCauses(): void {
  finished.clear();
}

/**
 * The possible causes for a request, looked for only when asked (each look reads more NASA data).
 * A new request starts over; leaving cancels a look in progress.
 */
export function usePossibleCauses(request: CauseRequest | null, loaders?: CauseLoaders): { state: CausesState; look: () => void } {
  const key = request ? causeKey(request) : null;
  const [state, setState] = useState<{ key: string | null; value: CausesState }>({ key, value: { status: "idle" } });
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(request);
  latest.current = request;

  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [key],
  );

  const look = useCallback(() => {
    const current = latest.current;
    if (!current) return;
    const lookKey = causeKey(current);
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setState({ key: lookKey, value: { status: "running" } });
    findCauses(current, { signal: ac.signal, loaders })
      .then(({ report }) => {
        finished.set(lookKey, report);
        if (!ac.signal.aborted) setState({ key: lookKey, value: { status: "done", report } });
      })
      .catch((error) => {
        if (isAbortError(error) || ac.signal.aborted) return;
        setState({ key: lookKey, value: { status: "error", message: "NASA's services didn't answer. Try again in a moment." } });
      });
  }, [loaders]);

  if (!key) return { state: { status: "idle" }, look };
  // A look started here wins; otherwise an answer finished earlier (in this card or its twin) shows at once.
  if (state.key === key && state.value.status !== "idle") return { state: state.value, look };
  const done = finished.get(key);
  return { state: done ? { status: "done", report: done } : { status: "idle" }, look };
}
