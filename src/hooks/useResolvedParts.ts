import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isAbortError } from "@/lib/async";
import { partKey, type AreaPart } from "@/lib/areas/parts";
import { PartError, resolvePart, type ResolvedPart } from "@/lib/areas/resolve";

export interface ResolvedPartsState {
  /** One entry per part, in order: null while loading or when it couldn't be read. */
  parts: (ResolvedPart | null)[];
  loading: boolean;
  /** Why parts couldn't be read, in plain words. */
  errors: string[];
}

const EMPTY: ResolvedPartsState = { parts: [], loading: false, errors: [] };

/** The outlines of the parts added to an area, loaded together (bundled ones need no network). */
export function useResolvedParts(parts: AreaPart[]): ResolvedPartsState {
  const { getArea } = useWorkspace();
  const key = parts.map(partKey).join("\n");
  // The parts themselves change identity on every render; their keys don't.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => parts, [key]);
  const [state, setState] = useState<{ key: string; value: ResolvedPartsState } | null>(null);

  useEffect(() => {
    if (!stable.length) return;
    const controller = new AbortController();
    Promise.allSettled(stable.map((part) => resolvePart(part, { signal: controller.signal, getArea }))).then((settled) => {
      if (controller.signal.aborted) return;
      if (settled.some((s) => s.status === "rejected" && isAbortError(s.reason))) return;
      setState({
        key,
        value: {
          parts: settled.map((s) => (s.status === "fulfilled" ? s.value : null)),
          loading: false,
          errors: settled.flatMap((s) => (s.status === "rejected" ? [s.reason instanceof PartError ? s.reason.message : "One of the places couldn't be loaded. Check your connection and try again."] : [])),
        },
      });
    });
    return () => controller.abort();
  }, [stable, key, getArea]);

  if (!parts.length) return EMPTY;
  if (state?.key !== key) return { parts: parts.map(() => null), loading: true, errors: [] };
  return state.value;
}
