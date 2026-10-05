import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/async";
import { findCountry, loadCountries } from "@/lib/geo/countries";
import { lookupOsm } from "@/lib/geo/geocode";
import { bboxOf, centroidOf, type BBox } from "@/lib/geo/geometry";
import { decodeGeometry } from "@/lib/geo/polyline";
import { INDICATORS, seasonMonths } from "@/lib/query/indicators";
import { planPeriod, type PeriodPlan } from "@/lib/query/period";
import { AreaError, resolveArea, type ScanArea } from "@/lib/trends/place";
import type { TrendQuery } from "@/lib/trends/query";
import { fetchAvailability, nameHotspots, runScan, ScanError, type DataAvailability, type ScanProgress, type ScanResult } from "@/lib/trends/scan";

export interface TrendScanState {
  status: "idle" | "preparing" | "scanning" | "done" | "error";
  area: ScanArea | null;
  plan: PeriodPlan | null;
  months: number[];
  availability: DataAvailability | null;
  progress: ScanProgress | null;
  result: ScanResult | null;
  /** Hotspot names, filled in as the place-name service answers. */
  labels: Record<string, string>;
  error: string | null;
  cancel: () => void;
  retry: () => void;
}

async function areaFor(query: TrendQuery, view: BBox | null, signal: AbortSignal): Promise<ScanArea> {
  const given = query.area;
  if (given?.poly) {
    const geometry = decodeGeometry(given.poly);
    if (!geometry) throw new AreaError("That shared area link is damaged.");
    return { name: given.name ?? "Selected area", geometry, bbox: bboxOf(geometry), center: centroidOf(geometry), kind: "place" };
  }
  if (given?.country) {
    const index = await loadCountries();
    const country = index ? findCountry(index, given.country) : null;
    if (!country) throw new AreaError("That country isn't in TerraVision's map.");
    return { name: country.name, context: "Country", geometry: country.geometry, bbox: country.bbox, center: centroidOf(country.geometry), kind: "country" };
  }
  if (given?.osm) {
    const details = await lookupOsm(given.osm, { signal });
    if (!details?.geometry) throw new AreaError("That place's boundary couldn't be loaded from OpenStreetMap.");
    return { name: given.name ?? details.place.name, context: details.place.context, geometry: details.geometry, bbox: bboxOf(details.geometry), center: details.place.center, kind: "place" };
  }
  return resolveArea(query.place, { near: query.near, view: view ?? undefined, signal });
}

function friendly(error: unknown): string {
  if (error instanceof AreaError || error instanceof ScanError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (/took too long/i.test(message)) return "A NASA service took too long to answer. Please try again in a moment.";
  return "Something went wrong while reading NASA data. Check your connection and try again.";
}

/** Runs a hotspot scan for the question whenever it (or the scanned map view) changes. */
export function useTrendScan(query: TrendQuery | null, view: BBox | null): TrendScanState {
  const [status, setStatus] = useState<TrendScanState["status"]>("idle");
  const [area, setArea] = useState<ScanArea | null>(null);
  const [plan, setPlan] = useState<PeriodPlan | null>(null);
  const [months, setMonths] = useState<number[]>([]);
  const [availability, setAvailability] = useState<DataAvailability | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const needsView = Boolean(query && !query.place && !query.area);
  const key = useMemo(() => (query && query.understood ? JSON.stringify({ ...query, text: undefined, view: needsView ? view : null }) : null), [query, view, needsView]);

  useEffect(() => {
    controller.current?.abort();
    if (!key || !query || (needsView && !view)) {
      setStatus("idle");
      return;
    }
    const ac = new AbortController();
    controller.current = ac;
    setStatus("preparing");
    setError(null);
    setResult(null);
    setLabels({});
    setProgress(null);
    const info = INDICATORS[query.indicator];

    (async () => {
      const [available, scanArea] = await Promise.all([fetchAvailability(query.indicator), areaFor(query, view, ac.signal)]);
      if (ac.signal.aborted) return;
      const chosenMonths = query.months ?? seasonMonths(query.season ?? info.season, scanArea.center[0]);
      setAvailability(available);
      setArea(scanArea);
      setMonths(chosenMonths);
      const planned = planPeriod(query.time, chosenMonths, available.window);
      if ("error" in planned) throw new ScanError(planned.error);
      setPlan(planned);
      setStatus("scanning");
      const scanned = await runScan({
        indicator: query.indicator,
        direction: query.direction,
        area: scanArea,
        plan: planned,
        availability: available,
        signal: ac.signal,
        onProgress: (p) => !ac.signal.aborted && setProgress(p),
      });
      if (ac.signal.aborted) return;
      setResult(scanned);
      setStatus("done");
      await nameHotspots(scanned.hotspots, (id, label) => !ac.signal.aborted && setLabels((current) => ({ ...current, [id]: label })), ac.signal);
    })().catch((err) => {
      if (isAbortError(err) || ac.signal.aborted) return;
      setError(friendly(err));
      setStatus("error");
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setStatus((current) => (current === "preparing" || current === "scanning" ? "idle" : current));
    setProgress(null);
  }, []);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return { status, area, plan, months, availability, progress, result, labels, error, cancel, retry };
}
