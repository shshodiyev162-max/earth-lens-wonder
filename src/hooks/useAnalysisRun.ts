import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/async";
import { buildInsights, type InsightReport } from "@/lib/analysis/insights";
import { geometryKey, runAnalysis } from "@/lib/analysis/run";
import type { AnalysisPeriod, AnalysisProgress, AnalysisResult, AnalysisTarget, DatasetId } from "@/lib/analysis/types";

export interface AnalysisRunState {
  status: "idle" | "running" | "done" | "error";
  result: AnalysisResult | null;
  report: InsightReport | null;
  progress: AnalysisProgress | null;
  error: string | null;
  /** While running: the result shown is from this run so far, not the one before it. */
  current: boolean;
  rerun: () => void;
}

export interface AnalysisWindow {
  start: string;
  end: string;
  /** Months to read (YYYY-MM); every month from start to end when missing. */
  months?: string[];
  period?: AnalysisPeriod;
}

/**
 * Runs the analysis whenever the target, period or datasets change. With `enabled` false (a very
 * large request waiting for a click, or a period that can't be analysed) nothing is fetched.
 */
export function useAnalysisRun(target: AnalysisTarget | null, window: AnalysisWindow, datasets: DatasetId[], enabled = true): AnalysisRunState {
  const [status, setStatus] = useState<AnalysisRunState["status"]>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(false);
  const [nonce, setNonce] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const { start, end } = window;
  const datasetKey = datasets.join(",");
  const targetKey = target ? geometryKey(target.geometry) : null;
  const monthsKey = window.months ? window.months.join(",") : "";
  const periodKey = window.period ? JSON.stringify(window.period) : "";
  const latest = useRef({ target, window });
  latest.current = { target, window };

  useEffect(() => {
    const { target: current, window: chosen } = latest.current;
    if (!current || !datasetKey || start > end || !enabled || (chosen.months && !chosen.months.length)) {
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
    setCurrent(false);
    setError(null);
    setProgress({ done: 0, total: 1, label: "Starting" });
    const timer = globalThis.setTimeout(() => {
      runAnalysis(
        { target: current, start, end, months: chosen.months, period: chosen.period, datasets: datasetKey.split(",") as DatasetId[] },
        {
          signal: ac.signal,
          onProgress: (p) => !ac.signal.aborted && setProgress(p),
          // Finished datasets show straight away; the report fills in as the rest arrive.
          onPartial: (partial) => {
            if (ac.signal.aborted) return;
            setResult(partial);
            setCurrent(true);
          },
        },
      )
        .then((next) => {
          if (ac.signal.aborted) return;
          setResult(next);
          setCurrent(true);
          setStatus("done");
        })
        .catch((err) => {
          if (isAbortError(err) || ac.signal.aborted) return;
          setError(err instanceof Error ? err.message : "The analysis failed");
          setStatus("error");
        });
    }, 350);
    return () => {
      globalThis.clearTimeout(timer);
      ac.abort();
    };
  }, [targetKey, start, end, monthsKey, periodKey, datasetKey, enabled, nonce]);

  // Re-label with the current name (e.g. once a dropped pin has been reverse-geocoded).
  const displayName = target?.name;
  const report = useMemo(() => (result ? buildInsights(displayName ? { ...result, target: { ...result.target, name: displayName } } : result) : null), [result, displayName]);
  const rerun = useCallback(() => setNonce((n) => n + 1), []);

  return { status, result, report, progress, error, current, rerun };
}
