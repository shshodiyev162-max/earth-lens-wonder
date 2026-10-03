import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Feature } from "geojson";
import { countryAt, loadCountries, type Country, type CountryIndex } from "@/lib/geo/countries";

const HIGHLIGHT_STYLE: L.PathOptions = {
  color: "#22d3ee",
  weight: 2,
  fillColor: "#22d3ee",
  fillOpacity: 0.16,
  interactive: false,
};

interface CountryPickToolProps {
  onPick: (country: Country) => void;
  onCancel: () => void;
}

/**
 * "Pick a country": the country under the pointer lights up with its name, and a click (or tap)
 * selects it. The map can still be dragged and zoomed to find the country. Esc cancels.
 */
export default function CountryPickTool({ onPick, onCancel }: CountryPickToolProps) {
  const map = useMap();
  const callbacks = useRef({ onPick, onCancel });
  callbacks.current = { onPick, onCancel };

  useEffect(() => {
    let index: CountryIndex | null = null;
    let active = true;
    loadCountries().then((loaded) => {
      if (active) index = loaded;
    });

    const container = map.getContainer();
    container.classList.add("map-picking");
    const highlight = L.geoJSON(undefined, { style: HIGHLIGHT_STYLE, interactive: false }).addTo(map);
    const label = document.createElement("span");
    const tooltip = L.tooltip({ permanent: true, direction: "top", offset: [0, -12], className: "country-pick-tip", opacity: 1 }).setContent(label);
    let hovered: Country | null = null;
    let frame = 0;
    let pointer: L.LatLng | null = null;

    const show = (country: Country | null) => {
      if (country !== hovered) {
        highlight.clearLayers();
        if (country) highlight.addData({ type: "Feature", properties: {}, geometry: country.geometry } as Feature);
        hovered = country;
      }
      if (country && pointer) {
        label.textContent = country.name;
        tooltip.setLatLng(pointer);
        if (!map.hasLayer(tooltip)) tooltip.addTo(map);
      } else {
        tooltip.remove();
      }
    };

    const at = (latlng: L.LatLng) => {
      if (!index) return null;
      const point = latlng.wrap();
      return countryAt(index, [point.lat, point.lng]);
    };

    const onMove = (event: L.LeafletMouseEvent) => {
      pointer = event.latlng;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pointer) show(at(pointer));
      });
    };
    const onLeave = () => {
      pointer = null;
      show(null);
    };
    const onClick = (event: L.LeafletMouseEvent) => {
      const country = at(event.latlng);
      if (country) callbacks.current.onPick(country);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") callbacks.current.onCancel();
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);
    map.on("click", onClick);
    window.addEventListener("keydown", onKey);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      map.off("click", onClick);
      window.removeEventListener("keydown", onKey);
      highlight.remove();
      tooltip.remove();
      container.classList.remove("map-picking");
    };
  }, [map]);

  return null;
}
