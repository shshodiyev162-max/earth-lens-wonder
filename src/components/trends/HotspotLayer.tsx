import type { Feature } from "geojson";
import { GeoJSON, Pane, Tooltip } from "react-leaflet";
import type { PolygonGeometry } from "@/lib/geo/geometry";
import type { HotspotDetail } from "@/lib/trends/scan";

interface HotspotLayerProps {
  hotspots: HotspotDetail[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Outline of the whole scanned area. */
  area: PolygonGeometry | null;
}

/** Numbered hotspot outlines above the change map; the selected one is highlighted. */
export default function HotspotLayer({ hotspots, selectedId, onSelect, area }: HotspotLayerProps) {
  return (
    <>
      {area && (
        <Pane name="trend-area" style={{ zIndex: 425, pointerEvents: "none" }}>
          <GeoJSON
            key={JSON.stringify(area).length}
            data={{ type: "Feature", properties: {}, geometry: area } as Feature}
            interactive={false}
            style={{ color: "#e2e8f0", weight: 1.5, opacity: 0.8, dashArray: "5 6", fill: false }}
          />
        </Pane>
      )}
      <Pane name="trend-hotspots" style={{ zIndex: 450 }}>
        {hotspots.map((hotspot) => {
          const selected = hotspot.id === selectedId;
          return (
            <GeoJSON
              key={`${hotspot.id}-${selected ? "on" : "off"}-${hotspot.refined ? "r" : "c"}`}
              data={{ type: "Feature", properties: {}, geometry: hotspot.geometry } as Feature}
              style={{
                color: selected ? "#fde047" : "#ffffff",
                weight: selected ? 3 : 1.8,
                opacity: 1,
                fillColor: selected ? "#fde047" : "#ffffff",
                fillOpacity: selected ? 0.12 : 0.04,
              }}
              eventHandlers={{ click: () => onSelect(hotspot.id) }}
            >
              <Tooltip permanent direction="center" className="hotspot-rank" interactive={false} pane="tooltipPane" opacity={1}>
                {hotspot.rank}
              </Tooltip>
            </GeoJSON>
          );
        })}
      </Pane>
    </>
  );
}
