import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Feature } from "geojson";
import { countryAt, loadCountries, type Country, type CountryIndex } from "@/lib/geo/countries";
import { loadWaterShapes, roughOutline, waterAt, type Water } from "@/lib/geo/waters";
import { lakeAt, loadLakeShapes, type Lake } from "@/lib/geo/lakes";
import type { PolygonGeometry } from "@/lib/geo/geometry";

const HIGHLIGHT_STYLE: L.PathOptions = {
  color: "#ffffff",
  weight: 2,
  fillColor: "#ffffff",
  fillOpacity: 0.16,
  interactive: false,
};

/** A sea or ocean is drawn dashed, so it stands out from the coastlines around it. */
const WATER_STYLE: L.PathOptions = { ...HIGHLIGHT_STYLE, color: "#ffffff", weight: 2.5, dashArray: "7 5", fillOpacity: 0.14 };

interface CountryPickToolProps {
  onPick: (country: Country) => void;
  /** The sea or ocean under the pointer was clicked. */
  onPickWater?: (water: Water) => void;
  /** The lake under the pointer was clicked (with its outline). Country outlines include their lakes, so a lake is found first. */
  onPickLake?: (lake: Lake, outline: PolygonGeometry) => void;
  onCancel: () => void;
}

type Target = { kind: "country"; country: Country } | { kind: "water"; water: Water } | { kind: "lake"; lake: Lake; outline: PolygonGeometry };

const nameOf = (target: Target) => (target.kind === "country" ? target.country.name : target.kind === "lake" ? target.lake.label : target.water.label);

/**
 * "Pick a country, lake or sea": what is under the pointer lights up with its name, and
 * a click (or tap) selects it. The map can still be dragged and zoomed. Esc cancels.
 */
export default function CountryPickTool({ onPick, onPickWater, onPickLake, onCancel }: CountryPickToolProps) {
  const map = useMap();
  const callbacks = useRef({ onPick, onPickWater, onPickLake, onCancel });
  callbacks.current = { onPick, onPickWater, onPickLake, onCancel };

  useEffect(() => {
    let index: CountryIndex | null = null;
    let waters: Map<string, PolygonGeometry> | null = null;
    let lakes: Map<string, PolygonGeometry> | null = null;
    let active = true;
    loadCountries().then((loaded) => {
      if (active) index = loaded;
    });
    loadWaterShapes().then((loaded) => {
      if (active) waters = loaded;
    });
    loadLakeShapes().then((loaded) => {
      if (active) lakes = loaded;
    });

    const container = map.getContainer();
    container.classList.add("map-picking");
    const highlight = L.geoJSON(undefined, { style: HIGHLIGHT_STYLE, interactive: false }).addTo(map);
    const label = document.createElement("span");
    const tooltip = L.tooltip({ permanent: true, direction: "top", offset: [0, -12], className: "country-pick-tip", opacity: 1 }).setContent(label);
    let hovered: Country | Water | Lake | null = null;
    let frame = 0;
    let pointer: L.LatLng | null = null;

    const show = (target: Target | null) => {
      const shape = target ? (target.kind === "country" ? target.country : target.kind === "lake" ? target.lake : target.water) : null;
      if (shape !== hovered) {
        highlight.clearLayers();
        if (target?.kind === "country") highlight.addData({ type: "Feature", properties: {}, geometry: target.country.geometry } as Feature);
        if (target?.kind === "water" || target?.kind === "lake") {
          const geometry = target.kind === "lake" ? target.outline : (waters?.get(target.water.label) ?? roughOutline(target.water));
          highlight.addData({ type: "Feature", properties: {}, geometry } as Feature);
          highlight.setStyle(WATER_STYLE);
        } else highlight.setStyle(HIGHLIGHT_STYLE);
        hovered = shape;
      }
      if (target && pointer) {
        label.textContent = nameOf(target);
        tooltip.setLatLng(pointer);
        if (!map.hasLayer(tooltip)) tooltip.addTo(map);
      } else {
        tooltip.remove();
      }
    };

    const at = (latlng: L.LatLng): Target | null => {
      if (!index) return null;
      const point = latlng.wrap();
      const lake = callbacks.current.onPickLake ? lakeAt([point.lat, point.lng], lakes) : null;
      const outline = lake ? lakes?.get(lake.label) : null;
      if (lake && outline) return { kind: "lake", lake, outline };
      const country = countryAt(index, [point.lat, point.lng]);
      if (country) return { kind: "country", country };
      const water = callbacks.current.onPickWater ? waterAt([point.lat, point.lng]) : null;
      return water ? { kind: "water", water } : null;
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
      const target = at(event.latlng);
      if (target?.kind === "country") callbacks.current.onPick(target.country);
      if (target?.kind === "water") callbacks.current.onPickWater?.(target.water);
      if (target?.kind === "lake") callbacks.current.onPickLake?.(target.lake, target.outline);
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
