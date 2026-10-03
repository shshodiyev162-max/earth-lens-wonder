import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/async";
import { buildInsights, type InsightReport } from "@/lib/analysis/insights";
import { geometryKey, runAnalysis } from "@/lib/analysis/run";
import type { AnalysisProgress, AnalysisResult, AnalysisTarget, DatasetId } from "@/lib/analysis/types";

export interface AnalysisRunState {
  status: "idle" | "running" | "done" | "error";
  result: AnalysisResult | null;
  report: InsightReport | null;
  progress: AnalysisProgress | null;
  error: string | null;
  rerun: () => void;
}

/** Runs the analysis whenever the target, period or datasets change. */
export function useAnalysisRun(target: AnalysisTarget | null, start: string, end: string, datasets: DatasetId[]): AnalysisRunState {
  const [status, setStatus] = useState<AnalysisRunState["status"]>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const datasetKey = datasets.join(",");
  const targetKey = target ? geometryKey(target.geometry) : null;
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const current = targetRef.current;
    if (!current || !datasetKey || start > end) {
      controller.current?.abort();
      setStatus("idle");
      setResult(null);
      setProgress(null);
      return;
    }
    const ac = new AbortController();
    controller.current?.abort();
    controller.current = ac;
    setStatus("running");
    setError(null);
    setProgress({ done: 0, total: 1, label: "Starting" });
    const timer = window.setTimeout(() => {
      runAnalysis(
        { target: current, start, end, datasets: datasetKey.split(",") as DatasetId[] },
        { signal: ac.signal, onProgress: (p) => !ac.signal.aborted && setProgress(p) },
      )
        .then((next) => {
          if (ac.signal.aborted) return;
          setResult(next);
          setStatus("done");
        })
        .catch((err) => {
          if (isAbortError(err) || ac.signal.aborted) return;
          setError(err instanceof Error ? err.message : "The analysis failed");
          setStatus("error");
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [targetKey, start, end, datasetKey, nonce]);

  // Re-label with the current name (e.g. once a dropped pin has been reverse-geocoded).
  const displayName = target?.name;
  const report = useMemo(() => (result ? buildInsights(displayName ? { ...result, target: { ...result.target, name: displayName } } : result) : null), [result, displayName]);
  const rerun = useCallback(() => setNonce((n) => n + 1), []);

  return { status, result, report, progress, error, rerun };
}
