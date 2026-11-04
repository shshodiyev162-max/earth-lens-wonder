import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/async";
import { findCountry, loadCountries } from "@/lib/geo/countries";
import { lookupOsm } from "@/lib/geo/geocode";
import { bboxOf, centroidOf, type BBox } from "@/lib/geo/geometry";
import { decodeGeometry } from "@/lib/geo/polyline";
import { INDICATORS, seasonMonths, type IndicatorId } from "@/lib/query/indicators";
import { MAX_GRIDS, planPeriod, type PeriodPlan } from "@/lib/query/period";
import type { Hotspot } from "@/lib/trends/hotspots";
import { AreaError, resolveArea, type ScanArea } from "@/lib/trends/place";
import { filterFor, scanKey, type TrendQuery } from "@/lib/trends/query";
import { fetchAvailability, nameHotspots, runScan, ScanError, type DataAvailability, type ScanProgress, type ScanResult } from "@/lib/trends/scan";

export interface MeasureScan {
  indicator: IndicatorId;
  status: "waiting" | "scanning" | "done" | "error" | "stopped";
  plan: PeriodPlan | null;
  /** Calendar months compared each year. */
  months: number[];
  availability: DataAvailability | null;
  progress: ScanProgress | null;
  result: ScanResult | null;
  error: string | null;
}

export interface TrendScansState {
  status: "idle" | "preparing" | "scanning" | "done" | "error";
  area: ScanArea | null;
  /** The place couldn't be found (nothing was scanned). */
  error: string | null;
  measures: Partial<Record<IndicatorId, MeasureScan>>;
  /** Monthly NASA maps the whole search reads. */
  totalMaps: number;
  /** Hotspot names, filled in as the place-name service answers. */
  labels: Record<string, string>;
  cancel: () => void;
  /** Try one measure again, or everything when no measure is given. */
  retry: (indicator?: IndicatorId) => void;
  /** Names hotspots that appear after a filter change. */
  requestNames: (hotspots: Hotspot[]) => void;
}

/** Fewer maps per measure when several are scanned, to stay polite to NASA's free services. */
export function gridBudget(measureCount: number): number {
  return measureCount <= 2 ? MAX_GRIDS : 120;
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

export function friendlyError(error: unknown): string {
  if (error instanceof AreaError || error instanceof ScanError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (/took too long/i.test(message)) return "A NASA service took too long to answer. Please try again in a moment.";
  return "Something went wrong while reading NASA data. Check your connection and try again.";
}

/**
 * Scans every measure of the search, one after another, over one area. Changing only how results
 * are filtered never restarts a scan: the key covers what is scanned.
 */
export function useTrendScans(query: TrendQuery | null, view: BBox | null): TrendScansState {
  const [status, setStatus] = useState<TrendScansState["status"]>("idle");
  const [area, setArea] = useState<ScanArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measures, setMeasures] = useState<Partial<Record<IndicatorId, MeasureScan>>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [nonce, setNonce] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const named = useRef(new Set<string>());
  const queryRef = useRef(query);
  queryRef.current = query;

  const needsView = Boolean(query && !query.place && !query.area);
  const key = useMemo(() => (query && query.understood ? `${scanKey(query)}|${needsView ? JSON.stringify(view) : ""}` : null), [query, view, needsView]);

  const update = useCallback((indicator: IndicatorId, change: Partial<MeasureScan>) => {
    setMeasures((current) => (current[indicator] ? { ...current, [indicator]: { ...(current[indicator] as MeasureScan), ...change } } : current));
  }, []);

  const name = useCallback((hotspots: Hotspot[], signal: AbortSignal) => {
    const fresh = hotspots.filter((h) => !named.current.has(h.id));
    fresh.forEach((h) => named.current.add(h.id));
    if (!fresh.length) return;
    void nameHotspots(fresh, (id, label) => !signal.aborted && setLabels((current) => ({ ...current, [id]: label })), signal);
  }, []);

  /** Scans one measure (its plan is already made). */
  const scanOne = useCallback(
    async (measure: MeasureScan, scanArea: ScanArea, signal: AbortSignal) => {
      const current = queryRef.current;
      if (!measure.plan || !measure.availability || !current) return;
      update(measure.indicator, { status: "scanning", error: null, progress: null });
      try {
        const result = await runScan({
          indicator: measure.indicator,
          filter: filterFor(current, measure.indicator),
          area: scanArea,
          plan: measure.plan,
          availability: measure.availability,
          signal,
          onProgress: (progress) => !signal.aborted && update(measure.indicator, { progress }),
        });
        if (signal.aborted) return;
        update(measure.indicator, { status: "done", result });
        name(result.hotspots, signal);
      } catch (err) {
        if (isAbortError(err) || signal.aborted) return;
        update(measure.indicator, { status: "error", error: friendlyError(err) });
      }
    },
    [update, name],
  );

  useEffect(() => {
    controller.current?.abort();
    const current = queryRef.current;
    if (!key || !current || (needsView && !view)) {
      setStatus("idle");
      return;
    }
    const ac = new AbortController();
    controller.current = ac;
    setStatus("preparing");
    setError(null);
    setMeasures(Object.fromEntries(current.indicators.map((id) => [id, { indicator: id, status: "waiting", plan: null, months: [], availability: null, progress: null, result: null, error: null }])));
    setLabels({});
    named.current = new Set();

    (async () => {
      const [scanArea, availabilities] = await Promise.all([areaFor(current, view, ac.signal), Promise.all(current.indicators.map((id) => fetchAvailability(id)))]);
      if (ac.signal.aborted) return;
      setArea(scanArea);
      const budget = gridBudget(current.indicators.length);
      const planned: MeasureScan[] = current.indicators.map((indicator, k) => {
        const months = current.months ?? seasonMonths(current.season ?? INDICATORS[indicator].season, scanArea.center[0]);
        const plan = planPeriod(current.time, months, availabilities[k].window, budget);
        const base: MeasureScan = { indicator, status: "waiting", plan: null, months, availability: availabilities[k], progress: null, result: null, error: null };
        return "error" in plan ? { ...base, status: "error", error: plan.error } : { ...base, plan };
      });
      setMeasures(Object.fromEntries(planned.map((m) => [m.indicator, m])));
      setStatus("scanning");
      for (const measure of planned) {
        if (ac.signal.aborted) return;
        if (measure.status !== "error") await scanOne(measure, scanArea, ac.signal);
      }
      if (!ac.signal.aborted) setStatus("done");
    })().catch((err) => {
      if (isAbortError(err) || ac.signal.aborted) return;
      setError(friendlyError(err));
      setStatus("error");
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setMeasures((current) =>
      Object.fromEntries(Object.entries(current).map(([id, m]) => [id, m && (m.status === "waiting" || m.status === "scanning") ? { ...m, status: "stopped", progress: null } : m])),
    );
    setStatus((current) => (current === "preparing" || current === "scanning" ? "done" : current));
  }, []);

  const measuresRef = useRef(measures);
  measuresRef.current = measures;
  const areaRef = useRef(area);
  areaRef.current = area;

  const retry = useCallback(
    (indicator?: IndicatorId) => {
      const measure = indicator ? measuresRef.current[indicator] : undefined;
      const scanArea = areaRef.current;
      if (!measure || !scanArea || !measure.plan || status === "preparing") {
        setNonce((n) => n + 1);
        return;
      }
      // Re-run one measure under the current search's controller (a new search cancels it).
      if (!controller.current || controller.current.signal.aborted) controller.current = new AbortController();
      const signal = controller.current.signal;
      setStatus("scanning");
      void scanOne(measure, scanArea, signal).then(() => !signal.aborted && setStatus("done"));
    },
    [scanOne, status],
  );

  const requestNames = useCallback(
    (hotspots: Hotspot[]) => {
      const signal = controller.current?.signal;
      if (signal && !signal.aborted) name(hotspots, signal);
    },
    [name],
  );

  const totalMaps = Object.values(measures).reduce((sum, m) => sum + (m?.plan ? m.plan.years.length * m.plan.months.length : 0), 0);
  return { status, area, error, measures, totalMaps, labels, cancel, retry, requestNames };
}
