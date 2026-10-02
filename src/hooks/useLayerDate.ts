import { useEffect, useMemo, useState } from "react";
import { isTimeEnabled, type GibsLayer } from "@/lib/gibs/catalog";
import { defaultDateFor, fetchTimeDomain, provisionalDate, resolveInDomain, type DateResolution, type TimeDomain } from "@/lib/gibs/time";

export interface LayerDateState {
  /** Date to request tiles for (null for static layers). */
  date: string | null;
  resolution: DateResolution;
  domain: TimeDomain | null;
  /** Latest date with imagery for this layer (once known). */
  latest: string | null;
  earliest: string | null;
  /** Default date (latest complete day / composite). */
  defaultDate: string | null;
  loading: boolean;
  error: boolean;
}

/**
 * Resolves the date the user asked for against the layer's real availability.
 * `requested === null` means "latest available".
 */
export function useLayerDate(layer: GibsLayer, requested: string | null): LayerDateState {
  const timeEnabled = isTimeEnabled(layer);
  const [domainState, setDomainState] = useState<{ layerId: string; domain: TimeDomain | null; error: boolean } | null>(null);

  useEffect(() => {
    if (!timeEnabled) return;
    let cancelled = false;
    fetchTimeDomain(layer)
      .then((domain) => {
        if (!cancelled) setDomainState({ layerId: layer.id, domain, error: false });
      })
      .catch(() => {
        if (!cancelled) setDomainState({ layerId: layer.id, domain: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [layer, timeEnabled]);

  return useMemo<LayerDateState>(() => {
    if (!timeEnabled) {
      return { date: null, resolution: "static", domain: null, latest: null, earliest: null, defaultDate: null, loading: false, error: false };
    }
    const current = domainState && domainState.layerId === layer.id ? domainState : null;
    if (!current) {
      return {
        date: provisionalDate(layer, requested),
        resolution: "unchecked",
        domain: null,
        latest: null,
        earliest: null,
        defaultDate: null,
        loading: true,
        error: false,
      };
    }
    if (!current.domain) {
      return {
        date: provisionalDate(layer, requested),
        resolution: "unchecked",
        domain: null,
        latest: null,
        earliest: null,
        defaultDate: null,
        loading: false,
        error: current.error,
      };
    }
    const defaultDate = defaultDateFor(layer, current.domain);
    const resolved = requested ? resolveInDomain(current.domain, requested) : { date: defaultDate, resolution: "latest" as DateResolution };
    return {
      date: resolved.date,
      resolution: requested ? resolved.resolution : "exact",
      domain: current.domain,
      latest: current.domain.latest,
      earliest: current.domain.earliest,
      defaultDate,
      loading: false,
      error: false,
    };
  }, [domainState, layer, requested, timeEnabled]);
}
