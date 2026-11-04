import { useEffect, useMemo, useState } from "react";
import { findCountry, loadCountries } from "@/lib/geo/countries";
import type { PolygonGeometry } from "@/lib/geo/geometry";
import { decodeGeometry } from "@/lib/geo/polyline";
import type { ExactArea } from "@/lib/trends/query";

/** The outline of an area chosen on the map (a drawn or saved shape, or a country), for highlighting. */
export function useExactAreaGeometry(area: ExactArea | null): PolygonGeometry | null {
  const poly = area?.poly ?? null;
  const country = area?.country ?? null;
  const decoded = useMemo(() => (poly ? decodeGeometry(poly) : null), [poly]);
  const [countryGeometry, setCountryGeometry] = useState<{ id: string; geometry: PolygonGeometry } | null>(null);

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
  return null;
}
