import { useEffect, useMemo, useState } from "react";
import { findCountry, loadCountries } from "@/lib/geo/countries";
import { fetchBoundary } from "@/lib/geo/geocode";
import type { PolygonGeometry } from "@/lib/geo/geometry";
import { decodeGeometry } from "@/lib/geo/polyline";
import type { ExactArea } from "@/lib/trends/query";

/** The outline of an exact area (a drawn or saved shape, a country, or a place found by search), for highlighting. */
export function useExactAreaGeometry(area: ExactArea | null): PolygonGeometry | null {
  const poly = area?.poly ?? null;
  const country = area?.country ?? null;
  const osm = area?.osm ?? null;
  const decoded = useMemo(() => (poly ? decodeGeometry(poly) : null), [poly]);
  const [countryGeometry, setCountryGeometry] = useState<{ id: string; geometry: PolygonGeometry } | null>(null);
  const [osmGeometry, setOsmGeometry] = useState<{ id: string; geometry: PolygonGeometry } | null>(null);

  // A place found by search: its OpenStreetMap boundary (kept for the session).
  useEffect(() => {
    const match = osm?.match(/^([NWR])(\d+)$/);
    if (!osm || !match || osmGeometry?.id === osm) return;
    const controller = new AbortController();
    fetchBoundary({ type: match[1] as "N" | "W" | "R", id: Number(match[2]) }, { signal: controller.signal })
      .then((geometry) => {
        if (!controller.signal.aborted && geometry) setOsmGeometry({ id: osm, geometry });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [osm, osmGeometry]);

  useEffect(() => {
    if (!country || countryGeometry?.id === country) return;
    let active = true;
    loadCountries()
      .then((index) => {
        const found = index ? findCountry(index, country) : null;
        if (active && found) setCountryGeometry({ id: country, geometry: found.geometry });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [country, countryGeometry]);

  if (poly) return decoded;
  if (country && countryGeometry?.id === country) return countryGeometry.geometry;
  if (osm && osmGeometry?.id === osm) return osmGeometry.geometry;
  return null;
}
