import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isAbortError } from "@/lib/async";
import { findCountry, loadCountries } from "@/lib/geo/countries";
import { lookupOsm, reverseGeocode } from "@/lib/geo/geocode";
import { areaKm2, bboxOf, bboxPolygon, centroidOf, circlePolygon, formatLatLng, interiorPoint, type BBox } from "@/lib/geo/geometry";
import type { AnalysisTarget } from "@/lib/analysis/types";

export interface TargetState {
  target: AnalysisTarget | null;
  loading: boolean;
  error: string | null;
}

const num = (value: string | null) => (value === null || value.trim() === "" ? NaN : Number(value));

/** Resolves the URL (?area=, ?osm=, ?country=, ?lat&lon&r=, ?bbox=) into an analysis target. */
export function useAnalysisTarget(params: URLSearchParams): TargetState {
  const { getArea } = useWorkspace();
  const areaId = params.get("area");
  const osm = params.get("osm");
  const countryId = params.get("country");
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
  }, [savedArea, lat, lon, radius, bboxParam, name, context]);

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
          error: index ? "That country is not in TerraVision's map." : "Couldn't load the country outlines. Check your connection and try again.",
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
  return { target: null, loading: false, error: null };
}
