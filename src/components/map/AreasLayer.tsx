import { GeoJSON, Pane, Tooltip } from "react-leaflet";
import type { Feature } from "geojson";
import type { SavedArea } from "@/context/WorkspaceContext";
import { formatArea } from "@/lib/geo/geometry";

/** Saved areas drawn on the map; click one to make it active. */
export default function AreasLayer({
  areas,
  activeId,
  onSelect,
  interactive = true,
}: {
  areas: SavedArea[];
  activeId: string | null;
  onSelect?: (id: string) => void;
  interactive?: boolean;
}) {
  return (
    <Pane name="saved-areas" style={{ zIndex: 440 }}>
      {areas.map((area) => {
        const active = area.id === activeId;
        return (
          <GeoJSON
            key={`${area.id}-${active ? "on" : "off"}`}
            data={{ type: "Feature", properties: {}, geometry: area.geometry } as Feature}
            interactive={interactive}
            style={{
              color: "#ffffff",
              weight: active ? 2.5 : 1.8,
              fillColor: "#ffffff",
              fillOpacity: active ? 0.16 : 0.08,
            }}
            eventHandlers={interactive ? { click: () => onSelect?.(area.id) } : undefined}
          >
            {interactive && (
              <Tooltip direction="top" sticky opacity={0.95}>
                <span className="font-medium">{area.name}</span> · {formatArea(area.areaKm2)}
              </Tooltip>
            )}
          </GeoJSON>
        );
      })}
    </Pane>
  );
}
