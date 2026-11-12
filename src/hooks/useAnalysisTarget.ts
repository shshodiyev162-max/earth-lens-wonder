import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useResolvedParts, type ResolvedPartsState } from "@/hooks/useResolvedParts";
import { addedParts, partKey, primaryAnalysisPart, type AreaPart } from "@/lib/areas/parts";
import { togetherLabel, type ResolvedPart } from "@/lib/areas/resolve";
import { isAbortError } from "@/lib/async";
import { combineGeometries, combinedAreaKm2, combinedName } from "@/lib/geo/combine";
import { findCountry, loadCountries } from "@/lib/geo/countries";
import { findNamedRegion, regionGeometry } from "@/lib/geo/regions";
import { decodeGeometry } from "@/lib/geo/polyline";
import { lookupOsm, reverseGeocode } from "@/lib/geo/geocode";
import { areaKm2, bboxOf, bboxPolygon, centroidOf, circlePolygon, formatLatLng, interiorPoint, type BBox } from "@/lib/geo/geometry";
import type { AnalysisTarget, TargetPart, TargetRef } from "@/lib/analysis/types";

export interface TargetState {
  target: AnalysisTarget | null;
  loading: boolean;
  error: string | null;
}

const num = (value: string | null) => (value === null || value.trim() === "" ? NaN : Number(value));

/**
 * Resolves the URL into an analysis target: the first place from ?area=, ?osm=, ?country=, ?region=,
 * ?poly=, ?lat&lon&r= or ?bbox=, and any places added to it from ?add= (read as one area).
 */
export function useAnalysisTarget(params: URLSearchParams): TargetState {
  const primary = usePrimaryTarget(params);
  const added = useResolvedParts(addedParts(params));
  const first = primaryAnalysisPart(params);
  const state = withAddedParts(primary, added, first);
  // While a place being added loads, the area so far stays on screen (and nothing is read again).
  const shown = useRef<AnalysisTarget | null>(null);
  if (state.target || !state.loading) shown.current = state.target;
  if (!state.target && state.loading && !primary.loading && shown.current) return { target: shown.current, loading: true, error: null };
  return state;
}

/** How the page refers to a part when it is the only one. */
export function refForPart(part: AreaPart): TargetRef {
  switch (part.kind) {
    case "country":
      return { type: "country", id: part.id };
    case "region":
      return { type: "region", label: part.label };
    case "place":
      return { type: "place", text: part.text };
    case "osm":
      return { type: "osm", osm: part.osm };
    case "poly":
      return { type: "poly", poly: part.poly };
    case "point":
      return { type: "point", lat: part.lat, lon: part.lon, radiusKm: part.radiusKm };
    case "bbox":
      return { type: "bbox", bbox: part.bbox };
    case "area":
      return { type: "area", id: part.id };
  }
}

function targetFromPart(part: ResolvedPart): AnalysisTarget {
  return {
    name: part.name,
    context: part.context,
    geometry: part.geometry,
    bbox: bboxOf(part.geometry),
    center: interiorPoint(part.geometry),
    areaKm2: part.areaKm2,
    kind: part.part.kind === "poly" || part.part.kind === "bbox" ? "drawn" : "place",
    ref: refForPart(part.part),
  };
}

/** The first place and the ones added to it, as one target. Nothing runs until every part is loaded. */
export function withAddedParts(primary: TargetState, added: ResolvedPartsState, first: AreaPart | null): TargetState {
  if (!added.parts.length) return primary;
  if (primary.loading || added.loading) return { target: null, loading: true, error: null };
  const error = [primary.error, ...added.errors].filter(Boolean).join(" ") || null;

  const pieces: TargetPart[] = [];
  const seen = new Set<string>();
  const keep = (piece: TargetPart) => {
    if (seen.has(piece.key)) return;
    seen.add(piece.key);
    pieces.push(piece);
  };
  if (primary.target) {
    const { name, context, geometry, areaKm2 } = primary.target;
    keep({ key: first ? partKey(first) : "first", name, context, geometry, areaKm2 });
  }
  for (const part of added.parts) if (part) keep({ key: part.key, name: part.name, context: part.context, geometry: part.geometry, areaKm2: part.areaKm2 });

  if (!pieces.length) return { target: null, loading: false, error };
  if (pieces.length === 1) {
    const only = primary.target ?? targetFromPart(added.parts.find((p): p is ResolvedPart => p !== null) as ResolvedPart);
    return { target: only, loading: false, error };
  }
  const geometry = combineGeometries(pieces.map((p) => p.geometry));
  const firstAdded = added.parts.find((p): p is ResolvedPart => p !== null);
  return {
    target: {
      name: combinedName(pieces.map((p) => p.name)),
      context: togetherLabel(pieces.length),
      geometry,
      bbox: bboxOf(geometry),
      center: centroidOf(geometry),
      areaKm2: combinedAreaKm2(pieces.map((p) => p.geometry)),
      kind: "place",
      ref: primary.target?.ref ?? refForPart((firstAdded as ResolvedPart).part),
      parts: pieces,
    },
    loading: false,
    error,
  };
}

/** The first place, from the page's usual keys. */
function usePrimaryTarget(params: URLSearchParams): TargetState {
  const { getArea } = useWorkspace();
  const areaId = params.get("area");
  const osm = params.get("osm");
  const countryId = params.get("country");
  const regionLabel = params.get("region");
  const poly = params.get("poly");
  const lat = num(params.get("lat"));
  const lon = num(params.get("lon"));
  const radius = num(params.get("r"));
  const bboxParam = params.get("bbox");
  const name = params.get("name");
  const context = params.get("ctx") ?? undefined;

  const savedArea = areaId ? getArea(areaId) : undefined;

  // Synchronous targets (saved area, point, bbox).
  const direct = useMemo<AnalysisTarget | null>(() => {
    if (savedArea) {
      return {
        name: savedArea.name,
        context: "Your area",
        geometry: savedArea.geometry,
        bbox: savedArea.bbox,
        center: savedArea.center,
        areaKm2: savedArea.areaKm2,
        kind: savedArea.kind === "place" ? "place" : "drawn",
        ref: { type: "area", id: savedArea.id },
      };
    }
    const polygon = poly ? decodeGeometry(poly) : null;
    if (polygon && poly) {
      return {
        name: name ?? "Selected area",
        context,
        geometry: polygon,
        bbox: bboxOf(polygon),
        center: centroidOf(polygon),
        areaKm2: areaKm2(polygon),
        kind: "drawn",
        ref: { type: "poly", poly },
      };
    }
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const r = Number.isFinite(radius) && radius > 0 ? Math.min(radius, 500) : 10;
      const geometry = circlePolygon([lat, lon], r);
      return {
        name: name ?? formatLatLng([lat, lon], 3),
        context: context ?? `${r} km radius`,
        geometry,
        bbox: bboxOf(geometry),
        center: [lat, lon],
        areaKm2: areaKm2(geometry),
        kind: "point",
        ref: { type: "point", lat, lon, radiusKm: r },
      };
    }
    if (bboxParam) {
      const parts = bboxParam.split(",").map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite) && parts[0] < parts[2] && parts[1] < parts[3]) {
        const bbox = parts as BBox;
        const geometry = bboxPolygon(bbox);
        return {
          name: name ?? "Selected box",
          context,
          geometry,
          bbox,
          center: centroidOf(geometry),
          areaKm2: areaKm2(geometry),
          kind: "drawn",
          ref: { type: "bbox", bbox },
        };
      }
    }
    return null;
  }, [savedArea, poly, lat, lon, radius, bboxParam, name, context]);

  const [osmState, setOsmState] = useState<{ key: string; target: AnalysisTarget | null; error: string | null } | null>(null);

  useEffect(() => {
    if (direct || !osm) return;
    const controller = new AbortController();
    setOsmState({ key: osm, target: null, error: null });
    lookupOsm(osm, { signal: controller.signal })
      .then((details) => {
        if (!details) {
          setOsmState({ key: osm, target: null, error: "That place could not be found in OpenStreetMap." });
          return;
        }
        const geometry = details.geometry ?? circlePolygon(details.place.center, 10);
        setOsmState({
          key: osm,
          error: null,
          target: {
            name: name ?? details.place.name,
            context: context ?? details.place.context,
            geometry,
            bbox: bboxOf(geometry),
            center: details.place.center,
            areaKm2: areaKm2(geometry),
            kind: "place",
            ref: { type: "osm", osm },
          },
        });
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setOsmState({ key: osm, target: null, error: "Couldn't load the place boundary. Check your connection and try again." });
      });
    return () => controller.abort();
  }, [direct, osm, name, context]);

  // A country picked on the map: its outline comes from the bundled Natural Earth borders.
  const [countryState, setCountryState] = useState<{ key: string; target: AnalysisTarget | null; error: string | null } | null>(null);

  useEffect(() => {
    if (direct || osm || !countryId) return;
    let active = true;
    loadCountries().then((index) => {
      if (!active) return;
      const country = index ? findCountry(index, countryId) : null;
      if (!country) {
        setCountryState({
          key: countryId,
          target: null,
          error: index ? "That country is not in TerraScope's map." : "Couldn't load the country outlines. Check your connection and try again.",
        });
        return;
      }
      setCountryState({
        key: countryId,
        error: null,
        target: {
          name: name ?? country.name,
          context: context ?? "Country",
          geometry: country.geometry,
          bbox: country.bbox,
          center: interiorPoint(country.geometry),
          areaKm2: areaKm2(country.geometry),
          kind: "place",
          ref: { type: "country", id: country.id },
        },
      });
    });
    return () => {
      active = false;
    };
  }, [direct, osm, countryId, name, context]);

  // A named region, sea or ocean: its shape is bundled (a sea's water, a box, or its countries).
  const [regionState, setRegionState] = useState<{ key: string; target: AnalysisTarget | null; error: string | null } | null>(null);

  useEffect(() => {
    if (direct || osm || countryId || !regionLabel) return;
    let active = true;
    const region = findNamedRegion(regionLabel);
    (region ? regionGeometry(region) : Promise.resolve(null)).then((geometry) => {
      if (!active) return;
      if (!region || !geometry) {
        setRegionState({ key: regionLabel, target: null, error: "That region isn't in TerraScope's list of known places." });
        return;
      }
      setRegionState({
        key: regionLabel,
        error: null,
        target: {
          name: name ?? region.label,
          context: context ?? region.context,
          geometry,
          bbox: bboxOf(geometry),
          center: interiorPoint(geometry),
          areaKm2: areaKm2(geometry),
          kind: "place",
          ref: { type: "region", label: region.label },
        },
      });
    });
    return () => {
      active = false;
    };
  }, [direct, osm, countryId, regionLabel, name, context]);

  // Give dropped points a human-readable name.
  const [pointName, setPointName] = useState<{ key: string; name: string } | null>(null);
  const pointKey = direct?.kind === "point" && !name ? `${lat},${lon}` : null;
  useEffect(() => {
    if (!pointKey) return;
    const controller = new AbortController();
    reverseGeocode([lat, lon], { signal: controller.signal, zoom: 10 })
      .then((label) => label && setPointName({ key: pointKey, name: `Near ${label}` }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pointKey, lat, lon]);

  if (direct) {
    if (pointKey && pointName?.key === pointKey) return { target: { ...direct, name: pointName.name }, loading: false, error: null };
    return { target: direct, loading: false, error: null };
  }
  if (areaId && !savedArea) {
    return { target: null, loading: false, error: "That saved area no longer exists on this device." };
  }
  if (osm) {
    if (!osmState || osmState.key !== osm) return { target: null, loading: true, error: null };
    return { target: osmState.target, loading: !osmState.target && !osmState.error, error: osmState.error };
  }
  if (countryId) {
    if (!countryState || countryState.key !== countryId) return { target: null, loading: true, error: null };
    return { target: countryState.target, loading: false, error: countryState.error };
  }
  if (regionLabel) {
    if (!regionState || regionState.key !== regionLabel) return { target: null, loading: true, error: null };
    return { target: regionState.target, loading: false, error: regionState.error };
  }
  return { target: null, loading: false, error: null };
}
